import { useEffect, useId, useRef, useState } from 'react';
import { GG } from '../dbConnectTheme';

interface LiveAreaChartProps {
  points: number[];
  color?: string;
  /** Rendered under the axis when there is not yet a trend to draw. */
  emptyLabel?: string;
  format?: (value: number) => string;
}

const PAD = { top: 16, right: 14, bottom: 22, left: 48 };

/** Rounds a scale ceiling up to 1/2/5 × a power of ten so gridline labels read cleanly. */
function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / magnitude;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * magnitude;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** Catmull-Rom through the samples, with control points clamped inside the plot so a
 *  spike can never bow the curve past the axis it is measured against. */
function smoothPath(pts: { x: number; y: number }[], top: number, bottom: number): string {
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * 0.18;
    const c1y = clamp(p1.y + (p2.y - p0.y) * 0.18, top, bottom);
    const c2x = p2.x - (p3.x - p1.x) * 0.18;
    const c2y = clamp(p2.y - (p3.y - p1.y) * 0.18, top, bottom);
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * A full-bleed area instrument that fills whatever box it is given. It measures
 * itself rather than stretching a fixed viewBox, so the live marker stays round
 * and the axis labels stay at their authored size at any width.
 */
export default function LiveAreaChart({ points, color = GG.accent, emptyLabel, format }: LiveAreaChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const gradientId = useId();

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setBox({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ready = box.w > 0 && box.h > 0 && points.length >= 2;
  const plotW = Math.max(1, box.w - PAD.left - PAD.right);
  const plotH = Math.max(1, box.h - PAD.top - PAD.bottom);
  const ceiling = niceCeil(Math.max(...points, 1));
  /* Below ten the midpoint gridline would round to the same integer as the top one,
     so the scale keeps a decimal until it has the range to drop it. */
  const label = (v: number) =>
    format ? format(v) : ceiling < 10 ? String(Math.round(v * 10) / 10) : Math.round(v).toLocaleString();
  const describe = ready
    ? `Throughput trend over ${points.length} samples, peak ${label(Math.max(...points))}`
    : (emptyLabel ?? 'Throughput trend, not enough samples yet');

  const coords = ready
    ? points.map((v, i) => ({
        x: PAD.left + (i / (points.length - 1)) * plotW,
        y: PAD.top + (1 - clamp(v, 0, ceiling) / ceiling) * plotH,
      }))
    : [];
  const line = ready ? smoothPath(coords, PAD.top, PAD.top + plotH) : '';
  const area = ready
    ? `${line} L${coords[coords.length - 1].x.toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`
    : '';
  const head = coords[coords.length - 1];

  return (
    <div className="perf-chart" ref={hostRef}>
      {box.w > 0 && (
        <svg width={box.w} height={box.h} role="img" aria-label={describe}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.26" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Scale: four intervals, labelled at top, middle and floor. */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = PAD.top + t * plotH;
            const value = ceiling * (1 - t);
            /* No numbers on the scale until there is a trend to measure against it. */
            const labelled = ready && (t === 0 || t === 0.5 || t === 1);
            return (
              <g key={t}>
                <line
                  x1={PAD.left} y1={y} x2={box.w - PAD.right} y2={y}
                  stroke={GG.line}
                  strokeWidth="1"
                  strokeDasharray={t === 1 ? undefined : '2 5'}
                />
                {labelled && (
                  <text x={PAD.left - 10} y={y + 3.5} textAnchor="end" fill={GG.fg3} fontSize="9.5" fontFamily="'JetBrains Mono', monospace">
                    {label(value)}
                  </text>
                )}
              </g>
            );
          })}

          {ready && (
            <>
              <path d={area} fill={`url(#${gradientId})`} />
              <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <line x1={head.x} y1={PAD.top} x2={head.x} y2={PAD.top + plotH} stroke={color} strokeOpacity="0.22" strokeWidth="1" />
              <circle className="perf-chart__pulse" cx={head.x} cy={head.y} r="4" fill={color} />
              <circle cx={head.x} cy={head.y} r="3.2" fill={color} stroke={GG.bg} strokeWidth="1.5" />
            </>
          )}

          <text x={PAD.left} y={box.h - 6} fill={GG.fg3} fontSize="9.5" fontFamily="'JetBrains Mono', monospace">
            {ready ? `oldest of ${points.length}` : 'oldest'}
          </text>
          <text x={box.w - PAD.right} y={box.h - 6} textAnchor="end" fill={GG.fg3} fontSize="9.5" fontFamily="'JetBrains Mono', monospace">
            now
          </text>
        </svg>
      )}

      {!ready && box.w > 0 && (
        <div className="perf-chart__empty">
          <i className="perf-dot perf-dot--alert" style={{ background: GG.fg3 }} />
          {emptyLabel ?? `Collecting — ${points.length} of 2 samples`}
        </div>
      )}
    </div>
  );
}
