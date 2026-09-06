// Records a compact snapshot of each completed analysis so the Overview page
// can show real before/after deltas ("+18 files", "-4 health points") without
// any backend persistence. Mirrors the storage pattern in bookmarks.ts.

export interface AnalysisSnapshot {
  timestamp: string; // ISO string
  healthScore: number;
  healthGrade: string;
  stats: {
    files: number;
    functions: number;
    connections: number;
    loc: number;
    security: number;
    dead: number;
    violations: number;
    duplicates: number;
    patterns: number;
  };
}

const KEY = 'cf_analysis_history';
const MAX_PER_REPO = 10;

function load(): Record<string, AnalysisSnapshot[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(data: Record<string, AnalysisSnapshot[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Records a new snapshot for `repoKey` (e.g. "owner/repo@branch") and
 * returns the snapshot that was current *before* this one — the baseline to
 * diff against — or null if this is the first analysis recorded for that key.
 */
export function recordAnalysisSnapshot(repoKey: string, snapshot: AnalysisSnapshot): AnalysisSnapshot | null {
  const all = load();
  const history = all[repoKey] ?? [];
  const previous = history.length ? history[history.length - 1] : null;
  const next = [...history, snapshot].slice(-MAX_PER_REPO);
  all[repoKey] = next;
  save(all);
  return previous;
}

export function getAnalysisHistory(repoKey: string): AnalysisSnapshot[] {
  return load()[repoKey] ?? [];
}
