import { AlertCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';

// ── Shared design tokens for the "connect to a database" experience.
// Used by both the standalone DB Visualizer and the create-project dialog's
// Database step so the two stay visually identical. ─────────────────────────
export const GG = {
  bg: 'var(--bg-canvas)',
  bg1: 'var(--surface-card)',
  bg2: 'var(--surface-subtle)',
  panel: 'var(--surface-card)',
  line: 'color-mix(in srgb, var(--teal-500) 14%, transparent)',
  lineStrong: 'color-mix(in srgb, var(--teal-500) 32%, transparent)',
  fg: 'var(--text-primary)',
  fg2: 'var(--text-primary)',
  fg3: 'var(--text-secondary)',
  fg4: 'var(--text-muted)',
  accent: 'var(--teal-500)',
  info: 'var(--teal-600)',
  magenta: 'var(--chart-purple)',
  cyan: 'var(--chart-cyan)',
  mono: "'JetBrains Mono', monospace" as const,
  sans: "'JetBrains Mono', monospace" as const,
};

export const ggInput: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  background: GG.bg1,
  border: `1px solid ${GG.lineStrong}`,
  borderRadius: 8,
  color: GG.fg,
  fontFamily: GG.mono,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export const ggLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: GG.fg3,
  fontSize: 11,
  fontFamily: GG.mono,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
};

export function MiniSchemaPreview() {
  const tables = [
    { x: 10, y: 10, w: 90, label: 'users', color: GG.info, cols: ['id', 'email', 'name'] },
    { x: 120, y: 10, w: 90, label: 'posts', color: GG.accent, cols: ['id', 'user_id', 'title'] },
    { x: 10, y: 110, w: 90, label: 'sessions', color: GG.magenta, cols: ['id', 'user_id', 'token'] },
    { x: 120, y: 110, w: 90, label: 'tags', color: GG.cyan, cols: ['id', 'post_id', 'name'] },
  ];
  const rowH = 16;
  const headerH = 20;
  return (
    <svg viewBox="0 0 220 180" style={{ width: '100%', height: 'auto' }}>
      <line x1="100" y1="30" x2="120" y2="30" stroke={GG.lineStrong} strokeWidth="1.5" />
      <line x1="55" y1="55" x2="55" y2="110" stroke={GG.lineStrong} strokeWidth="1.5" />
      <line x1="165" y1="55" x2="165" y2="110" stroke={GG.lineStrong} strokeWidth="1.5" />
      {tables.map(t => (
        <g key={t.label}>
          <rect x={t.x} y={t.y} width={t.w} height={headerH + t.cols.length * rowH} rx="5" fill={GG.bg1} stroke={GG.lineStrong} strokeWidth="1" />
          <rect x={t.x} y={t.y} width={t.w} height={headerH} rx="5" fill={t.color + '33'} />
          <rect x={t.x} y={t.y + headerH - 5} width={t.w} height={5} fill={t.color + '33'} />
          <text x={t.x + t.w / 2} y={t.y + 14} textAnchor="middle" fill={t.color} fontSize="8" fontFamily="monospace" fontWeight="bold">{t.label}</text>
          {t.cols.map((col, i) => (
            <text key={col} x={t.x + 6} y={t.y + headerH + 11 + i * rowH} fill={GG.fg3} fontSize="7" fontFamily="monospace">{col}</text>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function GGErrorBanner({ msg }: { msg: string }) {
  return (
    <Alert variant="destructive" style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '10px 12px',
      background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)',
      borderRadius: 8, color: 'var(--color-danger)', fontSize: 12, fontFamily: GG.mono,
    }}>
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      {msg}
    </Alert>
  );
}
