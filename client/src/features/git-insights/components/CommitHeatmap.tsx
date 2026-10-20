import { useEffect, useMemo, useState } from 'react';
import { buildHeatmap, fetchCommitActivity, type Heatmap, type WeekActivity } from '../services/heatmap';
import { githubFetch } from '../../repository/services/github';

// A year of commits, one square per day (services/heatmap.ts). GitHub only
// computes these statistics for the default branch.

interface Props {
  owner: string;
  repo: string;
  token?: string | null;
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

// Yearly stats per repository for this page session: picking a day re-renders
// the Commits page around the heatmap, and this keeps it from re-fetching.
const activityCache = new Map<string, WeekActivity[]>();

const CELL = 10, GAP = 2, STEP = CELL + GAP, LEFT = 30, TOP = 18;
// One hue (the first data colour) at rising strength; empty days stay a recessive surface.
const LEVEL_FILL = [
  'fill-[var(--surface-hover)]',
  'fill-[color-mix(in_srgb,var(--viz-1)_28%,var(--surface-subtle))]',
  'fill-[color-mix(in_srgb,var(--viz-1)_52%,var(--surface-subtle))]',
  'fill-[color-mix(in_srgb,var(--viz-1)_76%,var(--surface-subtle))]',
  'fill-[var(--viz-1)]',
];
const WEEKDAYS: Array<[number, string]> = [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']];

function longDate(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export default function CommitHeatmap({ owner, repo, token, selectedDay, onSelectDay }: Props) {
  const key = `${owner}/${repo}`.toLowerCase();
  const [activity, setActivity] = useState<WeekActivity[] | null | undefined>(() => activityCache.get(key));
  const [error, setError] = useState('');

  useEffect(() => {
    if (activityCache.has(key)) { setActivity(activityCache.get(key)); return; }
    let cancelled = false;
    setActivity(undefined);
    setError('');
    // Without a token, githubFetch routes the request through the server's GitHub proxy.
    fetchCommitActivity(owner, repo, token, ((url: string, init?: RequestInit) => githubFetch(url, null, init)) as typeof fetch)
      .then(a => { if (a) activityCache.set(key, a); if (!cancelled) setActivity(a); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [key, owner, repo, token]);

  const map = useMemo(() => (activity ? buildHeatmap(activity) : null), [activity]);

  const note = (text: string, busy = false) => <section aria-busy={busy} className="shrink-0 rounded-xl border bg-[var(--surface-subtle)] px-4 py-3 text-xs text-muted-foreground">{text}</section>;
  if (error) return note(`A year of commit activity is unavailable right now (${error}).`);
  if (activity === undefined) return note('Loading a year of commit activity…', true);
  if (activity === null) return note("GitHub is still computing this repository's commit statistics. Reopen this page in a minute.");
  if (!map || !map.weeks.length) return note('No commits in the last year.');
  return <HeatmapGrid map={map} selectedDay={selectedDay} onSelectDay={onSelectDay} />;
}

// The grid itself, from computed data.
export function HeatmapGrid({ map, selectedDay, onSelectDay }: { map: Heatmap; selectedDay: string | null; onSelectDay: (day: string | null) => void }) {
  const [hover, setHover] = useState<{ date: string; count: number; x: number; y: number } | null>(null);
  // Keyboard: the heatmap is one tab stop; arrows move a focused day.
  const [focus, setFocus] = useState<{ w: number; d: number } | null>(null);

  const cellAt = (w: number, d: number) => map.weeks[w]?.[d];
  const tooltipFor = (w: number, d: number) => {
    const cell = cellAt(w, d);
    return cell ? { date: cell.date, count: cell.count, x: LEFT + w * STEP + CELL / 2, y: TOP + d * STEP } : null;
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    // First key press lands on today (the last day that isn't in the future).
    const firstFuture = map.weeks[map.weeks.length - 1].findIndex(c => c.future);
    const start = focus ?? { w: map.weeks.length - 1, d: firstFuture === -1 ? 6 : Math.max(0, firstFuture - 1) };
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dw, dd] = focus ? moves[event.key] : [0, 0];
      const next = { w: Math.max(0, Math.min(map.weeks.length - 1, start.w + dw)), d: Math.max(0, Math.min(6, start.d + dd)) };
      if (cellAt(next.w, next.d)?.future) return;
      setFocus(next);
      setHover(tooltipFor(next.w, next.d));
    } else if ((event.key === 'Enter' || event.key === ' ') && focus) {
      event.preventDefault();
      const cell = cellAt(focus.w, focus.d);
      if (cell?.count) onSelectDay(selectedDay === cell.date ? null : cell.date);
    } else if (event.key === 'Escape') {
      onSelectDay(null);
    }
  };

  const width = LEFT + map.weeks.length * STEP;
  const height = TOP + 7 * STEP;
  const busiest = map.busiest;

  return (
    <section className="flex shrink-0 flex-col gap-2 rounded-xl border bg-[var(--surface-subtle)] px-4 py-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold">{map.total.toLocaleString()} commits in the last year</h3>
        <span className="text-xs text-muted-foreground">
          {map.activeDays} active day{map.activeDays === 1 ? '' : 's'} · longest streak {map.longestStreak} day{map.longestStreak === 1 ? '' : 's'}
          {busiest ? ` · busiest ${longDate(busiest.date)} (${busiest.count})` : ''}
          {' · default branch, UTC'}{selectedDay ? '' : ' · click a day to list its commits'}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground" aria-hidden="true">Less {[0, 1, 2, 3, 4].map(l => <svg key={l} width={CELL} height={CELL}><rect width={CELL} height={CELL} rx={2} className={LEVEL_FILL[l]} /></svg>)} More</span>
      </header>
      <div className="max-w-full overflow-x-auto">
        <div className="relative" style={{ width }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--border-focus)]"
            aria-label={`Commit heatmap: ${map.total} commits on ${map.activeDays} days in the last year on the default branch. Use the arrow keys to move between days and Enter to list a day's commits.`}
            onKeyDown={onKeyDown} onBlur={() => { setFocus(null); setHover(null); }}>
            {map.months.map(m => <text key={`${m.label}${m.column}`} className="fill-muted-foreground text-[10px]" x={LEFT + m.column * STEP} y={11}>{m.label}</text>)}
            {WEEKDAYS.map(([d, label]) => <text key={label} className="fill-muted-foreground text-[10px]" x={0} y={TOP + d * STEP + 9}>{label}</text>)}
            {map.weeks.map((week, w) => week.map((cell, d) => cell.future ? null : (
              <rect
                key={cell.date}
                className={`${LEVEL_FILL[cell.level] ?? LEVEL_FILL[0]} ${cell.count ? 'cursor-pointer' : ''} ${selectedDay === cell.date ? 'stroke-foreground stroke-2' : focus?.w === w && focus?.d === d ? 'stroke-foreground stroke-[1.5]' : 'hover:stroke-foreground'}`}
                x={LEFT + w * STEP} y={TOP + d * STEP} width={CELL} height={CELL} rx={2}
                onMouseEnter={() => setHover({ date: cell.date, count: cell.count, x: LEFT + w * STEP + CELL / 2, y: TOP + d * STEP })}
                onMouseLeave={() => setHover(null)}
                onClick={() => cell.count && onSelectDay(selectedDay === cell.date ? null : cell.date)}
              />
            )))}
          </svg>
          {hover && (
            <div className="pointer-events-none absolute z-[2] -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm" style={{ left: hover.x, top: hover.y }} role="status">
              <strong className="font-semibold">{hover.count ? `${hover.count} commit${hover.count === 1 ? '' : 's'}` : 'No commits'}</strong> on {longDate(hover.date)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
