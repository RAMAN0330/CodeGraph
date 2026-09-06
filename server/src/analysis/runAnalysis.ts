import { Parser, DEFAULT_EXCLUDE_CHIPS, compileExcludePatterns, shouldExcludeFile, shouldIgnoreDirectory } from './parser';
import { buildTree } from './buildTree';
import { fetchRepositoryTree, fetchBlobContent } from '../services/githubService';
import { getCachedBlob, saveBlobCache, saveTreeCache, getCachedTree } from '../db/repoCache';

export interface RunAnalysisInput {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
}

interface TreeEntry { path: string; type: string; size?: number; sha: string }
interface ScannedFile { path: string; name: string; folder: string; size: number; isCode: boolean; sha: string }

const excludePatterns = compileExcludePatterns(DEFAULT_EXCLUDE_CHIPS.join('\n'));

// Ready for the CALL_BATCH-style yields the browser used to avoid janking the
// UI thread — irrelevant on the server, so this job runs its loops straight
// through without artificial pauses.
async function scanFiles(owner: string, repo: string, branch: string, token: string | undefined): Promise<ScannedFile[]> {
  // A job only runs because the caller already confirmed the commit changed,
  // so it must not serve a within-TTL-but-stale cached tree — always hit
  // GitHub (conditionally, via ETag) and refresh the cache with the result.
  const cached = await getCachedTree(owner, repo, branch);
  const result = await fetchRepositoryTree(owner, repo, token, branch, cached?.etag);
  const entries = (result.notModified ? cached?.tree : result.tree) as TreeEntry[] | undefined;
  if (!result.notModified) await saveTreeCache(owner, repo, branch, result.tree, result.etag ?? null);
  if (!entries) return [];

  const files: ScannedFile[] = [];
  entries.forEach(entry => {
    if (entry.type !== 'blob') return;
    const name = entry.path.includes('/') ? entry.path.substring(entry.path.lastIndexOf('/') + 1) : entry.path;
    if (shouldExcludeFile(entry.path, name, excludePatterns)) return;
    const pathParts = entry.path.split('/');
    const ignored = pathParts.slice(0, -1).some((part, idx) => {
      const dirPath = pathParts.slice(0, idx + 1).join('/');
      return shouldIgnoreDirectory(dirPath, part, excludePatterns);
    });
    if (ignored) return;
    const folder = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/')) : 'root';
    files.push({ path: entry.path, name, folder, size: entry.size || 0, isCode: Parser.isCode(name), sha: entry.sha });
  });
  return files;
}

// Content-addressed by blob sha (from the tree scan) — cached forever, same
// as the browser's per-file fetch path when a sha is available.
async function getFileContent(owner: string, repo: string, sha: string, token: string | undefined): Promise<string | null> {
  const cachedBlob = await getCachedBlob(owner, repo, sha);
  if (cachedBlob !== null) return cachedBlob;
  const blob = await fetchBlobContent(owner, repo, sha, token);
  if (blob !== null) await saveBlobCache(owner, repo, sha, blob);
  return blob;
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

export async function runAnalysis({ owner, repo, branch, token }: RunAnalysisInput): Promise<any> {
  await Parser.initTreeSitter();

  const files = await scanFiles(owner, repo, branch, token);
  if (!files.length) throw new Error('No code files found');

  const analyzed: any[] = [];
  const allFns: any[] = [];
  const CONCURRENCY = 6;
  let nextIndex = 0;

  async function analyzeFile(f: ScannedFile) {
    const isCodeFile = f.isCode !== false && Parser.isCode(f.name);
    try {
      const content = await getFileContent(owner, repo, f.sha, token);
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
  const fnStats: Record<string, any> = {};
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

  // Phase 2: call detection
  analyzed.forEach(file => {
    if (!file.content) return;
    const tokenSet = new Set(file.content.match(/\b[A-Za-z_$]\w*\b/g) || []);
    const candidateFnNames = fnNames.filter(fn => { const base = String(fn).split('.').pop(); return tokenSet.has(fn) || tokenSet.has(base as string); });
    if (!candidateFnNames.length) return;
    const calls = Parser.findCalls(file.content, candidateFnNames, file.path, allFns);
    Object.entries(calls).forEach(([fn, cnt]: [string, any]) => {
      if (cnt <= 0) return;
      const def = fnStats[fn]?.file;
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
  const patterns = Parser.detectPatterns(analyzed);
  const securityIssues = Parser.detectSecurity(analyzed);
  const duplicates = Parser.detectDuplicates(analyzed, allFns);
  const layerViolations = Parser.detectLayerViolations(analyzed, conns);
  analyzed.forEach(f => { f.complexity = Parser.calcComplexity(f.content, f.path); });

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
  const highComplexity = analyzed.filter(f => f.complexity && f.complexity.level === 'critical').sort((a, b) => b.complexity.score - a.complexity.score);
  if (highComplexity.length) issues.push({ type: 'warning', title: `${highComplexity.length} High Complexity Files`, desc: 'Files with complexity score >30', items: highComplexity.map(f => ({ name: `${f.name} (${f.complexity.score})`, file: f.path, score: f.complexity.score, lines: f.lines })) });

  const dataObj: any = {
    files: analyzed, functions: allFns, connections: conns, fnStats, folders, tree, issues, patterns, securityIssues, duplicates, layerViolations,
    deadFunctions: deadFns.map(([name, stats]: [string, any]) => { const codeLines = stats.code ? stats.code.split('\n').length : 0; return { name, file: stats.file, folder: stats.folder, line: stats.line, code: stats.code, codeLines, ext: stats.file.split('.').pop() }; }),
    excludePatterns: DEFAULT_EXCLUDE_CHIPS,
    stats: { files: analyzed.length, functions: allFns.length, connections: conns.length, dead: deadFns.length, patterns: patterns.length, security: securityIssues.filter((i: any) => i.severity === 'high').length, duplicates: duplicates.length, violations: layerViolations.length, loc: totalLoc, languages: langArray },
  };
  dataObj.suggestions = Parser.generateSuggestions(dataObj);
  return dataObj;
}
