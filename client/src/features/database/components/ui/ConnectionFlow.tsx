import { Database, Users } from 'lucide-react';

// Client connections as three lanes into the database. Active connections
// flow, idle ones sit still, and waiting ones are drawn stalled in amber.

interface Props { active: number; idle: number; waiting: number; max: number | null }

const LANES = [
  { key: 'active', label: 'Active', stroke: 'var(--primary)', y: 22 },
  { key: 'idle', label: 'Idle', stroke: 'var(--muted-foreground)', y: 70 },
  { key: 'waiting', label: 'Waiting', stroke: 'var(--color-warning)', y: 118 },
] as const;

export default function ConnectionFlow({ active, idle, waiting, max }: Props) {
  const counts = { active, idle, waiting };
  const scale = Math.max(1, max ?? active + idle + waiting);
  return (
    <div className="relative my-auto w-full">
      <style>{`@keyframes cf-flow{to{stroke-dashoffset:-20}}.cf-flow{animation:cf-flow .8s linear infinite}@media (prefers-reduced-motion:reduce){.cf-flow{animation:none}}`}</style>
      <svg viewBox="0 0 300 140" className="w-full" role="img" aria-label={`${active} active, ${idle} idle, ${waiting} waiting connections`}>
        {LANES.map(lane => {
          const n = counts[lane.key];
          const width = n ? 1.5 + (n / scale) * 3.5 : 1;
          const d = `M62,70 C130,70 130,${lane.y} 150,${lane.y} L232,${lane.y} C250,${lane.y} 250,70 262,70`;
          return (
            <g key={lane.key} opacity={n ? 1 : 0.35}>
              <path d={d} fill="none" strokeWidth={width} strokeLinecap="round" style={{ stroke: lane.stroke }}
                strokeDasharray={lane.key === 'idle' ? '2 6' : '8 6'} className={lane.key === 'active' && n ? 'cf-flow' : undefined} />
              <text x={191} y={lane.y - 7} textAnchor="middle" fontSize={10} style={{ fill: 'var(--muted-foreground)' }}>{lane.label}</text>
              <text x={191} y={lane.y + 15} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="var(--font-mono, monospace)" style={{ fill: 'var(--foreground)' }}>{n}</text>
            </g>
          );
        })}
      </svg>
      <span className="absolute top-1/2 left-0 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border bg-muted" title="Clients"><Users className="size-4" /></span>
      <span className="absolute top-1/2 right-0 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border bg-primary/10 text-primary" title="Database"><Database className="size-4" /></span>
    </div>
  );
}
