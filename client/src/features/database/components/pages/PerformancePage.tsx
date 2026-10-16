import { useCallback } from 'react';
import { Gauge, Timer, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import LiveAreaChart from '../ui/LiveAreaChart';
import { ErrorState, LoadingState, Panel, Stat } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { useRollingSeries } from '../../services/useRollingSeries';
import { healthTone } from '../../services/format';

/** Thousands separators for the plain integer counters the engine reports as strings. */
function readable(value: string): string {
  return /^\d+$/.test(value) ? Number(value).toLocaleString() : value;
}

const POOL = [
  { key: 'active', label: 'Active', color: 'bg-primary' },
  { key: 'waiting', label: 'Waiting', color: 'bg-amber-500' },
  { key: 'blocked', label: 'Blocked', color: 'bg-red-500' },
  { key: 'idle', label: 'Idle', color: 'bg-muted-foreground/30' },
] as const;

interface PerformancePageProps { projectId: number; paused: boolean; }

export default function PerformancePage({ projectId, paused }: PerformancePageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.performance(projectId), [projectId]);
  const { data, loading, error, refresh } = useDbTelemetry(fetcher, [projectId], { pollMs: 8000, paused });
  const opsHistory = useRollingSeries(data?.opsPerSecond ?? null, `perf-ops-${projectId}`);

  if (loading && !data) return <LoadingState label="Loading performance…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const { latency, connections } = data;
  const peak = opsHistory.length ? Math.max(...opsHistory) : null;
  const pool = POOL.reduce((sum, s) => sum + connections[s.key], 0);
  const ms = (v: number | null) => (v === null ? '—' : `${v} ms`);
  const latencyHint = latency.available ? undefined : latency.reason ?? 'Not available';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Zap} label="Throughput" value={data.opsPerSecond === null ? '—' : `${data.opsPerSecond.toFixed(0)}/s`} hint={peak === null ? 'Collecting samples' : `Peak ${peak.toFixed(0)}/s this session`} />
        <Stat icon={Timer} label="Latency p50" value={ms(latency.p50)} hint={latencyHint ?? 'Median statement time'} />
        <Stat icon={Timer} label="Latency p95" value={ms(latency.p95)} hint={latencyHint ? 'Not available' : '1 in 20 statements is slower'} />
        <Stat icon={Gauge} label="Latency p99" value={ms(latency.p99)}
          tone={latency.p50 && latency.p99 && latency.p99 / latency.p50 > 10 ? 'warn' : 'neutral'}
          hint={latencyHint ? 'Not available' : (latency.p50 && latency.p99 ? `${(latency.p99 / latency.p50).toFixed(1)}× the median` : undefined)} />
      </div>

      <Panel className="min-h-40 flex-1" title="Throughput" description="Operations per second, sampled every 8 seconds while this page is open" contentClassName="p-2">
        <LiveAreaChart points={opsHistory} emptyLabel="Collecting samples…" />
      </Panel>

      <div className="grid shrink-0 gap-3 lg:grid-cols-2">
        <Panel title="Connection pool" description={`${pool} connection${pool === 1 ? '' : 's'}`}>
          <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted" role="img"
            aria-label={`Pool: ${POOL.map(s => `${connections[s.key]} ${s.label.toLowerCase()}`).join(', ')}`}>
            {POOL.filter(s => connections[s.key] > 0).map(s => (
              <span key={s.key} className={cn('h-full transition-[flex-grow] duration-500', s.color)} style={{ flexGrow: connections[s.key], flexBasis: 0 }} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {POOL.map(s => {
              const alarming = (s.key === 'waiting' || s.key === 'blocked') && connections[s.key] > 0;
              return (
                <div key={s.key}>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><i className={cn('size-2 rounded-full', s.color)} />{s.label}</div>
                  <div className={cn('text-lg font-semibold tabular-nums', alarming && (s.key === 'blocked' ? 'text-destructive' : 'text-amber-600'))}>{connections[s.key]}</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Engine counters" description="As reported by the database engine">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {data.engineIntelligence.map(metric => {
              const tone = healthTone(metric.status);
              return (
                <div key={metric.label} className="min-w-0">
                  <div className="truncate text-xs text-muted-foreground">{metric.label}</div>
                  <div className={cn('truncate font-semibold tabular-nums', metric.value === 'Not available' ? 'text-sm text-muted-foreground' : 'text-lg',
                    tone === 'bad' && 'text-destructive', tone === 'warn' && 'text-amber-600')}>{readable(metric.value)}</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
