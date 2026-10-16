import { useCallback } from 'react';
import { Activity, AlertTriangle, ArrowRight, Gauge, HardDrive, Link2, Radio, Terminal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import LiveAreaChart from '../ui/LiveAreaChart';
import { EmptyState, ErrorState, FactList, LoadingState, Panel, Stat, StatusBadge } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { useRollingSeries } from '../../services/useRollingSeries';
import { formatBytes, healthTone, severityTone, signedBytes } from '../../services/format';
import type { DbNavId } from '../../types';

const CATEGORY_LABEL: Record<string, string> = {
  connections: 'Connections', latency: 'Latency', queries: 'Queries', locks: 'Locks',
  replication: 'Replication', storage: 'Storage', cache: 'Cache', errors: 'Errors',
};

function formatUptime(seconds: number | null): string {
  if (seconds === null) return 'Not available';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days ? `${days}d ${hours}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function ViewAll({ onClick, label = 'View all' }: { onClick: () => void; label?: string }) {
  return <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClick}>{label} <ArrowRight className="size-3" /></Button>;
}

interface OverviewPageProps {
  projectId: number;
  paused: boolean;
  onNavigate: (section: DbNavId) => void;
}

export default function OverviewPage({ projectId, paused, onNavigate }: OverviewPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.overview(projectId), [projectId]);
  const { data, loading, error, refresh } = useDbTelemetry(fetcher, [projectId], { pollMs: 10000, paused });
  const opsHistory = useRollingSeries(data?.opsPerSecond ?? null, `ops-${projectId}`);

  if (loading && !data) return <LoadingState label="Loading overview…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const { connections } = data;
  const saturation = connections.max ? connections.total / connections.max : null;

  return (
    <div className="flex flex-col gap-4">
      {data.activeAlerts.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="size-4" />
          {data.activeAlerts.length} alert{data.activeAlerts.length === 1 ? ' is' : 's are'} firing on this connection.
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-red-700 hover:bg-red-100" onClick={() => onNavigate('alerts')}>Review <ArrowRight className="size-3" /></Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Activity} label="Health score" value={data.healthScore} tone={healthTone(data.healthStatus)}
          hint={data.healthStatus === 'healthy' ? 'All checks passing' : data.healthStatus === 'warning' ? 'Some checks need attention' : data.healthStatus === 'critical' ? 'Critical checks failing' : 'Checking'} />
        <Stat icon={Gauge} label="Round-trip latency" value={data.latencyMs === null ? '—' : `${data.latencyMs.toFixed(0)} ms`} hint={data.latencyMs === null ? 'Not available' : 'From this server'} />
        <Stat icon={Link2} label="Connections" value={connections.total}
          hint={saturation === null ? `${connections.active} active` : `${Math.round(saturation * 100)}% of ${connections.max} max`}
          tone={saturation !== null && saturation > 0.8 ? 'warn' : 'neutral'} onClick={() => onNavigate('performance')} />
        <Stat icon={Zap} label="Operations" value={data.opsPerSecond === null ? '—' : `${data.opsPerSecond.toFixed(0)}/s`} hint={data.opsPerSecond === null ? 'Needs a second sample' : 'Server-wide, per second'} onClick={() => onNavigate('performance')} />
        <Stat icon={HardDrive} label="Database size" value={formatBytes(data.databaseSizeBytes)}
          hint={data.storageGrowthBytes7d === null ? 'Collecting growth history' : `${signedBytes(data.storageGrowthBytes7d)} in 7 days`} onClick={() => onNavigate('storage')} />
        <Stat icon={AlertTriangle} label="Open issues" value={data.activeIssues} tone={data.criticalIssues > 0 ? 'bad' : data.activeIssues > 0 ? 'warn' : 'good'}
          hint={data.criticalIssues > 0 ? `${data.criticalIssues} critical` : data.activeIssues > 0 ? 'Review health checks' : 'Nothing to review'} onClick={() => onNavigate('alerts')} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Throughput" description="Operations per second, sampled while this page is open"
          action={<ViewAll label="Performance" onClick={() => onNavigate('performance')} />} contentClassName="h-52 p-2">
          <LiveAreaChart points={opsHistory} emptyLabel="Collecting samples…" />
        </Panel>
        <Panel title="Connection" action={<ViewAll label="Details" onClick={() => onNavigate('performance')} />}>
          <FactList rows={[
            { label: 'Host', value: <span className="font-mono text-xs">{data.identity.host}</span> },
            { label: 'Database', value: <span className="font-mono text-xs">{data.identity.database}</span> },
            { label: 'Uptime', value: formatUptime(data.identity.uptimeSeconds) },
            { label: 'Active / idle', value: `${connections.active} / ${connections.idle}` },
            { label: 'Waiting', value: <span className={connections.waiting > 0 ? 'text-amber-600' : undefined}>{connections.waiting}</span> },
            { label: 'Largest table', value: data.largestObject ? `${data.largestObject.name} · ${formatBytes(data.largestObject.sizeBytes)}` : '—' },
          ]} />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Health checks">
          <ul className="divide-y text-sm">
            {data.healthMatrix.map(row => (
              <li key={row.category} className="flex items-center gap-3 py-1.5 first:pt-0 last:pb-0">
                <span className="flex-1">{CATEGORY_LABEL[row.category]}</span>
                {row.detail && <span className="truncate text-xs text-muted-foreground">{row.detail}</span>}
                <StatusBadge tone={healthTone(row.status)}>{row.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Slowest queries" action={<ViewAll onClick={() => onNavigate('queries')} />} contentClassName="p-0">
          {!Array.isArray(data.topQueries) ? (
            <EmptyState icon={Terminal} title="Query statistics are off">{data.topQueries.reason}</EmptyState>
          ) : data.topQueries.length === 0 ? (
            <EmptyState icon={Terminal} title="No queries recorded yet" />
          ) : (
            <ul className="divide-y text-sm">
              {data.topQueries.slice(0, 6).map(q => (
                <li key={q.fingerprint} className="flex items-center gap-3 px-4 py-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs" title={q.query}>{q.query}</code>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{q.avgMs.toFixed(0)} ms</span>
                  <StatusBadge tone={severityTone(q.impact)}>{q.impact}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" action={<ViewAll onClick={() => onNavigate('activity')} />} contentClassName="p-0">
          {data.recentActivity.length === 0 ? (
            <EmptyState icon={Radio} title="Quiet so far">Slow queries, locks and schema changes appear here as they are detected.</EmptyState>
          ) : (
            <ul className="divide-y text-sm">
              {data.recentActivity.slice(0, 6).map((event, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2">
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(event.at).toLocaleTimeString()}</span>
                  <span className="min-w-0 flex-1 truncate">{event.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
