import { useCallback } from 'react';
import { AlertTriangle, Network, Server } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { toneText } from '../../../../shared/components/dashboardTones';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';

const LAG_WARN_MS = 5000;
const MODE_LABEL = { standalone: 'Standalone', primary: 'Primary', replica: 'Replica' } as const;

const WATCH: { title: string; body: string }[] = [
  { title: 'Replay lag', body: `How far a replica is behind the primary. Over ${LAG_WARN_MS / 1000} s is flagged here and in the health score; reads from a lagging replica return stale data.` },
  { title: 'Replica state', body: 'A healthy replica reports streaming. Catchup or startup for long means it cannot keep up or keeps reconnecting.' },
  { title: 'WAL retention', body: 'An inactive replication slot keeps write-ahead log on the primary until disk fills. Drop slots for replicas you removed.' },
  { title: 'Failover readiness', body: 'With one replica, losing the primary means a manual promote. Two or more, or a managed HA setup, keep reads and writes available.' },
];

interface ReplicationPageProps { projectId: number; paused: boolean; }

export default function ReplicationPage({ projectId, paused }: ReplicationPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.replication(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 20000, paused });

  const header = (
    <PageHeader
      icon={Network}
      tone="database"
      title="Replication"
      description="Copies of this database kept in sync for failover and read scaling, and how far behind each one is. Checked every 20 seconds."
    />
  );

  if (loading && !data) return <Page>{header}<Skeleton className="h-[86px] rounded-xl" /><Skeleton className="min-h-60 flex-1 rounded-xl" /></Page>;
  if (error && !data) return <Page>{header}<StateCard icon={AlertTriangle} title="Could not load replication status">{error}</StateCard></Page>;
  if (!data) return null;

  const lags = data.replicas.map(r => r.lagMs).filter((v): v is number => v !== null);
  const maxLag = lags.length ? Math.max(...lags) : null;
  const lagging = data.replicas.filter(r => (r.lagMs ?? 0) > LAG_WARN_MS).length;
  const lagScale = Math.max(LAG_WARN_MS * 1.5, maxLag ?? 0);

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Role', value: MODE_LABEL[data.mode], sub: data.mode === 'standalone' ? 'No replicas' : data.mode === 'primary' ? 'Sends changes' : 'Receives changes' },
        { label: 'Replicas', value: data.replicas.length, sub: data.mode === 'replica' ? 'Upstream connections' : 'Connected now' },
        { label: 'Max lag', value: maxLag === null ? '—' : `${(maxLag / 1000).toFixed(1)} s`, tone: maxLag === null ? 'neutral' : maxLag > LAG_WARN_MS ? 'warn' : 'good', sub: `Warns over ${LAG_WARN_MS / 1000} s` },
        { label: 'Lagging', value: lagging, tone: lagging ? 'warn' : data.replicas.length ? 'good' : 'neutral', sub: lagging ? 'Behind the threshold' : 'None' },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        {data.mode === 'standalone' ? (
          <Section title="Standalone instance" icon={Server} className="min-h-[300px]" bodyClassName="flex flex-col gap-4 text-[13px] leading-relaxed">
            <p>{data.note ?? 'This instance has no replicas configured.'} Every read and write goes to this one server, so there is no replication lag to track, and also no standby to fail over to.</p>
            <p className="text-muted-foreground">That is normal for development and many small production databases that rely on backups. Add a replica when you need high availability, want to move reporting reads off the primary, or need a warm copy in another zone.</p>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Check it yourself</h3>
              <code className="rounded-lg border bg-card px-3 py-2 font-mono text-xs">SELECT client_addr, state, replay_lag FROM pg_stat_replication;</code>
              <p className="text-xs text-muted-foreground">On the primary, each connected replica is one row. No rows means standalone. On a replica, <code className="font-mono">SELECT pg_is_in_recovery();</code> returns true.</p>
            </div>
          </Section>
        ) : (
          <Section title={data.mode === 'primary' ? 'Replicas' : 'Upstream'} meta={`${data.replicas.length} connected`} className="min-h-[300px]" bodyClassName="p-0">
            {data.replicas.length === 0 ? (
              <StateCard icon={Network} title="No replicas connected">This server is set up as a {data.mode} but no peer is connected right now. Check the replica's logs and network access.</StateCard>
            ) : (
              <ul className="divide-y">
                {data.replicas.map(r => {
                  const behind = (r.lagMs ?? 0) > LAG_WARN_MS;
                  return (
                    <li key={r.name} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><Server className="size-4" /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate font-mono text-[13px] font-semibold">{r.name}</span>
                        <span className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-muted">
                          <i className={cn('block h-full rounded-full', behind ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]')} style={{ width: `${Math.max(2, ((r.lagMs ?? 0) / lagScale) * 100)}%` }} />
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{r.state}</span>
                      <b className={cn('w-20 text-right font-mono text-xs', behind && toneText.warn)}>{r.lagMs === null ? 'lag unknown' : `${(r.lagMs / 1000).toFixed(1)} s`}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        )}

        <Section title="What to watch" className="min-h-0" bodyClassName="flex flex-col gap-3">
          {WATCH.map(item => (
            <div key={item.title} className="flex flex-col gap-0.5">
              <strong className="text-[13px] font-semibold">{item.title}</strong>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </Section>
      </div>
    </Page>
  );
}
