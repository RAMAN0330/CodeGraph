// HTTP endpoints declared in a repository, and what each one reaches. Zero
// imports: the server's analysis job runs this while file contents are still
// in memory (see server/src/analysis/sharedRules.ts).
//
// Reach starts from the functions the handler itself calls — not from the
// whole route file, which in many apps registers every route and would make
// each endpoint appear to reach everything.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'ANY';
export interface Endpoint {
  method: HttpMethod;
  path: string;
  file: string;
  line: number;
  handler: string | null;
  framework: 'express' | 'fastapi' | 'flask' | 'django' | 'go' | 'spring' | 'nextjs';
}
export interface EndpointWithReach extends Endpoint {
  calls: string[];          // functions the handler calls (known to the analysis)
  reach: string[];          // files reached, nearest first (capped)
  reachCount: number;
  tables: string[];         // database tables used somewhere in that reach
}

const TEST_PATH = /(\.test\.|\.spec\.|_test\.|(^|\/)test_|__tests__|(^|\/)tests?\/)/i;
const MAX_REACH_LISTED = 40;
const HANDLER_LINES = 40;

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

function method(value: string): HttpMethod {
  const m = value.toUpperCase();
  return (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m) ? m : 'ANY') as HttpMethod;
}

function lastIdentifier(args: string): string | null {
  // "auth, validate(schema), usersController.list)" -> "list"; inline arrow/function -> null
  if (/=>|\bfunction\b|\blambda\b|\bfunc\s*\(/.test(args)) return null;
  const parts = args.split(',').map(s => s.trim().replace(/\)+\s*;?\s*$/, '')).filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const m = last.match(/([A-Za-z_$][\w$]*)(?:\.as_view\(\))?$/);
  return m ? m[1] : null;
}

function nextPathFromFile(path: string): { route: string; kind: 'app' | 'pages' } | null {
  const app = path.match(/(?:^|\/)app\/(.*?)\/?route\.(?:ts|js)x?$/);
  if (app) return { route: toRoute(app[1]), kind: 'app' };
  const pages = path.match(/(?:^|\/)pages\/(api\/.*)\.(?:ts|js)x?$/);
  if (pages) return { route: toRoute(pages[1].replace(/\/index$/, '')), kind: 'pages' };
  return null;
}

function toRoute(segments: string): string {
  const parts = segments.split('/').filter(seg => seg && !/^\(.*\)$/.test(seg)).map(seg => seg.replace(/^\[\.\.\.(\w+)\]$/, '*$1').replace(/^\[(\w+)\]$/, ':$1'));
  return '/' + parts.join('/');
}

