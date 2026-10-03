// Answers questions about a repository from its analysis graph — no model,
// no guessing. Four shapes of question are understood:
//   impact        "what breaks if I change auth/session.ts?"
//   dependencies  "what does routes.ts depend on?"
//   path          "how does main.ts reach db.ts?"
//   locate        "where is authentication handled?"  (the fallback)

export interface LocateResult { path: string; layer: string; dependents: number; score: number; matches: Array<{ name: string; line?: number }> }
export type QueryAnswer =
  | { kind: 'locate'; terms: string[]; results: LocateResult[] }
  | { kind: 'impact'; file: string; direct: string[]; transitive: string[] }
  | { kind: 'dependencies'; file: string; direct: string[] }
  | { kind: 'path'; from: string; to: string; path: string[] | null }
  | { kind: 'unresolved'; message: string; suggestions: string[] };

const STOPWORDS = new Set(('a an and are as at be by can code codebase do does done file files for from get handle handled handles happen happens how i in is it its logic me of on or our place the there this to used uses using we what when where which who why with work works implemented implement defined define live lives located find show tell module modules function functions part').split(' '));
const IMPACT = /\b(what (breaks|would break|is affected|gets affected|depends on)|impact of|blast radius|who (uses|calls|imports)|used by|if (i|we) (change|modify|edit|delete|remove|refactor))\b/i;
const DEPENDENCIES = /\b(what does .+ (use|depend on|import|call)|dependencies of|depends on what)\b/i;
const PATH = /\b(how does .+ (reach|get to|call|connect to|use)|path from|route from|between)\b/i;

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

function stem(word: string): string {
  return word.replace(/(ations?|ication|ing|ers?|ed|es|s)$/, '') || word;
}

