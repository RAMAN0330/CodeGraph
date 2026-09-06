import { useCallback } from 'react';
import { Zap, Gauge, Link2, ShieldAlert } from 'lucide-react';
import { GG, GGErrorBanner } from '../dbConnectTheme';
import KpiCard from '../ui/KpiCard';
import MiniLineChart from '../ui/MiniLineChart';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { useRollingSeries } from '../../services/useRollingSeries';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12 }}>
      <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

interface PerformancePageProps { projectId: number; paused: boolean; }

export default function PerformancePage({ projectId, paused }: PerformancePageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.performance(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 8000, paused });
  const opsHistory = useRollingSeries(data?.opsPerSecond ?? null, `perf-ops-${projectId}`);

  if (loading && !data) return <div style={{ padding: 40, color: GG.fg3, fontFamily: GG.mono, fontSize: 12 }}>Loading performance…</div>;
  if (error && !data) return <GGErrorBanner msg={error} />;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', paddingBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiCard icon={<Zap size={14} />} value={data.opsPerSecond === null ? '—' : `${data.opsPerSecond.toFixed(0)}/s`} label="Operations/sec" />
        <KpiCard icon={<Gauge size={14} />} value={data.latency.available ? `${data.latency.p95}ms` : '—'} label="Latency (p95)" sub={data.latency.available ? undefined : data.latency.reason ?? 'Not available'} />
        <KpiCard icon={<Link2 size={14} />} value={data.connections.active} label="Connections" sub={`${data.connections.idle} idle`} />
        <KpiCard icon={<ShieldAlert size={14} />} value={data.connections.blocked} label="Blocked" subTone={data.connections.blocked > 0 ? 'bad' : 'neutral'} />
      </div>

      <Panel title="Throughput">
        <MiniLineChart series={[{ label: 'Ops/sec', color: GG.accent, points: opsHistory }]} />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Panel title="Latency percentiles">
          {data.latency.available ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[['P50', data.latency.p50], ['P95', data.latency.p95], ['P99', data.latency.p99]].map(([label, value]) => (
                <div key={label as string} style={{ padding: '10px 14px', background: GG.bg1, border: `1px solid ${GG.line}`, borderRadius: 8 }}>
                  <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
                  <div style={{ fontFamily: GG.mono, fontSize: 18, fontWeight: 700, color: GG.fg, marginTop: 4 }}>{value}ms</div>
                </div>
              ))}
            </div>
          ) : <p style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 11.5 }}>{data.latency.reason ?? 'Not available'}</p>}
        </Panel>
        <Panel title="Connections">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              ['Active', data.connections.active],
              ['Idle', data.connections.idle],
              ['Waiting', data.connections.waiting],
              ['Blocked', data.connections.blocked],
            ].map(([label, value]) => (
              <div key={label as string} style={{ padding: '10px 14px', background: GG.bg1, border: `1px solid ${GG.line}`, borderRadius: 8 }}>
                <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
                <div style={{ fontFamily: GG.mono, fontSize: 16, fontWeight: 700, color: GG.fg, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Database Engine Intelligence">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          {data.engineIntelligence.map(metric => (
            <div key={metric.label} style={{ padding: '10px 14px', background: GG.bg1, border: `1px solid ${GG.line}`, borderRadius: 8 }}>
              <div style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '.08em' }}>{metric.label}</div>
              <div style={{ fontFamily: GG.mono, fontSize: 15, fontWeight: 700, color: metric.status === 'warning' ? 'var(--color-warning)' : metric.status === 'critical' ? 'var(--color-danger)' : GG.fg, marginTop: 4 }}>{metric.value}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
