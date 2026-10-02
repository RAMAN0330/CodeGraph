// Ranking and grouping for the workspace command palette (⌘K).
// Pure functions so the ordering is testable without rendering.

export interface PaletteFile { path: string; name: string; folder?: string; lines?: number; functions?: unknown[]; content?: string }
export interface PaletteFunction { name: string; file: string; line?: number; type?: string; isExported?: boolean; code?: string }
export interface PaletteSection { id: string; label: string; description: string; group: string }

export type PaletteScope = 'all' | 'files' | 'symbols' | 'folders' | 'sections';

export type PaletteItem =
  | { kind: 'file'; key: string; data: PaletteFile; label: string; detail: string; match: number[] }
  | { kind: 'fn'; key: string; data: PaletteFunction; label: string; detail: string; match: number[] }
  | { kind: 'folder'; key: string; data: string; label: string; detail: string; match: number[] }
  | { kind: 'section'; key: string; data: PaletteSection; label: string; detail: string; match: number[] };

export interface PaletteGroup { id: PaletteItem['kind']; heading: string; items: PaletteItem[]; total: number }

/** Prefixes that narrow the scope, VS Code style. */
const PREFIX_SCOPE: Record<string, PaletteScope> = { '@': 'symbols', '/': 'folders', '>': 'sections', '#': 'files' };

export function parseQuery(raw: string, scope: PaletteScope): { text: string; scope: PaletteScope } {
  const first = raw.trimStart()[0];
  if (first && PREFIX_SCOPE[first]) return { text: raw.trimStart().slice(1).trim(), scope: PREFIX_SCOPE[first] };
  return { text: raw.trim(), scope };
}

export function basename(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? path : path.slice(index + 1);
}

const isBoundary = (text: string, index: number) => index === 0 || /[/_.\-\s]/.test(text[index - 1]) || (text[index] >= 'A' && text[index] <= 'Z' && text[index - 1] >= 'a' && text[index - 1] <= 'z');

/**
 * Scores `text` against `query`. Higher is better; null means no match.
 * Exact > prefix > contiguous substring (word-boundary starts preferred) >
 * fuzzy subsequence (fewer gaps and more boundary hits preferred). Returns the
 * matched character indices for highlighting.
 */
export function matchScore(query: string, text: string): { score: number; indices: number[] } | null {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return { score: 1000, indices: [...q].map((_, i) => i) };
  const at = t.indexOf(q);
  if (at === 0) return { score: 900 - t.length, indices: [...q].map((_, i) => i) };
  if (at > 0) {
    let boundaryAt = -1;
    for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + 1)) if (isBoundary(text, i)) { boundaryAt = i; break; }
    const start = boundaryAt === -1 ? at : boundaryAt;
    return { score: (boundaryAt === -1 ? 600 : 750) - start - t.length / 10, indices: [...q].map((_, i) => start + i) };
  }
  const indices: number[] = [];
  let qi = 0;
  let boundaries = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) { indices.push(i); if (isBoundary(text, i)) boundaries++; qi++; }
  }
  if (qi < q.length) return null;
  const spread = indices[indices.length - 1] - indices[0] - (indices.length - 1);
  return { score: 300 + boundaries * 25 - spread * 4 - t.length / 10, indices };
}

const LIMITS_ALL: Record<PaletteItem['kind'], number> = { section: 4, file: 7, fn: 7, folder: 4 };
const LIMIT_SCOPED = 60;
const SCOPE_KINDS: Record<PaletteScope, PaletteItem['kind'][]> = {
  all: ['section', 'file', 'fn', 'folder'],
  files: ['file'],
  symbols: ['fn'],
  folders: ['folder'],
  sections: ['section'],
};
const HEADINGS: Record<PaletteItem['kind'], string> = { section: 'Go to', file: 'Files', fn: 'Symbols', folder: 'Folders' };

export interface PaletteSource { files: PaletteFile[]; functions: PaletteFunction[]; folders: string[]; sections: PaletteSection[] }

