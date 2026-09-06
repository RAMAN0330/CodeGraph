import { useCallback } from 'react';
import { GG, GGErrorBanner } from '../dbConnectTheme';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';

interface ReplicationPageProps { projectId: number; paused: boolean; }

export default function ReplicationPage({ projectId, paused }: ReplicationPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.replication(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 20000, paused });

  if (loading && !data) return <div style={{ padding: 40, color: GG.fg3, fontFamily: GG.mono, fontSize: 12 }}>Loading replication…</div>;
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  if (data.mode === 'standalone') {
    return (
      <div style={{ padding: 24, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, maxWidth: 700 }}>
        <h2 style={{ margin: '0 0 6px', fontFamily: GG.mono, fontSize: 15, color: GG.fg }}>Not applicable</h2>
        <p style={{ margin: 0, color: GG.fg3, fontSize: 13, lineHeight: 1.6 }}>{data.note ?? 'This instance has no replication configured.'}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
        <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
          {data.mode === 'primary' ? 'Replicas' : 'Replica status'}
        </div>
        {data.replicas.length === 0 ? (
          <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>No replicas connected.</p>
        ) : data.replicas.map(r => (
          <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${GG.line}`, fontFamily: GG.mono, fontSize: 12.5 }}>
            <span style={{ color: GG.fg2 }}>{r.name}</span>
            <span style={{ color: GG.fg4 }}>{r.state}</span>
            <span style={{ color: r.lagMs !== null && r.lagMs > 5000 ? 'var(--color-warning)' : GG.fg2, fontWeight: 700 }}>{r.lagMs === null ? 'lag unknown' : `${r.lagMs.toFixed(0)}ms lag`}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
