// Which repository files a source file imports, so calls can be bound to the
// definition the file can actually see instead of whichever file happened to
// define a function with that name first. JS/TS and Python imports are
// resolved and required; Go/JVM fall back to same-package, then unique-name
// binding; other languages to unique-name binding (see bindCall).

const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte'];
const JS_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/i;
const PY_FILE = /\.pyi?$/i;

function dirname(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function normalize(path: string): string | null {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); } else out.push(seg);
  }
  return out.join('/');
}

function commonPrefix(a: string, b: string): number {
  const x = a.split('/'), y = b.split('/');
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i;
}

export interface PathIndex { paths: Set<string>; byBase: Map<string, string[]> }

export function indexPaths(paths: string[]): PathIndex {
  const byBase = new Map<string, string[]>();
  paths.forEach(p => {
    const base = p.split('/').pop()!;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(p);
  });
  return { paths: new Set(paths), byBase };
}

// Among files whose path ends with `suffix` (at a folder boundary), the one
// sharing the most leading folders with the importing file — how aliases
// like "@/components/x" and absolute Python imports usually resolve.
function bySuffix(suffix: string, from: string, index: PathIndex): string | null {
  const candidates = (index.byBase.get(suffix.split('/').pop()!) ?? []).filter(p => p === suffix || p.endsWith(`/${suffix}`));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => commonPrefix(b, from) - commonPrefix(a, from) || a.length - b.length)[0];
}

