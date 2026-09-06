import { useCallback } from 'react';
import { AlertTriangle, ArrowRight, Server, Database, Clock, Activity, Gauge, Link2, Zap, HardDrive } from 'lucide-react';
import { GG, GGErrorBanner } from '../dbConnectTheme';
import KpiCard from '../ui/KpiCard';
import MiniLineChart from '../ui/MiniLineChart';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { useRollingSeries } from '../../services/useRollingSeries';
import type { DbNavId, HealthStatus } from '../../types';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Not available';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusColor(status: HealthStatus): string {
  if (status === 'healthy') return GG.cyan;
  if (status === 'warning') return 'var(--color-warning)';
  if (status === 'critical') return 'var(--color-danger)';
  return GG.fg4;
}

const CATEGORY_LABEL: Record<string, string> = {
  connections: 'Connections', latency: 'Latency', queries: 'Queries', locks: 'Locks',
  replication: 'Replication', storage: 'Storage', cache: 'Cache', errors: 'Errors',
};

interface OverviewPageProps {
  projectId: number;
  paused: boolean;
  onNavigate: (section: DbNavId) => void;
}

export default function OverviewPage({ projectId, paused, onNavigate }: OverviewPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.overview(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 10000, paused });

  const opsHistory = useRollingSeries(data?.opsPerSecond ?? null, `ops-${projectId}`);
  const latencyHistory = useRollingSeries(data?.latencyMs ?? null, `latency-${projectId}`);

  if (loading && !data) return <div style={{ padding: 40, color: GG.fg3, fontFamily: GG.mono, fontSize: 12 }}>Loading overview…</div>;
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  const uptime = data.identity.uptimeSeconds !== null
    ? `${Math.floor(data.identity.uptimeSeconds / 86400)}d ${Math.floor((data.identity.uptimeSeconds % 86400) / 3600)}h`
    : 'Not available';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          [Server, 'Host', data.identity.host],
          [Database, 'Database', data.identity.database],
          [Clock, 'Uptime', uptime],
        ].map(([Icon, label, value]) => {
          const IconComp = Icon as typeof Server;
          return (
            <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, flexShrink: 0, borderRadius: 9, background: `${GG.accent}18`, color: GG.accent }}>
                <IconComp size={16} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>{label as string}</div>
                <div style={{ fontFamily: GG.sans, fontSize: 13, color: GG.fg, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value as string}</div>
              </div>
            </div>
          );
        })}
      </div>

      {data.activeAlerts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(224,108,117,.08)', border: '1px solid rgba(224,108,117,.3)', borderRadius: 8, color: 'var(--color-danger)', fontFamily: GG.mono, fontSize: 12 }}>
          <AlertTriangle size={14} /> {data.activeAlerts.length} alert{data.activeAlerts.length === 1 ? '' : 's'} active
          <button onClick={() => onNavigate('alerts')} style={{ marginLeft: 'auto', background: 'none', border: 0, color: 'var(--color-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, font: 'inherit', fontSize: 11, fontWeight: 700 }}>View <ArrowRight size={12} /></button>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <KpiCard icon={<Activity size={14} />} value={data.healthScore} label="Database Health" sub={data.healthStatus === 'healthy' ? 'Healthy' : data.healthStatus === 'warning' ? 'Warning' : 'Critical'} subTone={data.healthStatus === 'healthy' ? 'good' : data.healthStatus === 'warning' ? 'neutral' : 'bad'} />
        <KpiCard icon={<Gauge size={14} />} value={data.latencyMs === null ? '—' : `${data.latencyMs.toFixed(0)} ms`} label="Round-trip latency" sub={data.latencyMs === null ? 'Not available' : undefined} />
        <KpiCard icon={<Link2 size={14} />} value={data.connections.active} label="Active Connections" sub={`${data.connections.total} total`} onClick={() => onNavigate('performance')} />
        <KpiCard icon={<Zap size={14} />} value={data.opsPerSecond === null ? '—' : `${data.opsPerSecond.toFixed(0)}/s`} label="Operations" sub={data.opsPerSecond === null ? 'Warming up' : undefined} onClick={() => onNavigate('performance')} />
        <KpiCard icon={<HardDrive size={14} />} value={formatBytes(data.databaseSizeBytes)} label="Database Size" sub={data.storageGrowthBytes7d === null ? 'Growth: collecting history' : `${data.storageGrowthBytes7d >= 0 ? '+' : ''}${formatBytes(data.storageGrowthBytes7d)} / 7d`} onClick={() => onNavigate('storage')} />
        <KpiCard icon={<AlertTriangle size={14} />} value={data.activeIssues} label="Active Issues" sub={data.criticalIssues > 0 ? `${data.criticalIssues} critical` : undefined} subTone={data.criticalIssues > 0 ? 'bad' : 'neutral'} onClick={() => onNavigate('alerts')} />
      </div>

      {/* Second row: throughput + connections */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Operations / second</div>
          <MiniLineChart series={[{ label: 'Ops/sec', color: GG.accent, points: opsHistory }, { label: 'Latency (ms)', color: GG.magenta, points: latencyHistory }]} />
        </div>
        <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>Connections</div>
          {[
            ['Active', data.connections.active],
            ['Idle', data.connections.idle],
            ['Waiting', data.connections.waiting],
            ['Total', data.connections.total],
          ].map(([label, value]) => (
            <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: `1px solid ${GG.line}`, fontFamily: GG.mono, fontSize: 12 }}>
              <span style={{ color: GG.fg3 }}>{label}</span>
              <strong style={{ color: GG.fg }}>{value}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Third row: health matrix + live activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Database Health</div>
          {data.healthMatrix.map(row => (
            <div key={row.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${GG.line}`, fontFamily: GG.sans, fontSize: 12.5 }}>
              <span style={{ color: GG.fg2 }}>{CATEGORY_LABEL[row.category]}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: statusColor(row.status), fontWeight: 700, fontSize: 11, textTransform: 'capitalize' }}>
                {row.detail && <span style={{ color: GG.fg4, fontWeight: 400, fontFamily: GG.mono }}>{row.detail}</span>}
                {row.status}
              </span>
            </div>
          ))}
        </div>
        <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em' }}>Live Activity</span>
            <button onClick={() => onNavigate('activity')} style={{ background: 'none', border: 0, color: GG.accent, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, font: 'inherit', fontSize: 11, fontWeight: 700 }}>View Activity <ArrowRight size={12} /></button>
          </div>
          {data.recentActivity.length === 0 ? (
            <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 11.5, fontStyle: 'italic' }}>No notable events since the dashboard started polling.</p>
          ) : data.recentActivity.map((event, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: i > 0 ? `1px solid ${GG.line}` : 'none', fontFamily: GG.mono, fontSize: 11.5 }}>
              <span style={{ color: GG.fg4, flex: '0 0 auto' }}>{new Date(event.at).toLocaleTimeString()}</span>
              <span style={{ color: GG.fg2, flex: 1 }}>{event.summary}</span>
              {event.detail && <span style={{ color: GG.fg4 }}>{event.detail}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Fourth row: top problem queries + storage growth */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em' }}>Top Problem Queries</span>
            <button onClick={() => onNavigate('queries')} style={{ background: 'none', border: 0, color: GG.accent, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, font: 'inherit', fontSize: 11, fontWeight: 700 }}>View all <ArrowRight size={12} /></button>
          </div>
          {Array.isArray(data.topQueries) ? (
            data.topQueries.length === 0 ? <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 11.5, fontStyle: 'italic' }}>No queries recorded yet.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: GG.mono, fontSize: 11.5 }}>
                <thead><tr style={{ color: GG.fg4, textAlign: 'left' }}>
                  <th style={{ fontWeight: 600, paddingBottom: 6 }}>Query</th><th style={{ fontWeight: 600, paddingBottom: 6 }}>Avg</th><th style={{ fontWeight: 600, paddingBottom: 6 }}>Calls</th><th style={{ fontWeight: 600, paddingBottom: 6 }}>Impact</th>
                </tr></thead>
                <tbody>
                  {data.topQueries.map(q => (
                    <tr key={q.fingerprint} style={{ borderTop: `1px solid ${GG.line}` }}>
                      <td style={{ padding: '7px 0', color: GG.fg2, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</td>
                      <td style={{ color: GG.fg2 }}>{q.avgMs.toFixed(0)}ms</td>
                      <td style={{ color: GG.fg2 }}>{q.calls.toLocaleString()}</td>
                      <td style={{ color: q.impact === 'critical' ? 'var(--color-danger)' : q.impact === 'high' ? 'var(--color-warning)' : GG.fg3, fontWeight: 700, textTransform: 'capitalize' }}>{q.impact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 11.5 }}>{data.topQueries.reason}</p>
          )}
        </div>
        <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
          <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>Storage Growth</div>
          <div style={{ fontFamily: GG.mono, fontSize: 20, fontWeight: 700, color: GG.fg }}>{formatBytes(data.databaseSizeBytes)}</div>
          <div style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg4, marginTop: 4 }}>7 day growth</div>
          <div style={{ fontFamily: GG.mono, fontSize: 13, color: data.storageGrowthBytes7d === null ? GG.fg4 : GG.cyan, marginBottom: 12 }}>
            {data.storageGrowthBytes7d === null ? 'Collecting history' : `${data.storageGrowthBytes7d >= 0 ? '+' : ''}${formatBytes(data.storageGrowthBytes7d)}`}
          </div>
          {data.largestObject && (
            <>
              <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.08em' }}>Largest object</div>
              <div style={{ fontFamily: GG.mono, fontSize: 12, color: GG.fg2 }}>{data.largestObject.name} · {formatBytes(data.largestObject.sizeBytes)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
