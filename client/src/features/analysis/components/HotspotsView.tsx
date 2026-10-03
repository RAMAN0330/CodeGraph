import { useMemo, useState } from 'react';
import { Flame } from 'lucide-react';

// Hotspots = complex files that also change often (server/src/analysis/hotspots.ts).
// Churn is only fetched for the most complex files, so the chart plots those.

interface Props { data: any; onOpenFile: (path: string) => void }
interface Point { path: string; complexity: number; churn: number }

const W = 640, H = 340, PAD = { top: 16, right: 20, bottom: 44, left: 52 };
const LABELLED = 5;

// Round axis: a 1/2/2.5/5×10^n step giving about four intervals, and a max on it.
function axis(value: number): { max: number; ticks: number[] } {
  const raw = Math.max(1, value) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const max = Math.ceil(Math.max(1, value) / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

function base(path: string) {
  return path.split('/').pop() || path;
}

function relative(iso: string | null) {
  if (!iso) return '—';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

export default function HotspotsView({ data, onOpenFile }: Props) {
  const status: string = data?.hotspots?.status ?? 'off';
  const windowDays: number = data?.hotspots?.windowDays ?? 180;
  const ranked: Array<{ path: string; complexity: number; churn: number; authors: number; lastChanged: string | null; score: number }> = data?.hotspots?.items ?? [];
  const points: Point[] = useMemo(() => (data?.files ?? [])
    .filter((f: any) => (f.churn ?? 0) > 0 && (f.complexity?.score ?? 0) > 0)
    .map((f: any) => ({ path: f.path, complexity: f.complexity.score, churn: f.churn })), [data]);
  const [hover, setHover] = useState<Point | null>(null);

  if (status !== 'ok') {
    return (
      <div className="gi-page guide-page">
        <h1>Hotspots</h1>
        <div className="guide-card"><p className="guide-empty">
          {status === 'needs-token'
            ? 'Hotspots need commit history, which this analysis ran without. Connect GitHub from the account menu, then Rescan.'
            : 'This analysis predates hotspots. Rescan the repository to compute them.'}
        </p></div>
      </div>
    );
  }

  const top = new Set(ranked.slice(0, LABELLED).map(h => h.path));
  const xAxis = axis(Math.max(...points.map(p => p.churn)));
  const yAxis = axis(Math.max(...points.map(p => p.complexity)));
  const xMax = xAxis.max, yMax = yAxis.max;
  const x = (v: number) => PAD.left + (v / xMax) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);
  // The ranking's own boundary: score ∝ complexity × churn, so the files
  // scoring at least the last labelled one lie beyond the curve
  // complexity × churn = k. Shading it keeps chart and table in agreement.
  const k = ranked.length ? Math.min(...ranked.slice(0, LABELLED).map(h => h.complexity * h.churn)) : 0;
  const curve: string[] = [];
  if (k > 0) {
    const from = Math.max(k / yMax, 0.0001);
    for (let i = 0; i <= 40; i++) {
      const c = from + ((xMax - from) * i) / 40;
      curve.push(`${x(c).toFixed(1)},${y(Math.min(yMax, k / c)).toFixed(1)}`);
    }
  }
  const zone = curve.length ? `M${curve.join(' L')} L${x(xMax)},${y(yMax)} Z` : '';

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Hotspots</h1>
          <p>Complex files that also change often — where bugs and slow reviews concentrate. Churn counts commits in the last {windowDays} days for the {points.length} most complex files.</p>
        </div>
      </header>

      {points.length === 0 ? (
        <div className="guide-card"><p className="guide-empty">None of the most complex files changed in the last {windowDays} days, so there are no hotspots.</p></div>
      ) : (
        <div className="guide-grid hotspots-grid">
          <section className="guide-card hotspots-chart">
            <h2><Flame size={15} /> Complexity vs. change frequency</h2>
            <div className="hotspots-plot">
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scatter plot of ${points.length} files: complexity against commits in the last ${windowDays} days. The ranked table lists the same data.`}>
                {yAxis.ticks.map(t => <g key={`y${t}`}><line className="hotspots-grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} /><text className="hotspots-tick" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
                {xAxis.ticks.map(t => <text key={`x${t}`} className="hotspots-tick" x={x(t)} y={H - PAD.bottom + 18} textAnchor="middle">{t}</text>)}
                {zone && <path className="hotspots-zone" d={zone} />}
                {zone && <text className="hotspots-zone-label" x={W - PAD.right - 8} y={PAD.top + 14} textAnchor="end">Top {Math.min(LABELLED, ranked.length)} hotspots</text>}
                <text className="hotspots-axis" x={(PAD.left + W - PAD.right) / 2} y={H - 8} textAnchor="middle">Commits in the last {windowDays} days</text>
                <text className="hotspots-axis" transform={`translate(14 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`} textAnchor="middle">Complexity</text>
                {points.map(p => (
                  <g key={p.path}>
                    <circle className={`hotspots-dot${top.has(p.path) ? ' hot' : ''}`} cx={x(p.churn)} cy={y(p.complexity)} r={top.has(p.path) ? 6 : 5} />
                    <circle className="hotspots-hit" cx={x(p.churn)} cy={y(p.complexity)} r={12} tabIndex={0} role="button"
                      aria-label={`${p.path}: complexity ${p.complexity}, ${p.churn} commits`}
                      onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}
                      onClick={() => onOpenFile(p.path)} onKeyDown={e => { if (e.key === 'Enter') onOpenFile(p.path); }} />
                  </g>
                ))}
                {points.filter(p => top.has(p.path)).map(p => (
                  <text key={`l${p.path}`} className="hotspots-label" x={x(p.churn) - 9} y={y(p.complexity) - 9} textAnchor="end">{base(p.path)}</text>
                ))}
              </svg>
              {hover && (
                <div className="hotspots-tooltip" style={{ left: `${(x(hover.churn) / W) * 100}%`, top: `${(y(hover.complexity) / H) * 100}%` }} role="status">
                  <strong>{hover.path}</strong>
                  <span>Complexity {hover.complexity} · {hover.churn} commits</span>
                </div>
              )}
            </div>
          </section>

          <section className="guide-card">
            <h2>Ranked</h2>
            <table className="hotspots-table">
              <thead><tr><th scope="col">File</th><th scope="col">Score</th><th scope="col">Commits</th><th scope="col">Authors</th><th scope="col">Last change</th></tr></thead>
              <tbody>
                {ranked.map(h => (
                  <tr key={h.path}>
                    <td><button type="button" className="guide-file" onClick={() => onOpenFile(h.path)} title={h.path}>{h.path}</button></td>
                    <td><b>{h.score}</b></td>
                    <td>{h.churn}</td>
                    <td>{h.authors}</td>
                    <td>{relative(h.lastChanged)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