function resolveJs(spec: string, from: string, index: PathIndex): string | null {
  const tryBase = (base: string): string | null => {
    const stripped = base.replace(/\.(?:[cm]?js|jsx)$/, '');
    for (const candidate of [base, ...JS_EXT.map(e => stripped + e), ...JS_EXT.map(e => `${base}/index${e}`)]) {
      if (index.paths.has(candidate)) return candidate;
    }
    return null;
  };
  if (spec.startsWith('.')) {
    const target = normalize(`${dirname(from)}/${spec}`);
    return target === null ? null : tryBase(target);
  }
  const alias = spec.match(/^(?:@|~|#)\/(.+)$/);
  if (alias) {
    for (const suffix of [`src/${alias[1]}`, alias[1]]) {
      for (const candidate of [suffix, ...JS_EXT.map(e => suffix.replace(/\.(?:[cm]?js|jsx)$/, '') + e), ...JS_EXT.map(e => `${suffix}/index${e}`)]) {
        const hit = bySuffix(candidate, from, index);
        if (hit) return hit;
      }
    }
  }
  return null; // a package, not a repository file
}

function resolvePyModule(module: string, from: string, index: PathIndex): string | null {
  const rel = module.replace(/\./g, '/');
  for (const candidate of [`${rel}.py`, `${rel}/__init__.py`, `${rel}.pyi`]) {
    if (index.paths.has(candidate)) return candidate;
    const hit = bySuffix(candidate, from, index);
    if (hit) return hit;
  }
  return null;
}

// Files a JS/TS module re-exports (`export * from`, `export { x } from`) —
// followed so that importing a barrel index counts as importing its sources.
export function resolveReexports(from: string, content: string | null, index: PathIndex): Set<string> {
  const found = new Set<string>();
  if (!content || !JS_FILE.test(from)) return found;
  for (const m of content.matchAll(/\bexport\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
    const p = resolveJs(m[1], from, index);
    if (p && p !== from) found.add(p);
  }
  return found;
}

// Imports plus whatever imported barrels re-export, a few levels deep.
export function visibleFiles(direct: Set<string>, reexports: Map<string, Set<string>>, depth = 3): Set<string> {
  const seen = new Set(direct);
  let frontier = [...direct];
  for (let level = 0; level < depth && frontier.length; level++) {
    const next: string[] = [];
    for (const f of frontier) for (const r of reexports.get(f) ?? []) if (!seen.has(r)) { seen.add(r); next.push(r); }
    frontier = next;
  }
  return seen;
}

export function resolveImports(from: string, content: string | null, index: PathIndex): Set<string> {
  const found = new Set<string>();
  if (!content) return found;
  const add = (p: string | null) => { if (p && p !== from) found.add(p); };

  if (JS_FILE.test(from)) {
    const patterns = [
      /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
      /\bimport\s*['"]([^'"]+)['"]/g,
      /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) for (const m of content.matchAll(re)) add(resolveJs(m[1], from, index));
  } else if (/\.html?$/i.test(from)) {
    // Scripts the page loads: <script src="./app.js">.
    for (const m of content.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      const spec = m[1].startsWith('/') ? m[1].slice(1) : m[1].startsWith('.') ? m[1] : `./${m[1]}`;
      add(spec.startsWith('.') ? resolveJs(spec, from, index) : (index.paths.has(spec) ? spec : resolveJs(`./${spec}`, '', index)));
    }
  } else if (PY_FILE.test(from)) {
    for (const m of content.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+\(?([^\n#)]+)/gm)) {
      const dots = m[1].length;
      const names = m[3].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      if (dots) {
        let base = dirname(from);
        for (let i = 1; i < dots; i++) base = dirname(base);
        const modulePath = [base, m[2].replace(/\./g, '/')].filter(Boolean).join('/');
        for (const candidate of [`${modulePath}.py`, `${modulePath}/__init__.py`]) if (index.paths.has(candidate)) add(candidate);
        // "from . import views" imports modules, not names
        names.forEach(n => { const p = `${modulePath ? modulePath + '/' : ''}${n}.py`; if (index.paths.has(p)) add(p); });
      } else if (m[2]) {
        add(resolvePyModule(m[2], from, index));
        names.forEach(n => add(resolvePyModule(`${m[2]}.${n}`, from, index)));
      }
    }
    for (const m of content.matchAll(/^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm)) {
      m[1].split(',').forEach(mod => add(resolvePyModule(mod.trim(), from, index)));
    }
  }
  return found;
}

const PACKAGE_SCOPED = /\.(?:go|java|kt|kts|scala|cs)$/i;

// Calls never cross languages: a Go test can't call a TypeScript function,
// and a JSON or Markdown file calls nothing at all.
const FAMILIES: Array<[RegExp, string]> = [
  [JS_FILE, 'js'], [PY_FILE, 'py'], [/\.go$/i, 'go'], [/\.(?:java|kt|kts|scala)$/i, 'jvm'], [/\.cs$/i, 'cs'],
  [/\.rb$/i, 'rb'], [/\.php$/i, 'php'], [/\.rs$/i, 'rs'], [/\.(?:c|h|cc|cpp|hpp|cxx)$/i, 'c'], [/\.swift$/i, 'swift'],
  [/\.(?:vba|bas|cls|xlsm|xlam)$/i, 'vba'], [/\.(?:sh|bash|zsh)$/i, 'sh'], [/\.(?:html?|php)$/i, 'html'],
];
function family(path: string): string | null {
  return FAMILIES.find(([re]) => re.test(path))?.[1] ?? null;
}

// The file a call to `name` from `caller` refers to, or null when that can't
// be known. Always: the caller's own definition, then a definition in a file
// it can see through imports. JS/TS and Python stop there — they can't call
// another file's function without importing it. Go/JVM/C# may call anything
// in the same package (directory) unimported. Anything else falls back to a
// name defined exactly once. Ambiguity binds to nothing: a missing edge is
// better than a wrong one.
export function bindCall(name: string, caller: string, allDefiners: Set<string> | undefined, imports: Set<string>): string | null {
  if (!allDefiners || !allDefiners.size) return null;
  if (allDefiners.has(caller)) return caller;
  const callerFamily = family(caller);
  // HTML pages call into their scripts, so HTML may bind to JS; otherwise same language only.
  const definers = new Set([...allDefiners].filter(d => callerFamily !== null && (family(d) === callerFamily || (callerFamily === 'html' && family(d) === 'js'))));
  if (!definers.size) return null;
  const imported = [...definers].filter(d => imports.has(d));
  if (imported.length) return imported.sort()[0];
  if (callerFamily === 'js' || callerFamily === 'py' || callerFamily === 'html') return null;
  if (PACKAGE_SCOPED.test(caller)) {
    const samePackage = [...definers].filter(d => dirname(d) === dirname(caller));
    if (samePackage.length === 1) return samePackage[0];
  }
  if (definers.size === 1) return definers.values().next().value ?? null;
  return null;
}

// Third-party packages a file imports, as "<ecosystem>:<name>" keys matching
// how dependency advisories name them: npm package names (scoped kept whole),
// Python top-level modules, Go import paths, Ruby require names.
const NODE_BUILTINS = new Set(['assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks', 'process', 'querystring', 'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib', 'module']);

export function packageImports(from: string, content: string | null): string[] {
  const found = new Set<string>();
  if (!content) return [];
  if (JS_FILE.test(from)) {
    const patterns = [
      /\b(?:import|export)\s[^'";]*?\bfrom\s*['"]([^'"]+)['"]/g,
      /\bimport\s*['"]([^'"]+)['"]/g,
      /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const re of patterns) for (const m of content.matchAll(re)) {
      const spec = m[1];
      if (/^(?:\.|\/|[@~#]\/|node:|https?:)/.test(spec)) continue;
      const parts = spec.split('/');
      const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      if (name && !NODE_BUILTINS.has(name)) found.add(`npm:${name.toLowerCase()}`);
    }
  } else if (PY_FILE.test(from)) {
    for (const m of content.matchAll(/^[ \t]*from[ \t]+([A-Za-z_][\w.]*)[ \t]+import\b/gm)) found.add(`pypi:${m[1].split('.')[0].toLowerCase()}`);
    for (const m of content.matchAll(/^[ \t]*import[ \t]+([A-Za-z_][\w.]*(?:[ \t]*,[ \t]*[A-Za-z_][\w.]*)*)/gm)) {
      m[1].split(',').forEach(mod => found.add(`pypi:${mod.trim().split('.')[0].toLowerCase()}`));
    }
  } else if (/\.go$/i.test(from)) {
    const block = content.match(/\bimport\s*\(([\s\S]*?)\)/);
    const specs = [...(block ? block[1].matchAll(/"([^"]+)"/g) : []), ...content.matchAll(/\bimport\s+(?:\w+\s+)?"([^"]+)"/g)];
    specs.forEach(m => { if (m[1].includes('.')) found.add(`go:${m[1]}`); });
  } else if (/\.rb$/i.test(from)) {
    for (const m of content.matchAll(/^[ \t]*require[ \t(]+['"]([^'"./][^'"]*)['"]/gm)) found.add(`rubygems:${m[1].split('/')[0].toLowerCase()}`);
  }
  return [...found];
}
