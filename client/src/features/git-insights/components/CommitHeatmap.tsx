import { useEffect, useMemo, useState } from 'react';
import { buildHeatmap, fetchCommitActivity, type Heatmap, type WeekActivity } from '../services/heatmap';

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

const CELL = 11, GAP = 3, STEP = CELL + GAP, LEFT = 30, TOP = 18;
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
    fetchCommitActivity(owner, repo, token)
      .then(a => { if (a) activityCache.set(key, a); if (!cancelled) setActivity(a); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [key, owner, repo, token]);

  const map = useMemo(() => (activity ? buildHeatmap(activity) : null), [activity]);

  if (error) return <section className="heatmap-card"><p className="guide-empty">Commit activity is unavailable right now ({error}).</p></section>;
  if (activity === undefined) return <section className="heatmap-card heatmap-loading" aria-busy="true"><p className="guide-empty">Loading a year of commit activity…</p></section>;
  if (activity === null) return <section className="heatmap-card"><p className="guide-empty">GitHub is still computing this repository's commit statistics. Reopen this page in a minute.</p></section>;
  if (!map || !map.weeks.length) return <section className="heatmap-card"><p className="guide-empty">No commits in the last year.</p></section>;
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
    <section className="heatmap-card">
      <header className="heatmap-head">
        <h3>{map.total.toLocaleString()} commits in the last year</h3>
        <span>
          {map.activeDays} active day{map.activeDays === 1 ? '' : 's'} · longest streak {map.longestStreak} day{map.longestStreak === 1 ? '' : 's'}
          {busiest ? ` · busiest ${longDate(busiest.date)} (${busiest.count})` : ''}
        </span>
      </header>
      <div className="heatmap-scroll">
        <div className="heatmap-plot" style={{ width }}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} className="heatmap-svg"
            aria-label={`Commit heatmap: ${map.total} commits on ${map.activeDays} days in the last year on the default branch. Use the arrow keys to move between days and Enter to list a day's commits.`}
            onKeyDown={onKeyDown} onBlur={() => { setFocus(null); setHover(null); }}>
            {map.months.map(m => <text key={`${m.label}${m.column}`} className="heatmap-label" x={LEFT + m.column * STEP} y={11}>{m.label}</text>)}
            {WEEKDAYS.map(([d, label]) => <text key={label} className="heatmap-label" x={0} y={TOP + d * STEP + 9}>{label}</text>)}
            {map.weeks.map((week, w) => week.map((cell, d) => cell.future ? null : (
              <rect
                key={cell.date}
                className={`heatmap-cell l${cell.level}${selectedDay === cell.date ? ' selected' : ''}${focus?.w === w && focus?.d === d ? ' focused' : ''}`}
                x={LEFT + w * STEP} y={TOP + d * STEP} width={CELL} height={CELL} rx={2}
                onMouseEnter={() => setHover({ date: cell.date, count: cell.count, x: LEFT + w * STEP + CELL / 2, y: TOP + d * STEP })}
                onMouseLeave={() => setHover(null)}
                onClick={() => cell.count && onSelectDay(selectedDay === cell.date ? null : cell.date)}
              />
            )))}
          </svg>
          {hover && (
            <div className="heatmap-tooltip" style={{ left: hover.x, top: hover.y }} role="status">
              <strong>{hover.count ? `${hover.count} commit${hover.count === 1 ? '' : 's'}` : 'No commits'}</strong> on {longDate(hover.date)}
            </div>
          )}
        </div>
      </div>
      <footer className="heatmap-foot">
        <span>Default branch · days in UTC{selectedDay ? '' : ' · click a day to see its commits'}</span>
        <span className="heatmap-legend" aria-hidden="true">Less {[0, 1, 2, 3, 4].map(l => <i key={l} className={`heatmap-cell l${l}`} />)} More</span>
      </footer>
    </section>
  );
}
