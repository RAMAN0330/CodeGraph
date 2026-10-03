import { Parser, DEFAULT_EXCLUDE_CHIPS, compileExcludePatterns, shouldExcludeFile, shouldIgnoreDirectory } from './parser';
import { buildTree } from './buildTree';
import { CHURN_WINDOW_DAYS, hotspotCandidates, rankHotspots, type FileHistory } from './hotspots';
import { bindCall, indexPaths, packageImports, resolveImports, resolveReexports, visibleFiles } from './imports';
import { RULES_FILE, evaluateRules, extractEndpoints, linkTablesToCode, parseDbSchema, parseManifest, parseRulesFile, resolveEndpointReach, type PackageInfo } from './sharedRules';

// The analysis pipeline, independent of where files come from: the server's
// job reads a GitHub tree (runAnalysis.ts), the `structrace check` CLI reads
// a local checkout (cli/check.ts). Same parser, graph and rules either way.

export interface SourceFile { path: string; name: string; folder: string; size: number; isCode: boolean }
export interface FileSource {
  files: SourceFile[];
  read(file: SourceFile): Promise<string | null>;
  // structrace.rules.json, read separately: .json files may be excluded from the code scan.
  readRules(): Promise<string | null>;
  // Package manifests (package.json, go.mod, …), likewise read separately.
  readManifests?(): Promise<Array<{ path: string; content: string }>>;
}

// At most this many manifests are read; beyond it a repository is a
// collection of projects rather than one monorepo worth graphing.
export const MAX_MANIFESTS = 300;
export interface AnalyzeOptions {
  // Commit history for hotspot candidates; absent means no hotspots.
  history?: (paths: string[]) => Promise<Map<string, FileHistory>>;
  historyUnavailable?: 'needs-token' | 'off';
}

// Huge or binary files (lockfiles, images, bundles) aren't source worth
// parsing, and the parser's regex passes can take minutes on them.
const MAX_CONTENT_CHARS = 1_000_000;
function parseable(content: string | null): string | null {
  if (content === null || content.length > MAX_CONTENT_CHARS || content.slice(0, 8000).includes('\u0000')) return null;
  return content;
}

const excludePatterns = compileExcludePatterns(DEFAULT_EXCLUDE_CHIPS.join('\n'));

// The default exclusion rules (vendored, generated, build output, …) as a
// filter over repository-relative paths.
export function selectSourceFiles(paths: Array<{ path: string; size?: number }>): SourceFile[] {
  const files: SourceFile[] = [];
  paths.forEach(entry => {
    const name = entry.path.includes('/') ? entry.path.substring(entry.path.lastIndexOf('/') + 1) : entry.path;
    if (shouldExcludeFile(entry.path, name, excludePatterns)) return;
    const pathParts = entry.path.split('/');
    const ignored = pathParts.slice(0, -1).some((part, idx) => shouldIgnoreDirectory(pathParts.slice(0, idx + 1).join('/'), part, excludePatterns));
    if (ignored) return;
    const folder = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/')) : 'root';
    files.push({ path: entry.path, name, folder, size: entry.size || 0, isCode: Parser.isCode(name) });
  });
  return files;
}

// Direct in-process replacement for the browser's Web Worker
// (sourceAnalysisWorker.ts) — same three Parser calls, no postMessage needed.
function analyzeSource(path: string, content: string) {
  const actualIsCode = !Parser.isScriptContainer(path) || Parser.hasEmbeddedCode(content, path);
  return {
    layer: Parser.detectLayer(path),
    functions: actualIsCode ? Parser.extract(content, path) : [],
    lines: content.split('\n').length,
    actualIsCode,
  };
}

