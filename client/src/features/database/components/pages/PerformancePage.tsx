import { useCallback } from 'react';
import { AlertTriangle, Gauge } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import LiveAreaChart from '../ui/LiveAreaChart';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { useRollingSeries } from '../../services/useRollingSeries';
import type { HealthStatus } from '../../types';

const STATUS_TONE: Record<HealthStatus, Tone> = { healthy: 'good', warning: 'warn', critical: 'bad', unknown: 'neutral' };

/** Thousands separators for the plain integer counters the engine reports as strings. */
function readable(value: string): string {
  return /^\d+$/.test(value) ? Number(value).toLocaleString() : value;
}

const ENGINE_HINT: Record<string, string> = {
  'Cache Hit Ratio': 'Under 90% warns',
  'Sequential Scans': 'Since stats reset',
  Deadlocks: 'Any warns',
  'Locks (blocked)': 'Any warns, 6+ critical',
  'Temp Files': 'Spills to disk',
};

interface PerformancePageProps { projectId: number; paused: boolean; }

export default function PerformancePage({ projectId, paused }: PerformancePageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.performance(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 8000, paused });
  const opsHistory = useRollingSeries(data?.opsPerSecond ?? null, `perf-ops-${projectId}`);

  const header = (
    <PageHeader
      icon={Gauge}
      tone="database"
      title="Performance"
      description="Live throughput, query latency and the connection pool, refreshed every 8 seconds while this page is open."
    />
  );

  if (loading && !data) {
    return (
      <Page>
        {header}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)}</div>
        <Skeleton className="min-h-60 flex-1 rounded-xl" />
      </Page>
    );
  }
  if (error && !data) return <Page>{header}<StateCard icon={AlertTriangle} title="Could not load performance data">{error}</StateCard></Page>;
  if (!data) return null;

  const { latency, connections } = data;
  const peak = opsHistory.length ? Math.max(...opsHistory) : null;
  const latencyScale = Math.max(1, latency.p99 ?? 0, latency.p95 ?? 0, latency.p50 ?? 0);

  // Pool composition is categorical: the data palette in order. State shows in the numbers, not the fills.
  const segments = [
    { key: 'Active', value: connections.active, color: 'var(--viz-1)', tone: 'neutral' as Tone, hint: 'Running a statement' },
    { key: 'Idle', value: connections.idle, color: 'var(--viz-2)', tone: 'neutral' as Tone, hint: 'Open, doing nothing' },
    { key: 'Waiting', value: connections.waiting, color: 'var(--viz-3)', tone: (connections.waiting ? 'warn' : 'neutral') as Tone, hint: 'Waiting on a lock or I/O' },
    { key: 'Blocked', value: connections.blocked, color: 'var(--viz-4)', tone: (connections.blocked ? 'bad' : 'neutral') as Tone, hint: 'Blocked by another session' },
  ];
  const pool = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <Page>
      {header}

      <SummaryStrip items={data.engineIntelligence.map(metric => ({
        label: metric.label,
        value: readable(metric.value),
        tone: STATUS_TONE[metric.status ?? 'unknown'],
        sub: metric.status === 'warning' || metric.status === 'critical' ? 'Needs a look' : `${metric.status === 'healthy' ? 'OK · ' : ''}${ENGINE_HINT[metric.label] ?? ''}`,
      }))} />

      {data.activeAlerts.length > 0 && (
        <div role="status" className="flex shrink-0 items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-4 py-2 text-xs">
          <AlertTriangle className={cn('size-4', toneText.bad)} />
          <b>{data.activeAlerts.length} alert rule{data.activeAlerts.length === 1 ? ' is' : 's are'} firing</b>
          <span className="text-muted-foreground">See Alerts for the rules and current values.</span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Section
          className="min-h-[280px]"
          title="Throughput"
          meta={`${data.opsPerSecond === null ? 'Not available' : `${data.opsPerSecond.toFixed(0)} ops/s now`}${peak === null ? '' : ` · peak ${peak.toFixed(0)}`} · since this page opened`}
          bodyClassName="flex flex-col"
        >
          <LiveAreaChart points={opsHistory} unit="ops/s" emptyLabel={data.opsPerSecond === null ? 'This connection does not report operation counters.' : `Collecting samples (${opsHistory.length} of 2), one every 8 seconds`} />
        </Section>

        <div className="flex min-h-0 flex-col gap-3 max-lg:min-h-[480px]">
          <Section title="Latency" meta={latency.available ? 'Statement time percentiles' : undefined} className="shrink-0">
            {latency.available ? (
              <div className="flex flex-col gap-2.5">
                {([['p50', latency.p50, 'Typical statement'], ['p95', latency.p95, '1 in 20 is slower'], ['p99', latency.p99, '1 in 100 is slower']] as const).map(([label, value, hint]) => (
                  <div key={label} className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-3">
                    <span className="font-mono text-xs font-semibold">{label}</span>
                    <span className="flex flex-col gap-1">
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <i className="block h-full rounded-full bg-[var(--viz-1)] transition-[width] duration-500" style={{ width: `${Math.max(2, ((value ?? 0) / latencyScale) * 100)}%` }} />
                      </span>
                      <span className="text-[11px] text-muted-foreground">{hint}</span>
                    </span>
                    <b className="text-right font-mono text-[13px]">{value === null ? '—' : `${value} ms`}</b>
                  </div>
                ))}
                <p className="text-[11px] leading-relaxed text-muted-foreground">Estimated from the mean and spread of pg_stat_statements timings, so treat p95 and p99 as approximate.</p>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">{latency.reason ?? 'Percentile latency is not available for this connection.'} Enable statement statistics on the Queries page to see p50, p95 and p99.</p>
            )}
          </Section>

          <Section title="Connection pool" meta={`${pool} ${pool === 1 ? 'connection' : 'connections'}`} className="min-h-0 flex-1">
            <div
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`Pool: ${segments.map(s => `${s.value} ${s.key.toLowerCase()}`).join(', ')}`}
            >
              {pool > 0 && segments.filter(s => s.value > 0).map(s => (
                <i key={s.key} className="block h-full rounded-full transition-[flex-grow] duration-500" style={{ background: s.color, flexGrow: s.value, flexBasis: 0 }} title={`${s.key}: ${s.value}`} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {segments.map(s => (
                <li key={s.key} className="flex min-w-0 items-start gap-2">
                  <i className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="text-xs">{s.key}</span>
                      <b className={cn('font-mono text-[13px]', s.tone !== 'neutral' && toneText[s.tone])}>{s.value}</b>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
              Waiting or blocked sessions that stay above zero mean lock contention: find the blocker in Activity or with
              <code className="mx-1 font-mono text-foreground">SELECT pid, pg_blocking_pids(pid), query FROM pg_stat_activity WHERE wait_event_type = 'Lock';</code>
              The health score warns above 75% of max connections and turns critical above 90%.
            </p>
          </Section>
        </div>
      </div>
    </Page>
  );
}