function rankFiles(text: string, files: PaletteFile[]): PaletteItem[] {
  const ranked: Array<{ score: number; item: PaletteItem }> = [];
  for (const file of files) {
    const name = file.name || basename(file.path);
    const onName = matchScore(text, name);
    const onPath = onName ? null : matchScore(text, file.path);
    if (!onName && !onPath) continue;
    // A basename hit outranks the same quality of hit buried in the path.
    const score = onName ? onName.score + 120 : onPath!.score;
    ranked.push({ score, item: { kind: 'file', key: `file:${file.path}`, data: file, label: name, detail: file.path, match: onName ? onName.indices : [] } });
  }
  return ranked.sort((a, b) => b.score - a.score).map(entry => entry.item);
}

function rankFunctions(text: string, functions: PaletteFunction[]): PaletteItem[] {
  const ranked: Array<{ score: number; item: PaletteItem }> = [];
  const seen = new Set<string>();
  for (const fn of functions) {
    const result = matchScore(text, fn.name);
    if (!result) continue;
    const key = `fn:${fn.file}:${fn.name}:${fn.line ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push({ score: result.score + (fn.isExported ? 15 : 0), item: { kind: 'fn', key, data: fn, label: fn.name, detail: `${fn.file}${fn.line ? `:${fn.line}` : ''}`, match: result.indices } });
  }
  return ranked.sort((a, b) => b.score - a.score).map(entry => entry.item);
}

function rankFolders(text: string, folders: string[]): PaletteItem[] {
  const ranked: Array<{ score: number; item: PaletteItem }> = [];
  for (const folder of folders) {
    if (!folder) continue;
    const result = matchScore(text, folder);
    if (!result) continue;
    ranked.push({ score: result.score, item: { kind: 'folder', key: `folder:${folder}`, data: folder, label: folder, detail: '', match: result.indices } });
  }
  return ranked.sort((a, b) => b.score - a.score).map(entry => entry.item);
}

function rankSections(text: string, sections: PaletteSection[]): PaletteItem[] {
  const ranked: Array<{ score: number; item: PaletteItem }> = [];
  for (const section of sections) {
    const onLabel = matchScore(text, section.label);
    const onGroup = onLabel ? null : matchScore(text, section.group);
    if (!onLabel && !onGroup) continue;
    ranked.push({ score: onLabel ? onLabel.score + 60 : onGroup!.score, item: { kind: 'section', key: `section:${section.id}`, data: section, label: section.label, detail: section.group, match: onLabel ? onLabel.indices : [] } });
  }
  return ranked.sort((a, b) => b.score - a.score).map(entry => entry.item);
}

/** Grouped, ranked results for a non-empty query. */
export function searchPalette(rawQuery: string, scope: PaletteScope, source: PaletteSource): PaletteGroup[] {
  const parsed = parseQuery(rawQuery, scope);
  if (!parsed.text) return [];
  const kinds = SCOPE_KINDS[parsed.scope];
  const groups: PaletteGroup[] = [];
  for (const kind of kinds) {
    const all = kind === 'file' ? rankFiles(parsed.text, source.files)
      : kind === 'fn' ? rankFunctions(parsed.text, source.functions)
      : kind === 'folder' ? rankFolders(parsed.text, source.folders)
      : rankSections(parsed.text, source.sections);
    if (!all.length) continue;
    const limit = parsed.scope === 'all' ? LIMITS_ALL[kind] : LIMIT_SCOPED;
    groups.push({ id: kind, heading: HEADINGS[kind], items: all.slice(0, limit), total: all.length });
  }
  // In "all", lead with whichever group holds the single best match.
  if (parsed.scope === 'all' && groups.length > 1) {
    const best = (group: PaletteGroup) => {
      const top = group.items[0];
      const target = top.kind === 'file' ? top.label : top.kind === 'folder' ? top.data : top.kind === 'fn' ? top.data.name : top.data.label;
      return (matchScore(parsed.text, target)?.score ?? 0) + (top.kind === 'section' ? 40 : 0);
    };
    groups.sort((a, b) => best(b) - best(a));
  }
  return groups;
}
