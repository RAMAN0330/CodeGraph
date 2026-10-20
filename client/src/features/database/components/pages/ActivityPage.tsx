import { useCallback, useMemo, useState } from 'react';
import { Activity, AlertTriangle, DatabaseZap, Lock, PlugZap, Search, Shapes, Unplug, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import type { ActivityEvent, DbNavId } from '../../types';

type Kind = ActivityEvent['kind'];
type Group = 'all' | 'queries' | 'connections' | 'locks' | 'schema';

const KIND: Record<Kind, { label: string; icon: LucideIcon; group: Exclude<Group, 'all'>; tone: Tone; section: DbNavId }> = {
  slow_query: { label: 'Slow query', icon: DatabaseZap, group: 'queries', tone: 'warn', section: 'queries' },
  connection_opened: { label: 'Connection opened', icon: PlugZap, group: 'connections', tone: 'neutral', section: 'performance' },
  connection_closed: { label: 'Connection closed', icon: Unplug, group: 'connections', tone: 'neutral', section: 'performance' },
  lock_detected: { label: 'Lock detected', icon: Lock, group: 'locks', tone: 'warn', section: 'performance' },
  deadlock: { label: 'Deadlock', icon: Zap, group: 'locks', tone: 'bad', section: 'performance' },
  schema_changed: { label: 'Schema changed', icon: Shapes, group: 'schema', tone: 'neutral', section: 'schema' },
};

const TRACKED: { title: string; body: string }[] = [
  { title: 'Slow queries', body: 'Recorded when the most expensive statement averages 1 second or more. Needs statement statistics (see Queries).' },
  { title: 'Locks and deadlocks', body: 'Blocked sessions and deadlocks; the live counts are on Performance, where any blocked query is a warning.' },
  { title: 'Connections', body: 'Sessions opening and closing, compared with the server\'s connection limit.' },
  { title: 'Schema changes', body: 'Tables or columns added, altered or dropped since the last check.' },
];

function ago(at: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

interface ActivityPageProps { projectId: number; paused: boolean; onNavigate: (section: DbNavId) => void; }

export default function ActivityPage({ projectId, paused, onNavigate }: ActivityPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.activity(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 8000, paused });
  const [group, setGroup] = useState<Group>('all');
  const [query, setQuery] = useState('');

  const events = useMemo(() => [...(data?.events ?? [])].sort((a, b) => b.at.localeCompare(a.at)), [data]);
  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: events.length, queries: 0, connections: 0, locks: 0, schema: 0 };
    events.forEach(e => { c[KIND[e.kind]?.group ?? 'queries']++; });
    return c;
  }, [events]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter(e => (group === 'all' || KIND[e.kind]?.group === group) && (!q || `${e.summary} ${e.detail ?? ''}`.toLowerCase().includes(q)));
  }, [events, group, query]);

  const header = (
    <PageHeader
      icon={Activity}
      tone="database"
      title="Activity"
      description="A timeline of notable events, checked every 8 seconds while the dashboard is open. The last 50 events are kept in memory on the server and reset when it restarts."
    />
  );

  if (loading && !data) return <Page>{header}<Skeleton className="h-[86px] rounded-xl" /><Skeleton className="min-h-60 flex-1 rounded-xl" /></Page>;
  if (error && !data) return <Page>{header}<StateCard icon={AlertTriangle} title="Could not load activity">{error}</StateCard></Page>;
  if (!data) return null;

  const toggle = (g: Group) => setGroup(group === g ? 'all' : g);
  const last = events[0];

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Events', value: events.length, sub: last ? `Latest ${ago(last.at)}` : 'None yet' },
        { label: 'Slow queries', value: counts.queries, tone: counts.queries ? 'warn' : 'good', sub: group === 'queries' ? 'Click to clear' : '1 s or more on average', onClick: () => toggle('queries') },
        { label: 'Locks and deadlocks', value: counts.locks, tone: counts.locks ? 'bad' : 'good', sub: group === 'locks' ? 'Click to clear' : 'Blocking sessions', onClick: () => toggle('locks') },
        { label: 'Connections', value: counts.connections, sub: group === 'connections' ? 'Click to clear' : 'Opened or closed', onClick: () => toggle('connections') },
        { label: 'Schema changes', value: counts.schema, sub: group === 'schema' ? 'Click to clear' : 'DDL detected', onClick: () => toggle('schema') },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Section className="min-h-[300px]" bodyClassName="flex flex-col p-0">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${visible.length} event${visible.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search events" aria-label="Search events" className="h-8 w-44 bg-card pl-8 text-xs" />
              </span>
              <Segmented label="Filter events" value={group} onChange={setGroup} options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'queries', label: 'Queries' },
                { value: 'locks', label: 'Locks' },
                { value: 'connections', label: 'Connections' },
                { value: 'schema', label: 'Schema' },
              ]} />
            </Toolbar>
          </div>
          {visible.length === 0 ? (
            <StateCard icon={Activity} title={events.length ? 'No events match' : 'Quiet so far'}>
              {events.length ? 'Try another filter or clear the search.' : 'Nothing notable since the server started watching this database. Events appear here as they are detected; keep the dashboard open to keep checking.'}
            </StateCard>
          ) : (
            <ol className="relative min-h-0 flex-1 overflow-y-auto py-1">
              {visible.map((event, i) => {
                const kind = KIND[event.kind] ?? KIND.slow_query;
                const Icon = kind.icon;
                return (
                  <li key={`${event.at}-${i}`} className="group relative flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-hover)]">
                    {i < visible.length - 1 && <span className="absolute top-[42px] bottom-[-10px] left-8 w-px bg-border" aria-hidden="true" />}
                    <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-lg border bg-card', toneText[kind.tone])}><Icon className="size-4" strokeWidth={1.8} /></span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px] font-semibold">{kind.label}</span>
                      <span className="truncate text-xs text-muted-foreground">{event.summary}{event.detail ? ` · ${event.detail}` : ''}</span>
                    </span>
                    <time dateTime={event.at} title={new Date(event.at).toLocaleString()} className="flex shrink-0 flex-col items-end text-right">
                      <span className="font-mono text-xs">{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span className="text-[11px] text-muted-foreground">{ago(event.at)}</span>
                    </time>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-primary" onClick={() => onNavigate(kind.section)} aria-label={`Open ${kind.label} details`}>View</Button>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <Section title="What is recorded" className="min-h-0" bodyClassName="flex flex-col gap-3">
          {TRACKED.map(item => (
            <div key={item.title} className="flex flex-col gap-0.5">
              <strong className="text-[13px] font-semibold">{item.title}</strong>
              <p className="text-xs leading-relaxed text-muted-foreground">{item.body}</p>
            </div>
          ))}
          <p className="mt-auto rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">Pausing the dashboard (header) pauses checks too, so events during a pause are not recorded.</p>
        </Section>
      </div>
    </Page>
  );
}
