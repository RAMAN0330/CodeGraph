// GitHub-style contribution heatmap from /repos/{owner}/{repo}/stats/commit_activity:
// 52 weeks, each starting Sunday 00:00 UTC, with commit counts per weekday.

export interface WeekActivity { week: number; total: number; days: number[] }
export interface HeatCell { date: string; count: number; level: 0 | 1 | 2 | 3 | 4; future: boolean }
export interface Heatmap {
  weeks: HeatCell[][];                       // columns of 7 cells, Sunday first
  months: Array<{ label: string; column: number }>;
  total: number;
  activeDays: number;
  longestStreak: number;
  busiest: { date: string; count: number } | null;
}

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Quartiles of the days with commits, so one huge day doesn't wash every
// other day out to the palest shade.
function thresholds(counts: number[]): [number, number, number] {
  const active = counts.filter(c => c > 0).sort((a, b) => a - b);
  if (!active.length) return [0, 0, 0];
  const q = (p: number) => active[Math.min(active.length - 1, Math.floor(p * active.length))];
  return [q(0.25), q(0.5), q(0.75)];
}

export function buildHeatmap(activity: WeekActivity[], today = new Date()): Heatmap {
  const todayKey = isoDay(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const sorted = [...activity].sort((a, b) => a.week - b.week);
  const cells = sorted.map(w => w.days.slice(0, 7).map((count, d) => {
    const date = isoDay(w.week * 1000 + d * DAY_MS);
    return { date, count: count || 0, future: date > todayKey };
  }));
  const [q1, q2, q3] = thresholds(cells.flat().filter(c => !c.future).map(c => c.count));
  const weeks: HeatCell[][] = cells.map(col => col.map(c => ({
    ...c,
    level: c.future || c.count === 0 ? 0 : c.count <= q1 ? 1 : c.count <= q2 ? 2 : c.count <= q3 ? 3 : 4,
  })));

  const months: Heatmap['months'] = [];
  weeks.forEach((col, i) => {
    const month = Number(col[0].date.slice(5, 7)) - 1;
    const prev = i ? Number(weeks[i - 1][0].date.slice(5, 7)) - 1 : -1;
    // A label needs ~3 columns of room: skip one crammed against the previous
    // label or hanging off the right edge.
    if (month !== prev && i <= weeks.length - 2 && (!months.length || i - months[months.length - 1].column >= 3)) months.push({ label: MONTHS[month], column: i });
  });

  const days = weeks.flat().filter(c => !c.future);
  let longestStreak = 0, run = 0;
  days.forEach(c => { run = c.count > 0 ? run + 1 : 0; longestStreak = Math.max(longestStreak, run); });
  const busiest = days.reduce<HeatCell | null>((best, c) => (c.count > (best?.count ?? 0) ? c : best), null);

  return {
    weeks,
    months,
    total: days.reduce((n, c) => n + c.count, 0),
    activeDays: days.filter(c => c.count > 0).length,
    longestStreak,
    busiest: busiest ? { date: busiest.date, count: busiest.count } : null,
  };
}

// GitHub computes these statistics in the background: the first request may
// answer 202 with no body. Ask again a few times before giving up.
export async function fetchCommitActivity(owner: string, repo: string, token: string | null | undefined, fetchImpl: typeof fetch = fetch, attempts = 5, waitMs = 2000): Promise<WeekActivity[] | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `token ${token}`;
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/stats/commit_activity`;
  for (let i = 0; i < attempts; i++) {
    const res = await fetchImpl(url, { headers });
    if (res.status === 202) { await new Promise(r => setTimeout(r, waitMs)); continue; }
    if (res.status === 204) return [];
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const body = await res.json();
    return Array.isArray(body) ? body : [];
  }
  return null; // still computing
}
