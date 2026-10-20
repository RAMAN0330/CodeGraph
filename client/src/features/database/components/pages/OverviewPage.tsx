import { useCallback, useMemo } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { GGErrorBanner } from '../dbConnectTheme';
import ConnectionFlow from '../ui/ConnectionFlow';
import AttentionFeed from '../../../../shared/components/AttentionFeed';
import { databaseAttention } from '../../../../shared/services/attention';
import MiniLineChart from '../ui/MiniLineChart';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { useRollingSeries } from '../../services/useRollingSeries';
import type { DbNavId, HealthStatus, Schema } from '../../types';
import { DashboardGrid, EmptyNote, Meter, Metric, Panel } from '../../../../shared/components/Dashboard';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'Not available';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.abs(bytes), i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${bytes < 0 ? '-' : ''}${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const STATUS_TONE: Record<HealthStatus, Tone> = { healthy: 'good', warning: 'warn', critical: 'bad', unknown: 'neutral' };
const STATUS_LABEL: Record<HealthStatus, string> = { healthy: 'Healthy', warning: 'Warning', critical: 'Critical', unknown: 'Unknown' };

interface OverviewPageProps {
  projectId: number;
  schema: Schema;
  paused: boolean;
  onNavigate: (section: DbNavId) => void;
}

export default function OverviewPage({ projectId, schema, paused, onNavigate }: OverviewPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.overview(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 10000, paused });

  const opsHistory = useRollingSeries(data?.opsPerSecond ?? null, `ops-${projectId}`);
  const latencyHistory = useRollingSeries(data?.latencyMs ?? null, `latency-${projectId}`);

  const schemaSummary = useMemo(() => {
    const tables = schema.tables ?? [];
    const largest = [...tables]
      .filter(t => (t.sizeBytes ?? t.rowEstimate ?? 0) > 0)
      .sort((a, b) => (b.sizeBytes ?? b.rowEstimate ?? 0) - (a.sizeBytes ?? a.rowEstimate ?? 0))
      .slice(0, 5);
    return {
      tables: tables.length,
      foreignKeys: tables.reduce((sum, t) => sum + t.foreignKeys.length, 0),
      noPrimaryKey: tables.filter(t => !t.columns.some(c => c.isPrimary)).length,
      largest,
      maxSize: Math.max(1, ...largest.map(t => t.sizeBytes ?? t.rowEstimate ?? 0)),
    };
  }, [schema]);

  const attention = useMemo(() => (data ? databaseAttention({ overview: data, tables: schema.tables }) : []), [data, schema]);

  if (loading && !data) {
    return (
      <DashboardGrid className="lg:grid-cols-6 lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        <Skeleton className="h-full min-h-40 rounded-xl lg:col-span-6" />
        <Skeleton className="h-full min-h-40 rounded-xl lg:col-span-6" />
      </DashboardGrid>
    );
  }
  if (error && !data) return <div className="p-4"><GGErrorBanner msg={error} /></div>;
  if (!data) return null;

  const uptime = data.identity.uptimeSeconds !== null
    ? `up ${Math.floor(data.identity.uptimeSeconds / 86400)}d ${Math.floor((data.identity.uptimeSeconds % 86400) / 3600)}h`
    : null;
  const { connections } = data;

  return (
    <DashboardGrid className={cn('lg:grid-cols-12', data.activeAlerts.length ? 'lg:grid-rows-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]' : 'lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]')}>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-12 lg:grid-cols-6" aria-label="Database health">
        <Metric label="Health" value={data.healthScore} tone={STATUS_TONE[data.healthStatus]} sub={[STATUS_LABEL[data.healthStatus], uptime].filter(Boolean).join(' · ')} />
        <Metric label="Latency" value={data.latencyMs === null ? '—' : `${data.latencyMs.toFixed(0)} ms`} sub={data.latencyMs === null ? 'Not available' : 'Round trip'} />
        <Metric label="Connections" value={connections.max ? `${connections.active}/${connections.max}` : connections.active} sub={`${connections.total} open`} onClick={() => onNavigate('performance')} />
        <Metric label="Operations" value={data.opsPerSecond === null ? '—' : `${data.opsPerSecond.toFixed(0)}/s`} sub={data.opsPerSecond === null ? 'Warming up' : 'Per second'} onClick={() => onNavigate('performance')} />
        <Metric label="Size" value={formatBytes(data.databaseSizeBytes)} sub={data.storageGrowthBytes7d === null ? 'Growth: collecting history' : `${data.storageGrowthBytes7d >= 0 ? '+' : ''}${formatBytes(data.storageGrowthBytes7d)} in 7 days`} onClick={() => onNavigate('storage')} />
        <Metric label="Active issues" value={data.activeIssues} tone={data.criticalIssues ? 'bad' : data.activeIssues ? 'warn' : 'good'} sub={data.criticalIssues ? `${data.criticalIssues} critical` : data.activeIssues ? 'Needs a look' : 'None'} onClick={() => onNavigate('alerts')} />
      </section>

      {data.activeAlerts.length > 0 && (
        <section className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-4 py-2 text-xs lg:col-span-12" role="status">
          <AlertTriangle className={cn('size-4 shrink-0', toneText.bad)} />
          <b>{data.activeAlerts.length} alert{data.activeAlerts.length === 1 ? '' : 's'} firing</b>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => onNavigate('alerts')}>View alerts <ArrowRight className="size-3.5" /></Button>
        </section>
      )}

      <Panel title="Throughput and latency" meta="Live, since this page opened" action="Performance" onAction={() => onNavigate('performance')} className="lg:col-span-6">
        <div className="min-h-32 flex-1">
          <MiniLineChart fill series={[{ label: 'Operations / s', color: 'var(--teal-500)', points: opsHistory }, { label: 'Latency (ms)', color: 'var(--chart-purple)', points: latencyHistory }]} />
        </div>
      </Panel>

      <Panel title="Connections" meta={connections.max ? `${connections.total} of ${connections.max} allowed` : `${connections.total} open`} className="lg:col-span-3">
        <ConnectionFlow active={connections.active} idle={connections.idle} waiting={connections.waiting} max={connections.max} />
      </Panel>

      <Panel title="Needs attention" meta={`${data.healthMatrix.filter(row => row.status === 'healthy').length} of ${data.healthMatrix.length} checks healthy`} className="lg:col-span-3">
        <AttentionFeed items={attention} storageKey={`cg.attention.db.${projectId}`} onOpen={target => onNavigate(target as DbNavId)} limit={4} />
      </Panel>

      <Panel title="Slowest queries" meta="By total time" action="Queries" onAction={() => onNavigate('queries')} className="lg:col-span-6">
        {Array.isArray(data.topQueries) ? (
          data.topQueries.length === 0 ? <EmptyNote>No queries recorded yet.</EmptyNote> : (
            <table className="w-full table-fixed text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="pb-1.5 font-medium">Query</th><th className="w-16 pb-1.5 text-right font-medium">Avg</th><th className="w-20 pb-1.5 text-right font-medium">Calls</th><th className="w-20 pb-1.5 text-right font-medium">Impact</th></tr>
              </thead>
              <tbody>
                {data.topQueries.slice(0, 6).map(q => (
                  <tr key={q.fingerprint} className="border-t">
                    <td className="truncate py-1.5 pr-3 font-mono" title={q.query}>{q.query}</td>
                    <td className="text-right font-mono">{q.avgMs.toFixed(0)} ms</td>
                    <td className="text-right font-mono">{q.calls.toLocaleString()}</td>
                    <td className={cn('text-right font-semibold capitalize', toneText[q.impact === 'critical' ? 'bad' : q.impact === 'high' ? 'warn' : 'neutral'])}>{q.impact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : <EmptyNote>{data.topQueries.reason}</EmptyNote>}
      </Panel>

      <Panel title="Schema" meta={`${data.identity.database} on ${data.identity.host}`} action="Explore" onAction={() => onNavigate('schema')} className="lg:col-span-3">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Tables" value={schemaSummary.tables} />
          <Metric label="Keys" value={schemaSummary.foreignKeys} />
          <Metric label="No PK" value={schemaSummary.noPrimaryKey} tone={schemaSummary.noPrimaryKey ? 'warn' : 'good'} />
        </div>
        <p className="mt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Largest tables</p>
        {schemaSummary.largest.length ? (
          <div className="flex min-h-0 flex-col">
            {schemaSummary.largest.map(t => {
              const size = t.sizeBytes ?? t.rowEstimate ?? 0;
              return <Meter key={`${t.schema ?? ''}.${t.name}`} label={<span className="font-mono">{t.name}</span>} value={(size / schemaSummary.maxSize) * 100} display={t.sizeBytes ? formatBytes(t.sizeBytes) : size.toLocaleString()} />;
            })}
          </div>
        ) : <EmptyNote>{data.largestObject ? `${data.largestObject.name} · ${formatBytes(data.largestObject.sizeBytes)}` : 'Table sizes are not available.'}</EmptyNote>}
      </Panel>

      <Panel title="Recent activity" action="Activity" onAction={() => onNavigate('activity')} className="lg:col-span-3">
        {data.recentActivity.length === 0 ? <EmptyNote>No notable events since the dashboard started polling.</EmptyNote> : (
          <ul className="flex min-h-0 flex-col divide-y text-xs">
            {data.recentActivity.map((event, i) => (
              <li key={i} className="flex gap-2 py-1.5">
                <time className="shrink-0 font-mono text-muted-foreground">{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                <span className="truncate" title={event.detail}>{event.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </DashboardGrid>
  );
}