export async function analyzeFiles(source: FileSource, options: AnalyzeOptions = {}): Promise<any> {
  await Parser.initTreeSitter();
  const files = source.files;
  if (!files.length) throw new Error('No code files found');

  const analyzed: any[] = [];
  const allFns: any[] = [];
  const CONCURRENCY = 6;
  let nextIndex = 0;

  async function analyzeFile(f: SourceFile) {
    const isCodeFile = f.isCode !== false && Parser.isCode(f.name);
    try {
      const content = parseable(await source.read(f));
      const layer = Parser.detectLayer(f.path);
      if (isCodeFile && content) {
        const sourceAnalysis = analyzeSource(f.path, content);
        analyzed.push({ path: f.path, name: f.name, folder: f.folder, content, functions: sourceAnalysis.functions, lines: sourceAnalysis.lines, layer: sourceAnalysis.layer || layer, churn: 0, isCode: sourceAnalysis.actualIsCode });
        if (sourceAnalysis.actualIsCode) sourceAnalysis.functions.forEach((fn: any) => allFns.push({ ...fn, folder: f.folder, layer }));
      } else {
        const lines = content ? content.split('\n').length : 0;
        analyzed.push({ path: f.path, name: f.name, folder: f.folder, content: content || '', functions: [], lines, layer, churn: 0, isCode: false });
      }
    } catch {
      analyzed.push({ path: f.path, name: f.name, folder: f.folder, content: '', functions: [], lines: 0, layer: Parser.detectLayer(f.path), churn: 0, isCode: false });
    }
  }

  async function worker() {
    while (nextIndex < files.length) {
      const i = nextIndex++;
      await analyzeFile(files[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

  // Phase 1: function stats index
  const fnNames = [...new Set(allFns.map(f => f.name))];
  const conns: any[] = [];
  // No prototype: function names like `constructor` or `toString` must not
  // resolve to Object.prototype members.
  const fnStats: Record<string, any> = Object.create(null);
  allFns.forEach(fn => {
    if (!fnStats[fn.name]) {
      fnStats[fn.name] = {
        internal: 0, external: 0, callers: new Map(),
        file: fn.file, folder: fn.folder, line: fn.line, code: fn.code,
        isTopLevel: fn.isTopLevel !== false, isExported: fn.isExported || false,
        isClassMethod: fn.isClassMethod || false, type: fn.type || 'function',
        decorators: fn.decorators || null, className: fn.className || null,
      };
    }
  });

  // Phase 2: call detection. Every file defining a name is a candidate; each
  // call binds to the one the calling file can see (imports.ts → bindCall).
  const definers = new Map<string, Set<string>>();
  allFns.forEach(fn => {
    if (!fn.file) return;
    if (!definers.has(fn.name)) definers.set(fn.name, new Set());
    definers.get(fn.name)!.add(fn.file);
  });
  const pathIndex = indexPaths(analyzed.map(f => f.path));
  const reexports = new Map(analyzed.map(f => [f.path as string, resolveReexports(f.path, f.content, pathIndex)]));
  analyzed.forEach(file => {
    if (!file.content) return;
    const tokenSet = new Set(file.content.match(/\b[A-Za-z_$]\w*\b/g) || []);
    const candidateFnNames = fnNames.filter(fn => { const base = String(fn).split('.').pop(); return tokenSet.has(fn) || tokenSet.has(base as string); });
    if (!candidateFnNames.length) return;
    const calls = Parser.findCalls(file.content, candidateFnNames, file.path, allFns);
    const imports = visibleFiles(resolveImports(file.path, file.content, pathIndex), reexports);
    Object.entries(calls).forEach(([fn, cnt]: [string, any]) => {
      if (cnt <= 0 || !fnStats[fn]) return;
      const def = bindCall(fn, file.path, definers.get(fn), imports);
      if (!def) return;
      if (def === file.path) {
        fnStats[fn].internal += cnt;
      } else {
        conns.push({ source: def, target: file.path, fn, count: cnt });
        const ex = fnStats[fn].callers.get(file.path);
        if (ex) ex.count += cnt; else fnStats[fn].callers.set(file.path, { file: file.path, name: file.name, count: cnt });
        fnStats[fn].external += cnt;
      }
    });
  });
  Object.values(fnStats).forEach((s: any) => { s.callers = Array.from(s.callers.values()); s.count = s.internal + s.external; });

  // Phase 2.5: markdown links
  const mdAllPaths = analyzed.map(f => f.path);
  analyzed.forEach(file => {
    if (!Parser.isMarkdown(file.name)) return;
    file.layer = 'note';
    if (!file.content) return;
    const links = Parser.extractMarkdownLinks(file.content);
    const deps: any[] = [];
    links.forEach((link: any) => {
      const resolved = Parser.resolveMarkdownLink(link.target, file.path, mdAllPaths, link.kind);
      deps.push({ kind: link.kind, raw: link.raw, target: link.target, resolved });
      if (resolved && resolved !== file.path) conns.push({ source: file.path, target: resolved, fn: link.raw, count: 1, kind: link.kind });
    });
    file.dependencies = deps;
  });
  analyzed.forEach(f => { if (!f.dependencies) f.dependencies = []; });

  const issues: any[] = [];
  const deadFns = Object.entries(fnStats).filter(([name, stats]: [string, any]) => {
    if (stats.internal > 0 || stats.external > 0) return false;
    if (stats.isClassMethod) return false;
    if (!stats.isTopLevel) return false;
    if (stats.decorators && stats.decorators.length > 0) return false;
    if (stats.type === 'class' || stats.type === 'dataclass' || stats.type === 'abstract_class') return false;
    const baseName = name.includes('.') ? name.split('.').pop()! : name;
    if (baseName.startsWith('__') && baseName.endsWith('__')) return false;
    if (baseName.startsWith('test_') || baseName === 'setUp' || baseName === 'tearDown' || baseName === 'setUpClass' || baseName === 'tearDownClass') return false;
    if (stats.file && (stats.file.includes('test_') || stats.file.includes('_test.') || stats.file.includes('/tests/'))) return false;
    if ((baseName === 'upgrade' || baseName === 'downgrade') && stats.file && (stats.file.includes('migration') || stats.file.includes('alembic') || stats.file.includes('versions'))) return false;
    if (['main', 'create_app', 'make_app', 'get_app', 'setup', 'configure', 'register', 'on_startup', 'on_shutdown', 'lifespan'].indexOf(baseName) >= 0) return false;
    if (stats.isExported && stats.file && /\.[jt]sx?$/.test(stats.file)) return false;
    if (stats.file && (/\.(?:spec|test)\.[jt]sx?$/.test(stats.file) || stats.file.includes('__tests__'))) return false;
    return true;
  });
  // Where else each unused function's name appears as a word (strings,
  // templates, config, reflection like getattr(obj, "name")). Such a function
  // may be called dynamically, so the cleanup plan marks it "check first".
  const deadMentions = new Map<string, string[]>();
  if (deadFns.length) {
    const wanted = new Map<string, string[]>();
    deadFns.forEach(([name]) => {
      const base = name.includes('.') ? name.split('.').pop()! : name;
      if (base.length < 4) return; // too generic to mean anything
      if (!wanted.has(base)) wanted.set(base, []);
      wanted.get(base)!.push(name);
    });
    analyzed.forEach(file => {
      if (!file.content) return;
      const tokens = new Set<string>(file.content.match(/[A-Za-z_$][\w$]*/g) || []);
      for (const [base, names] of wanted) {
        if (!tokens.has(base)) continue;
        names.forEach(name => {
          if (fnStats[name]?.file === file.path) return;
          const list = deadMentions.get(name) ?? [];
          if (list.length < 5) list.push(file.path);
          deadMentions.set(name, list);
        });
      }
    });
  }
  if (deadFns.length) issues.push({ type: 'warning', title: `${deadFns.length} Unused Functions`, desc: 'Functions not called from other files', items: deadFns.map(([name, stats]: [string, any]) => ({ name, file: stats.file, line: stats.line, code: stats.code })) });
  const godFiles = analyzed.filter(f => f.functions.length > 15);
  if (godFiles.length) issues.push({ type: 'critical', title: `${godFiles.length} Large Files`, desc: 'Files with 15+ functions', items: godFiles.map(f => ({ name: `${f.name} (${f.functions.length} fns)`, file: f.path, fns: f.functions.length, lines: f.lines })) });
  const coupling: Record<string, number> = {};
  conns.forEach(c => { coupling[c.target] = (coupling[c.target] || 0) + 1; });
  const highCoup = Object.entries(coupling).filter(([, n]) => n > 8).sort((a, b) => b[1] - a[1]);
  if (highCoup.length) issues.push({ type: 'warning', title: `${highCoup.length} Highly Coupled`, desc: 'Files imported by 8+ others', items: highCoup.map(([file, n]) => ({ name: `${file.split('/').pop()} (${n} imports)`, file, imports: n })) });
  const connSet = new Set(conns.map(c => `${c.source}|${c.target}`));
  const circular: string[] = [];
  conns.forEach(c => { if (connSet.has(`${c.target}|${c.source}`)) { const key = [c.source, c.target].sort().join('|'); if (!circular.includes(key)) circular.push(key); } });
  if (circular.length) issues.push({ type: 'critical', title: `${circular.length} Circular Dependencies`, desc: 'Files that import each other', items: circular.map(p => { const parts = p.split('|'); return { name: parts.map(x => x.split('/').pop()).join(' ↔ '), files: parts }; }) });

  // Phase 3-4: patterns, security, duplicates, layer violations, complexity
  const patterns = await Parser.detectPatterns(analyzed);
  const securityIssues = await Parser.detectSecurity(analyzed);
  const duplicates = await Parser.detectDuplicates(analyzed);
  const layerViolations = Parser.detectLayerViolations(analyzed, conns);
  analyzed.forEach(f => { f.complexity = Parser.calcComplexity(f.content, f.path); });

  let hotspots: { status: 'ok' | 'needs-token' | 'off'; windowDays: number; items: any[] } = { status: options.historyUnavailable ?? 'off', windowDays: CHURN_WINDOW_DAYS, items: [] };
  if (options.history) {
    const history = await options.history(hotspotCandidates(analyzed));
    analyzed.forEach(f => { const h = history.get(f.path); if (h) f.churn = h.commits; });
    hotspots = { status: 'ok', windowDays: CHURN_WINDOW_DAYS, items: rankHotspots(analyzed, history) };
  }

  // Database tables and the code that uses them — needs file contents, so it
  // runs before they are freed below.
  const dbTables = parseDbSchema(analyzed.map(f => ({ path: f.path, content: f.content }))).tables
    .map(t => ({ name: t.name, file: t.file, line: t.line, modelName: t.modelName, dbTableName: t.dbTableName }));
  const tableUsage = dbTables.length ? linkTablesToCode(dbTables, analyzed) : {};
  // Packages (monorepo members) from their manifests.
  const manifests = source.readManifests ? await source.readManifests().catch(() => []) : [];
  const packages = manifests.slice(0, MAX_MANIFESTS).map(m => parseManifest(m.path, m.content)).filter((p): p is PackageInfo => p !== null);
  // Third-party packages each file imports, for vulnerability reach.
  const packageUsage: Record<string, string[]> = {};
  analyzed.forEach(f => {
    if (f.isCode === false) return;
    packageImports(f.path, f.content).forEach(key => { (packageUsage[key] ??= []).push(f.path); });
  });
  Object.keys(packageUsage).forEach(key => { packageUsage[key] = packageUsage[key].sort().slice(0, 300); });
  // HTTP endpoints and what each reaches (files, then tables).
  const endpoints = resolveEndpointReach(extractEndpoints(analyzed), { files: analyzed, connections: conns, fnStats, tableUsage });

  // Phase 5: free content from memory before persisting (same as the client
  // did — the code viewer re-fetches a file's content on demand)
  analyzed.forEach(f => { f.content = null; });

  const folders = [...new Set(analyzed.map(f => f.folder))].sort();
  const tree = buildTree(analyzed);
  const totalLoc = analyzed.reduce((s, f) => s + f.lines, 0);
  const langStats: Record<string, number> = {};
  analyzed.forEach(f => { const ext = f.name.split('.').pop().toLowerCase(); langStats[ext] = (langStats[ext] || 0) + f.lines; });
  const langArray = Object.entries(langStats).sort((a, b) => b[1] - a[1]).map(([ext, lines]) => ({ ext, lines, pct: Math.round(lines / totalLoc * 100) }));

  if (duplicates.length > 0) {
    const nameDups = duplicates.filter((d: any) => d.type === 'name');
    const codeDups = duplicates.filter((d: any) => d.type === 'code');
    if (nameDups.length) issues.push({ type: 'warning', title: `${nameDups.length} Duplicate Function Names`, desc: 'Same function name in multiple files', items: nameDups.map((d: any) => ({ name: `${d.name} (${d.count} files)`, suggestion: d.suggestion, files: d.files, count: d.count })) });
    if (codeDups.length) issues.push({ type: 'warning', title: `${codeDups.length} Similar Code Blocks`, desc: 'Copy-paste code detected', items: codeDups.map((d: any) => ({ name: d.name, suggestion: d.suggestion, files: d.files })) });
  }
  if (layerViolations.length > 0) {
    issues.push({ type: 'critical', title: `${layerViolations.length} Architecture Violations`, desc: 'Lower layers importing from higher layers', items: layerViolations.map((v: any) => ({ name: `${v.fromLayer} → ${v.toLayer}`, file: v.from, toFile: v.to, fn: v.fn, suggestion: v.suggestion })) });
  }
  // Team rules from structrace.rules.json, if the repository has one.
  const rulesText = await source.readRules().catch(() => null);
  const parsedRules = rulesText !== null ? parseRulesFile(rulesText) : { rules: [], errors: [] };
  const ruleViolations = evaluateRules(parsedRules.rules, conns);
  if (ruleViolations.length) {
    issues.push({ type: ruleViolations.some(v => v.severity === 'error') ? 'critical' : 'warning', title: `${ruleViolations.length} Rule Violations`, desc: `Dependencies ${RULES_FILE} forbids`, items: ruleViolations.map(v => ({ name: v.rule, file: v.from, toFile: v.to, severity: v.severity, suggestion: `${v.from.split('/').pop()} must not depend on ${v.to.split('/').pop()} (${v.rule})` })) });
  }
  const highComplexity = analyzed.filter(f => f.complexity && f.complexity.level === 'critical').sort((a, b) => b.complexity.score - a.complexity.score);
  if (highComplexity.length) issues.push({ type: 'warning', title: `${highComplexity.length} High Complexity Files`, desc: 'Files with complexity score >30', items: highComplexity.map(f => ({ name: `${f.name} (${f.complexity.score})`, file: f.path, score: f.complexity.score, lines: f.lines })) });

  const dataObj: any = {
    files: analyzed, functions: allFns, connections: conns, fnStats, folders, tree, issues, patterns, securityIssues, duplicates, layerViolations,
    rules: { present: rulesText !== null, rules: parsedRules.rules, errors: parsedRules.errors }, ruleViolations,
    dbTables, tableUsage, hotspots, endpoints, packageUsage, packages,
    deadFunctions: deadFns.map(([name, stats]: [string, any]) => { const codeLines = stats.code ? stats.code.split('\n').length : 0; return { name, file: stats.file, folder: stats.folder, line: stats.line, code: stats.code, codeLines, ext: stats.file.split('.').pop(), mentions: deadMentions.get(name) ?? [] }; }),
    excludePatterns: DEFAULT_EXCLUDE_CHIPS,
    stats: { files: analyzed.length, functions: allFns.length, connections: conns.length, dead: deadFns.length, patterns: patterns.length, security: securityIssues.filter((i: any) => i.severity === 'high').length, duplicates: duplicates.length, violations: layerViolations.length, ruleViolations: ruleViolations.length, loc: totalLoc, languages: langArray },
  };
  dataObj.suggestions = Parser.generateSuggestions(dataObj);
  return dataObj;
}