export function questionTerms(question: string): string[] {
  const words = question.toLowerCase().replace(/[`'"?!,]/g, ' ').split(/[^a-z0-9_]+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

interface Graph { paths: string[]; uses: Map<string, Set<string>>; usedBy: Map<string, Set<string>>; layer: Map<string, string> }

function buildGraph(data: any): Graph {
  const paths: string[] = (data?.files || []).map((f: any) => f.path);
  const layer = new Map<string, string>((data?.files || []).map((f: any) => [f.path, f.layer || 'other']));
  const uses = new Map<string, Set<string>>();
  const usedBy = new Map<string, Set<string>>();
  // runAnalysis: source = file defining the function, target = file calling it.
  (data?.connections || []).forEach((c: any) => {
    const definer = endpoint(c.source);
    const caller = endpoint(c.target);
    if (!definer || !caller || definer === caller) return;
    if (!uses.has(caller)) uses.set(caller, new Set());
    uses.get(caller)!.add(definer);
    if (!usedBy.has(definer)) usedBy.set(definer, new Set());
    usedBy.get(definer)!.add(caller);
  });
  return { paths, uses, usedBy, layer };
}

// Files the question names explicitly: a path or a basename, with or without
// its extension. Longest, most specific mentions win; returned in the order
// they appear in the question.
export function mentionedFiles(question: string, paths: string[]): string[] {
  const text = question.toLowerCase();
  const found: Array<{ path: string; at: number; length: number }> = [];
  for (const path of paths) {
    const lower = path.toLowerCase();
    const base = lower.split('/').pop()!;
    const stemmed = base.replace(/\.[a-z0-9]+$/, '');
    const candidates = [lower, base, stemmed.length >= 4 ? stemmed : ''].filter(Boolean);
    for (const candidate of candidates) {
      const re = new RegExp(`(^|[^a-z0-9_./-])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9_-])`);
      const m = re.exec(text);
      if (m) { found.push({ path, at: m.index, length: candidate.length }); break; }
    }
  }
  // Drop a mention that is only part of a longer one at the same spot
  // (e.g. "db" inside "db/session.ts"). When several files share the named
  // basename, the shallowest path wins — the answer shows the full path.
  found.sort((a, b) => a.at - b.at || b.length - a.length || a.path.length - b.path.length || a.path.localeCompare(b.path));
  const result: string[] = [];
  let lastEnd = -1;
  for (const f of found) {
    if (f.at < lastEnd) continue;
    result.push(f.path);
    lastEnd = f.at + f.length + 1;
  }
  return result;
}

function closure(start: string, edges: Map<string, Set<string>>): string[] {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) for (const next of edges.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  seen.delete(start);
  return [...seen];
}

function shortestPath(from: string, to: string, uses: Map<string, Set<string>>): string[] | null {
  const prev = new Map<string, string>([[from, '']]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) {
      const path = [to];
      while (path[0] !== from) path.unshift(prev.get(path[0])!);
      return path;
    }
    for (const next of uses.get(current) ?? []) if (!prev.has(next)) { prev.set(next, current); queue.push(next); }
  }
  return null;
}

function locate(data: any, graph: Graph, terms: string[]): LocateResult[] {
  const stems = terms.map(stem).filter(s => s.length > 1);
  if (!stems.length) return [];
  const fnsByFile = new Map<string, Array<{ name: string; line?: number }>>();
  (data?.functions || []).forEach((fn: any) => {
    if (!fn.file) return;
    if (!fnsByFile.has(fn.file)) fnsByFile.set(fn.file, []);
    fnsByFile.get(fn.file)!.push({ name: String(fn.name), line: fn.line });
  });
  const results: LocateResult[] = [];
  for (const path of graph.paths) {
    const segments = path.toLowerCase().split(/[/._-]+/);
    let score = 0;
    const matches: LocateResult['matches'] = [];
    for (const s of stems) {
      if (segments.some(seg => seg === s || seg.startsWith(s))) score += 3;
      else if (path.toLowerCase().includes(s)) score += 1;
      const fnHits = (fnsByFile.get(path) ?? []).filter(fn => fn.name.toLowerCase().includes(s));
      if (fnHits.length) { score += Math.min(4, fnHits.length) * 1.5; fnHits.forEach(fn => { if (matches.length < 4 && !matches.some(m => m.name === fn.name)) matches.push(fn); }); }
      if ((graph.layer.get(path) || '').toLowerCase().startsWith(s)) score += 1;
    }
    if (!score) continue;
    const dependents = graph.usedBy.get(path)?.size ?? 0;
    results.push({ path, layer: graph.layer.get(path) || 'other', dependents, matches, score: Math.round(score * (1 + Math.log1p(dependents) / 4) * 10) / 10 });
  }
  return results.sort((a, b) => b.score - a.score || b.dependents - a.dependents || a.path.localeCompare(b.path)).slice(0, 8);
}

export function answerQuestion(data: any, question: string): QueryAnswer {
  const graph = buildGraph(data);
  const q = question.trim();
  if (!q) return { kind: 'unresolved', message: 'Ask a question about this repository.', suggestions: [] };
  const files = mentionedFiles(q, graph.paths);

  if (PATH.test(q) && files.length >= 2) {
    return { kind: 'path', from: files[0], to: files[1], path: shortestPath(files[0], files[1], graph.uses) };
  }
  if (IMPACT.test(q) || DEPENDENCIES.test(q)) {
    if (!files.length) {
      const guesses = locate(data, graph, questionTerms(q)).slice(0, 5).map(r => r.path);
      return { kind: 'unresolved', message: 'Name a file to analyze, for example by its path or file name.', suggestions: guesses };
    }
    const file = files[0];
    if (DEPENDENCIES.test(q) && !IMPACT.test(q)) return { kind: 'dependencies', file, direct: [...(graph.uses.get(file) ?? [])].sort() };
    const direct = [...(graph.usedBy.get(file) ?? [])].sort();
    const transitive = closure(file, graph.usedBy).filter(p => !direct.includes(p)).sort();
    return { kind: 'impact', file, direct, transitive };
  }
  const terms = questionTerms(q);
  return { kind: 'locate', terms, results: locate(data, graph, terms) };
}
