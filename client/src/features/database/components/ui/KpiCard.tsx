import type { ReactNode } from 'react';
import { GG } from '../dbConnectTheme';

interface KpiCardProps {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  sub?: ReactNode;
  subTone?: 'good' | 'bad' | 'neutral';
  onClick?: () => void;
}

export default function KpiCard({ icon, value, label, sub, subTone = 'neutral', onClick }: KpiCardProps) {
  const tone = subTone === 'good' ? GG.cyan : subTone === 'bad' ? 'var(--color-danger)' : GG.accent;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: '18px 20px', minWidth: 0, width: '100%', height: '100%', boxSizing: 'border-box',
        background: GG.bg1, border: `1px solid ${GG.line}`, borderRadius: 10,
        textAlign: 'left', cursor: onClick ? 'pointer' : 'default', font: 'inherit',
        transition: 'border-color .15s ease',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = GG.lineStrong; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLElement).style.borderColor = GG.line; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: GG.sans, fontSize: 11, color: GG.fg3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
        {icon && (
          <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, flexShrink: 0, borderRadius: 7, background: `${tone}18`, color: tone }}>
            {icon}
          </span>
        )}
      </div>
      <div style={{ fontFamily: GG.mono, fontSize: 26, fontWeight: 700, color: GG.fg, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub !== undefined && (
        <div style={{ fontFamily: GG.mono, fontSize: 11, color: tone, fontWeight: 600, marginTop: 'auto', paddingTop: 2 }}>{sub}</div>
      )}
    </Tag>
  );
}
