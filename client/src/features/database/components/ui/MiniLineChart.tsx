import { useState } from 'react';

interface Series { label: string; color: string; points: number[]; }

interface MiniLineChartProps {
  series: Series[];
  height?: number;
  emptyLabel?: string;
  /** Stretch to the parent's height instead of a fixed one. */
  fill?: boolean;
  /** Formats values in the hover tooltip and the scale. */
  format?: (value: number) => string;
}

/** A small, dependency-free SVG line chart with a hover readout. Renders "not enough data yet" honestly instead of a fake flat line when there are under 2 points. */
export default function MiniLineChart({ series, height = 160, emptyLabel = 'Collecting data…', fill = false, format = v => Math.round(v).toLocaleString() }: MiniLineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const maxLen = Math.max(0, ...series.map(s => s.points.length));
  if (maxLen < 2) {
    return (
      <div className="flex items-center justify-center text-center text-xs text-muted-foreground" style={{ height: fill ? '100%' : height }}>
        {emptyLabel}
      </div>
    );
  }
  const width = 100;
  const allValues = series.flatMap(s => s.points);
  const max = Math.max(1, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = max - min || 1;
  const yOf = (v: number) => height - ((v - min) / range) * (height - 8) - 4;
  const xOf = (i: number, n: number) => (i / (n - 1)) * width;
  const toPath = (points: number[]) => points.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i, points.length).toFixed(2)},${yOf(v).toFixed(2)}`).join(' ');

  const onMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * (maxLen - 1)));
  };
  const hoverPct = hover === null ? 0 : (hover / (maxLen - 1)) * 100;

  return (
    <div className={fill ? 'flex h-full min-h-0 flex-col' : undefined}>
      <div className={fill ? 'relative min-h-0 flex-1' : 'relative'} style={fill ? undefined : { height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block size-full" role="img" aria-label={series.map(s => `${s.label}: latest ${format(s.points[s.points.length - 1])}`).join(', ')}>
          {[0, 0.5, 1].map(t => (
            <line key={t} x1="0" x2={width} y1={4 + t * (height - 8)} y2={4 + t * (height - 8)} stroke="var(--border-subtle)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {hover !== null && <line x1={hoverPct} x2={hoverPct} y1="0" y2={height} stroke="var(--border-medium)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          {series.map(s => (
            <path key={s.label} d={toPath(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <span className="pointer-events-none absolute top-0 left-1 font-mono text-[10px] text-muted-foreground">{format(max)}</span>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 flex flex-col gap-0.5 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm"
            style={hoverPct > 60 ? { right: `${100 - hoverPct}%`, marginRight: 8 } : { left: `${hoverPct}%`, marginLeft: 8 }}
          >
            {series.map(s => s.points[hover] !== undefined && (
              <span key={s.label} className="flex items-center gap-1.5">
                {series.length > 1 && <i className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: s.color }} />}
                <span className="text-muted-foreground">{s.label}</span>
                <b className="font-mono">{format(s.points[hover])}</b>
              </span>
            ))}
          </div>
        )}
      </div>
      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-3.5">
          {series.map(s => (
            <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <i className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
