import { GG } from '../dbConnectTheme';

interface Series { label: string; color: string; points: number[]; }

interface MiniLineChartProps {
  series: Series[];
  height?: number;
  emptyLabel?: string;
  /** Stretch to the parent's height instead of a fixed one. */
  fill?: boolean;
}

/** A small, dependency-free SVG line chart. Renders "not enough data yet" honestly instead of a fake flat line when there's under 2 points. */
export default function MiniLineChart({ series, height = 160, emptyLabel = 'Collecting data…', fill = false }: MiniLineChartProps) {
  const maxLen = Math.max(0, ...series.map(s => s.points.length));
  if (maxLen < 2) {
    return (
      <div style={{ height: fill ? '100%' : height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GG.fg4, fontFamily: GG.mono, fontSize: 11 }}>
        {emptyLabel}
      </div>
    );
  }
  const width = 100;
  const allValues = series.flatMap(s => s.points);
  const max = Math.max(1, ...allValues);
  const min = Math.min(0, ...allValues);
  const range = max - min || 1;

  function toPath(points: number[]): string {
    return points.map((v, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
  }

  return (
    <div style={fill ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } : undefined}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: fill ? undefined : height, flex: fill ? 1 : undefined, minHeight: 0, display: 'block' }}>
        <line x1="0" y1={height - 4} x2={width} y2={height - 4} stroke={GG.line} strokeWidth="0.5" />
        {series.map(s => (
          <path key={s.label} d={toPath(s.points)} fill="none" stroke={s.color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {series.map(s => (
          <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: GG.mono, fontSize: 10.5, color: GG.fg3 }}>
            <i style={{ width: 8, height: 2, background: s.color, display: 'inline-block', borderRadius: 1 }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
