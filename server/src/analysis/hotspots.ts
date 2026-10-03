// Hotspots: files that are both complex and frequently changed. Either alone
// is fine — a complex file nobody touches costs little, a simple file that
// changes daily is cheap to change. Together they are where bugs and slow
// reviews concentrate.

export const CHURN_WINDOW_DAYS = 180;
export const HOTSPOT_CANDIDATES = 40;

export interface FileHistory { commits: number; authors: number; lastChanged: string | null }
export interface Hotspot { path: string; complexity: number; churn: number; authors: number; lastChanged: string | null; score: number }

const TEST_PATH = /(\.test\.|\.spec\.|_test\.|(^|\/)test_|__tests__|(^|\/)tests?\/)/i;

// The files worth fetching history for: complexity is a precondition for
// being a hotspot, so only the most complex code files are checked.
export function hotspotCandidates(files: any[], limit = HOTSPOT_CANDIDATES): string[] {
  return files
    .filter(f => f.isCode !== false && (f.complexity?.score ?? 0) > 0 && !TEST_PATH.test(f.path))
    .sort((a, b) => b.complexity.score - a.complexity.score || a.path.localeCompare(b.path))
    .slice(0, limit)
    .map(f => f.path);
}

// Score = complexity share × churn share, each relative to the most extreme
// candidate, scaled 0–100. Files that never changed in the window are not
// hotspots, whatever their complexity.
export function rankHotspots(files: any[], history: Map<string, FileHistory>, limit = 20): Hotspot[] {
  const rows = files
    .filter(f => history.has(f.path) && history.get(f.path)!.commits > 0)
    .map(f => ({ path: f.path as string, complexity: f.complexity?.score ?? 0, ...history.get(f.path)! }));
  if (!rows.length) return [];
  const maxComplexity = Math.max(...rows.map(r => r.complexity)) || 1;
  const maxChurn = Math.max(...rows.map(r => r.commits)) || 1;
  return rows
    .map(r => ({ path: r.path, complexity: r.complexity, churn: r.commits, authors: r.authors, lastChanged: r.lastChanged, score: Math.round((r.complexity / maxComplexity) * (r.commits / maxChurn) * 100) }))
    .sort((a, b) => b.score - a.score || b.churn - a.churn || a.path.localeCompare(b.path))
    .slice(0, limit);
}