export function extractEndpoints(files: Array<{ path: string; content: string | null }>): Endpoint[] {
  const found: Endpoint[] = [];
  for (const { path, content } of files) {
    if (!content || TEST_PATH.test(path)) continue;
    const ext = path.split('.').pop()!.toLowerCase();
    const push = (e: Omit<Endpoint, 'file'>) => found.push({ ...e, file: path });

    if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) {
      // Router-style receivers only: `axios.get('/x')` or `cache.get('k', cb)` are not routes.
      const re = /\b(app|server|api|router|routes|fastify|[A-Za-z_$][\w$]*(?:Router|Routes|App))\.(get|post|put|patch|delete|options|head|all)\(\s*(['"`])(\/[^'"`]*)\3\s*,([^\n]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) push({ method: m[2] === 'all' ? 'ANY' : method(m[2]), path: m[4], line: lineAt(content, m.index), handler: lastIdentifier(m[5]), framework: 'express' });
      const next = nextPathFromFile(path);
      if (next?.kind === 'app') {
        const ex = /export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
        while ((m = ex.exec(content))) push({ method: method(m[1]), path: next.route, line: lineAt(content, m.index), handler: m[1], framework: 'nextjs' });
      } else if (next?.kind === 'pages' && /export\s+default/.test(content)) {
        push({ method: 'ANY', path: next.route, line: lineAt(content, content.search(/export\s+default/)), handler: null, framework: 'nextjs' });
      }
    } else if (ext === 'py') {
      const deco = /@(\w+)\.(get|post|put|patch|delete|route|api_route)\(\s*(?:path\s*=\s*)?[rf]?(['"])([^'"]*)\3([^\n]*)\)\s*\n(?:[ \t]*@[^\n]*\n)*[ \t]*(?:async\s+)?def\s+(\w+)/g;
      let m: RegExpExecArray | null;
      while ((m = deco.exec(content))) {
        const verb = m[2];
        let mth: HttpMethod = 'GET';
        if (verb === 'route' || verb === 'api_route') {
          const methods = m[5].match(/methods\s*=\s*\[\s*['"](\w+)['"]/);
          mth = methods ? method(methods[1]) : verb === 'route' ? 'GET' : 'ANY';
        } else mth = method(verb);
        push({ method: mth, path: m[4] || '/', line: lineAt(content, m.index), handler: m[6], framework: verb === 'route' ? 'flask' : 'fastapi' });
      }
      if (/(^|\/)urls\.py$/.test(path)) {
        const dj = /\b(?:re_)?path\(\s*r?(['"])([^'"]*)\1\s*,\s*([\w.]+(?:\.as_view\(\))?)/g;
        while ((m = dj.exec(content))) {
          if (m[3].startsWith('include')) continue;
          const handler = m[3].replace(/\.as_view(\(\))?$/, '').split('.').pop() || null;
          push({ method: 'ANY', path: '/' + m[2].replace(/^\^|\$$/g, '').replace(/^\//, ''), line: lineAt(content, m.index), handler, framework: 'django' });
        }
      }
    } else if (ext === 'go') {
      const re = /\b\w+\.(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete|HandleFunc|Handle)\(\s*"([^"]+)"\s*,\s*([^\n]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        let mth: HttpMethod = /^Handle/.test(m[1]) ? 'ANY' : method(m[1]);
        let route = m[2];
        const pattern = route.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/.*)$/);
        if (pattern) { mth = method(pattern[1]); route = pattern[2]; }
        if (!route.startsWith('/')) continue;
        push({ method: mth, path: route, line: lineAt(content, m.index), handler: lastIdentifier(m[3]), framework: 'go' });
      }
    } else if (ext === 'java' || ext === 'kt') {
      const re = /@(Get|Post|Put|Patch|Delete|Request)Mapping\(\s*(?:(?:value|path)\s*=\s*)?"([^"]*)"[^)]*\)\s*(?:@[^\n]*\s*)*(?:(?:public|private|protected|suspend|fun)\s+)*[\w<>[\],.? ]*?\b(\w+)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) push({ method: m[1] === 'Request' ? 'ANY' : method(m[1]), path: m[2] || '/', line: lineAt(content, m.index), handler: m[3], framework: 'spring' });
    }
  }
  const seen = new Set<string>();
  return found.filter(e => {
    const key = `${e.method} ${e.path} ${e.file}:${e.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

function endpointOf(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

// Source the handler runs: its function body when it's a named function the
// analysis knows, otherwise the lines following the route declaration.
function handlerSource(e: Endpoint, content: string | null, fnStats: Record<string, any>): string {
  const fn = e.handler ? fnStats[e.handler] : null;
  if (fn && fn.file === e.file && typeof fn.code === 'string') return fn.code;
  if (e.handler) {
    const anyFile = Object.entries(fnStats).find(([name, s]: [string, any]) => (name === e.handler || name.endsWith(`.${e.handler}`)) && typeof s?.code === 'string');
    if (anyFile) return (anyFile[1] as any).code;
  }
  if (!content) return '';
  return content.split('\n').slice(e.line - 1, e.line - 1 + HANDLER_LINES).join('\n');
}

export function resolveEndpointReach(
  endpoints: Endpoint[],
  data: { files: Array<{ path: string; content?: string | null }>; connections: any[]; fnStats: Record<string, any>; tableUsage?: Record<string, Array<{ file: string; kinds: string[] }>> },
): EndpointWithReach[] {
  const content = new Map(data.files.map(f => [f.path, f.content ?? null]));
  const uses = new Map<string, Set<string>>();
  (data.connections || []).forEach((c: any) => {
    const definer = endpointOf(c.source);
    const caller = endpointOf(c.target);
    if (definer === caller) return;
    if (!uses.has(caller)) uses.set(caller, new Set());
    uses.get(caller)!.add(definer);
  });
  const tablesByFile = new Map<string, Set<string>>();
  Object.entries(data.tableUsage || {}).forEach(([table, list]) => list.forEach(u => {
    if (u.kinds.includes('migration')) return;
    if (!tablesByFile.has(u.file)) tablesByFile.set(u.file, new Set());
    tablesByFile.get(u.file)!.add(table);
  }));
  const fnNames = Object.keys(data.fnStats || {});

  return endpoints.map(e => {
    const source = handlerSource(e, content.get(e.file) ?? null, data.fnStats || {});
    const tokens = new Set(source.match(/[A-Za-z_$][\w$]*/g) || []);
    const calls = fnNames.filter(name => name !== e.handler && (tokens.has(name) || tokens.has(name.split('.').pop()!))).slice(0, 50);
    // First hop: files defining what the handler calls; then plain file
    // dependencies, breadth-first so the nearest files are listed first.
    const start = [...new Set(calls.map(name => data.fnStats[name]?.file).filter((f): f is string => Boolean(f) && f !== e.file))];
    const seen = new Set<string>([e.file, ...start]);
    const order = [...start];
    const queue = [...start];
    while (queue.length) for (const next of uses.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); order.push(next); queue.push(next); }
    const tables = new Set<string>();
    order.forEach(f => tablesByFile.get(f)?.forEach(t => tables.add(t)));
    // The route's own file often holds many handlers; count its tables only
    // when this handler's source names them.
    const lowerSource = source.toLowerCase();
    tablesByFile.get(e.file)?.forEach(t => { if (lowerSource.includes(t.toLowerCase())) tables.add(t); });
    return { ...e, calls, reach: order.slice(0, MAX_REACH_LISTED), reachCount: order.length, tables: [...tables].sort() };
  });
}
