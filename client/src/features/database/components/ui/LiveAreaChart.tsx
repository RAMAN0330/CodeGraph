import { useEffect, useId, useRef, useState } from 'react';

interface LiveAreaChartProps {
  points: number[];
  color?: string;
  /** Rendered when there is not yet a trend to draw. */
  emptyLabel?: string;
  format?: (value: number) => string;
  /** Unit shown in the hover tooltip, e.g. "ops/s". */
  unit?: string;
}

const PAD = { top: 14, right: 14, bottom: 22, left: 44 };

/** Rounds a scale ceiling up to 1/2/5 × a power of ten so gridline labels read cleanly. */
function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / magnitude;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * magnitude;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

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
 * A single-series area chart that fills whatever box it is given. It measures
 * itself rather than stretching a fixed viewBox, so markers stay round and the
 * axis labels keep their size at any width. Hover shows the sample under the pointer.
 */
export default function LiveAreaChart({ points, color = 'var(--viz-1)', emptyLabel, format, unit = '' }: LiveAreaChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);
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
    ? `Trend over ${points.length} samples, peak ${label(Math.max(...points))}`
    : (emptyLabel ?? 'Trend, not enough samples yet');

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
  const tip = hover !== null && coords[hover] ? coords[hover] : null;

  const onMove = (event: React.MouseEvent) => {
    if (!ready) return;
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    setHover(Math.round(clamp((x - PAD.left) / plotW, 0, 1) * (points.length - 1)));
  };

  return (
    <div className="relative min-h-0 flex-1" ref={hostRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {box.w > 0 && (
        <svg width={box.w} height={box.h} role="img" aria-label={describe} className="block">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map(t => {
            const y = PAD.top + t * plotH;
            return (
              <g key={t}>
                <line x1={PAD.left} y1={y} x2={box.w - PAD.right} y2={y} stroke="var(--border-subtle)" strokeWidth="1" />
                {ready && (
                  <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize="10" className="fill-muted-foreground font-mono">{label(ceiling * (1 - t))}</text>
                )}
              </g>
            );
          })}

          {ready && (
            <>
              <path d={area} fill={`url(#${gradientId})`} />
              <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={head.x} cy={head.y} r="3.5" fill={color} stroke="var(--surface-card)" strokeWidth="1.5" />
              {tip && (
                <>
                  <line x1={tip.x} y1={PAD.top} x2={tip.x} y2={PAD.top + plotH} stroke="var(--border-medium)" strokeWidth="1" />
                  <circle cx={tip.x} cy={tip.y} r="4" fill={color} stroke="var(--surface-card)" strokeWidth="2" />
                </>
              )}
            </>
          )}

          <text x={PAD.left} y={box.h - 6} fontSize="10" className="fill-muted-foreground font-mono">{ready ? `${points.length - 1} samples ago` : ''}</text>
          <text x={box.w - PAD.right} y={box.h - 6} textAnchor="end" fontSize="10" className="fill-muted-foreground font-mono">now</text>
        </svg>
      )}

      {tip && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm"
          style={{ left: clamp(tip.x, 60, box.w - 60), top: Math.max(tip.y - 8, 34) }}
        >
          <b className="font-mono">{label(points[hover])}{unit && ` ${unit}`}</b>
          <span className="ml-1.5 text-muted-foreground">{hover === points.length - 1 ? 'now' : `${points.length - 1 - hover} sample${points.length - 2 === hover ? '' : 's'} ago`}</span>
        </div>
      )}

      {!ready && box.w > 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {emptyLabel ?? `Collecting samples (${points.length} of 2)`}
        </div>
      )}
    </div>
  );
}
