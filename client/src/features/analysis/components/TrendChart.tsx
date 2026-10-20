import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import * as d3 from 'd3';
import { cn } from '@/lib/utils';

// One small SVG chart for the quality pages (trends, tech debt timeline):
// line or grouped bars, sized to its container, one y-axis, recessive grid,
// a legend for 2+ series, a direct label on the last value and a hover /
// keyboard tooltip. Colours come from the data palette (var(--viz-n)).

export interface ChartSeries { label: string; color: string; values: number[] }

const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)'];
export const vizColor = (i: number) => VIZ[i] ?? 'var(--text-muted)';

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function ChartLegend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {series.map(s => (
        <li key={s.label} className="flex items-center gap-1.5">
          <i className="h-2 w-3 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.label}
        </li>
      ))}
    </ul>
  );
}

export default function TrendChart({
  kind = 'line', labels, sublabels, series, format = v => v.toLocaleString(), zero = kind === 'bar',
  tooltipTitle, onPointClick, ariaLabel, className,
}: {
  kind?: 'line' | 'bar';
  labels: string[];
  sublabels?: string[];
  series: ChartSeries[];
  format?: (v: number) => string;
  /** Start the y-axis at zero. Lines default to the data's own range so small changes stay visible. */
  zero?: boolean;
  tooltipTitle?: (i: number) => ReactNode;
  onPointClick?: (i: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const m = { top: 14, right: kind === 'line' ? 48 : 12, bottom: sublabels ? 34 : 22, left: 44 };
  const w = Math.max(0, width - m.left - m.right);
  const h = Math.max(0, height - m.top - m.bottom);

  const all = series.flatMap(s => s.values);
  let lo = zero ? 0 : Math.min(...all), hi = Math.max(...all, zero ? 1 : -Infinity);
  if (lo === hi) { const pad = Math.max(1, Math.abs(hi) * 0.05); lo = Math.max(zero ? 0 : -Infinity, lo - pad); hi += pad; }
  if (!zero) { const pad = (hi - lo) * 0.12; lo = lo >= 0 ? Math.max(0, lo - pad) : lo - pad; hi += pad; }
  const y = d3.scaleLinear().domain([lo, hi]).nice(4).range([h, 0]);
  const band = d3.scaleBand<number>().domain(d3.range(n)).range([0, w]).paddingInner(0.3).paddingOuter(0.15);
  const point = d3.scalePoint<number>().domain(d3.range(n)).range([0, w]).padding(0.25);
  const cx = (i: number) => kind === 'bar' ? (band(i) ?? 0) + band.bandwidth() / 2 : point(i) ?? 0;
  const inner = kind === 'bar' ? band.bandwidth() : 0;
  const barW = series.length ? Math.max(2, (inner - (series.length - 1) * 2) / series.length) : 0;
  // Thin out x labels so they never collide.
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 64))));
  const fmtTick = d3.format('~s');

  const pick = (clientX: number, target: SVGRectElement) => {
    const x = clientX - target.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(cx(i) - x) < Math.abs(cx(best) - x)) best = i;
    setHover(best);
    return best;
  };

  const tipLeft = hover === null ? 0 : m.left + cx(hover);
  return (
    <div ref={ref} className={cn('relative min-h-[140px] w-full flex-1', className)}>
      {width > 0 && height > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="absolute inset-0 block overflow-visible">
          <g transform={`translate(${m.left},${m.top})`}>
            {y.ticks(4).map(t => (
              <g key={t}>
                <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--text-muted)] text-[11px] tabular-nums">{Math.abs(t) >= 1000 ? fmtTick(t) : t}</text>
              </g>
            ))}
            {labels.map((l, i) => i % every === 0 || i === n - 1 ? (
              <g key={i} transform={`translate(${cx(i)},${h})`}>
                <text y={16} textAnchor="middle" className="fill-[var(--text-muted)] font-mono text-[10.5px]">{l}</text>
                {sublabels && <text y={29} textAnchor="middle" className="fill-[var(--text-muted)] text-[10.5px]">{sublabels[i]}</text>}
              </g>
            ) : null)}
            {hover !== null && <line x1={cx(hover)} x2={cx(hover)} y1={0} y2={h} stroke="var(--border-medium, var(--border-subtle))" strokeDasharray="3 3" />}

            {kind === 'bar' && series.map((s, si) => s.values.map((v, i) => {
              const top = y(Math.max(0, v)), x0 = (band(i) ?? 0) + si * (barW + 2);
              const bh = Math.max(v > 0 ? 2 : 0, y(Math.max(0, lo)) - top);
              const r = Math.min(3, barW / 2, bh);
              // Rounded top, square base.
              return <path key={`${si}-${i}`} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45}
                d={`M${x0},${top + bh} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${top + bh} Z`} />;
            }))}

            {kind === 'line' && series.map(s => {
              const line = d3.line<number>().x((_, i) => cx(i)).y(v => y(v)).curve(d3.curveMonotoneX);
              const last = s.values[n - 1];
              return (
                <g key={s.label}>
                  <path d={line(s.values) ?? ''} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {s.values.map((v, i) => (
                    <circle key={i} cx={cx(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill="var(--surface-card, var(--card))" stroke={s.color} strokeWidth={2} />
                  ))}
                  {last !== undefined && <text x={cx(n - 1) + 8} y={y(last)} dy="0.32em" className="fill-[var(--text-primary)] text-[11px] font-semibold tabular-nums">{format(last)}</text>}
                </g>
              );
            })}

            <rect
              x={0} y={0} width={w} height={h} fill="transparent"
              tabIndex={0} role="slider" aria-label={`${ariaLabel}: use arrow keys to read each point`}
              aria-valuemin={0} aria-valuemax={Math.max(0, n - 1)} aria-valuenow={hover ?? n - 1}
              aria-valuetext={hover === null ? undefined : `${labels[hover]}: ${series.map(s => `${s.label} ${format(s.values[hover])}`).join(', ')}`}
              className={cn('outline-none focus-visible:stroke-[var(--border-focus)]', onPointClick && 'cursor-pointer')}
              onMouseMove={e => pick(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
              onFocus={() => setHover(h0 => h0 ?? n - 1)}
              onClick={e => { const i = pick(e.clientX, e.currentTarget); onPointClick?.(i); }}
              onKeyDown={e => {
                if (e.key === 'ArrowRight') { e.preventDefault(); setHover(i => Math.min(n - 1, (i ?? -1) + 1)); }
                else if (e.key === 'ArrowLeft') { e.preventDefault(); setHover(i => Math.max(0, (i ?? n) - 1)); }
                else if (e.key === 'Enter' && onPointClick && hover !== null) onPointClick(hover);
              }}
            />
          </g>
        </svg>
      )}
      {hover !== null && width > 0 && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-40 max-w-72 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ top: m.top, left: tipLeft, transform: tipLeft > width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}
        >
          <div className="mb-1.5 font-semibold">{tooltipTitle ? tooltipTitle(hover) : labels[hover]}</div>
          {series.map(s => (
            <div key={s.label} className="flex items-center gap-2 py-0.5">
              <i className="size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              <span className="text-muted-foreground">{s.label}</span>
              <b className="ml-auto pl-3 font-mono font-semibold tabular-nums">{format(s.values[hover])}</b>
            </div>
          ))}
          {onPointClick && <div className="mt-1.5 text-[11px] text-muted-foreground">Click to open</div>}
        </div>
      )}
    </div>
  );
}
