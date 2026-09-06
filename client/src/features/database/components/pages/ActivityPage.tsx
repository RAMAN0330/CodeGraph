import { useCallback, useState } from 'react';
import { GG, GGErrorBanner } from '../dbConnectTheme';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import type { ActivityEvent } from '../../types';

const KIND_LABEL: Record<ActivityEvent['kind'], string> = {
  slow_query: 'Slow Query', connection_opened: 'Connection opened', connection_closed: 'Connection closed',
  lock_detected: 'Lock detected', schema_changed: 'Schema changed', deadlock: 'Deadlock detected',
};

const FILTERS: { id: 'all' | ActivityEvent['kind']; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'slow_query', label: 'Queries' },
  { id: 'connection_opened', label: 'Connections' },
  { id: 'schema_changed', label: 'Schema' },
  { id: 'deadlock', label: 'Errors' },
];

interface ActivityPageProps { projectId: number; paused: boolean; }

export default function ActivityPage({ projectId, paused }: ActivityPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.activity(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 8000, paused });
  const [filter, setFilter] = useState<'all' | ActivityEvent['kind']>('all');

  if (loading && !data) return <div style={{ padding: 40, color: GG.fg3, fontFamily: GG.mono, fontSize: 12 }}>Loading activity…</div>;
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  const filtered = filter === 'all' ? data.events : data.events.filter(e => e.kind === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 12px', borderRadius: 7, border: `1px solid ${filter === f.id ? GG.accent + '55' : GG.lineStrong}`,
            background: filter === f.id ? `${GG.accent}18` : 'transparent', color: filter === f.id ? GG.accent : GG.fg3,
            fontFamily: GG.mono, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>{f.label}</button>
        ))}
      </div>
      <div style={{ background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p style={{ padding: 24, textAlign: 'center', color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>
            No activity recorded yet. Events appear here as they're detected during live polling.
          </p>
        ) : filtered.map((event, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', borderTop: i > 0 ? `1px solid ${GG.line}` : 'none' }}>
            <span style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg4, flex: '0 0 auto', width: 74 }}>{new Date(event.at).toLocaleTimeString()}</span>
            <span style={{ flex: '0 0 auto', width: 150, fontFamily: GG.sans, fontSize: 12.5, color: GG.fg, fontWeight: 600 }}>{KIND_LABEL[event.kind]}</span>
            <span style={{ flex: 1, minWidth: 0, fontFamily: GG.mono, fontSize: 11, color: GG.fg3 }}>{event.summary}</span>
            {event.detail && <span style={{ flex: '0 0 auto', fontFamily: GG.mono, fontSize: 11, color: GG.fg4 }}>{event.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
