import { useCallback, useState } from 'react';
import { Radio } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState, Panel, StatusBadge, type Tone } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import type { ActivityEvent } from '../../types';

const KIND: Record<ActivityEvent['kind'], { label: string; tone: Tone }> = {
  slow_query: { label: 'Slow query', tone: 'warn' },
  connection_opened: { label: 'Connection opened', tone: 'neutral' },
  connection_closed: { label: 'Connection closed', tone: 'neutral' },
  lock_detected: { label: 'Lock', tone: 'warn' },
  schema_changed: { label: 'Schema change', tone: 'info' },
  deadlock: { label: 'Deadlock', tone: 'bad' },
};

// Each tab covers every kind it names, so "Connections" shows both opens and closes.
const FILTERS: { id: string; label: string; kinds: ActivityEvent['kind'][] | null }[] = [
  { id: 'all', label: 'All', kinds: null },
  { id: 'queries', label: 'Queries', kinds: ['slow_query'] },
  { id: 'connections', label: 'Connections', kinds: ['connection_opened', 'connection_closed'] },
  { id: 'schema', label: 'Schema', kinds: ['schema_changed'] },
  { id: 'problems', label: 'Locks & deadlocks', kinds: ['lock_detected', 'deadlock'] },
];

interface ActivityPageProps { projectId: number; paused: boolean; }

export default function ActivityPage({ projectId, paused }: ActivityPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.activity(projectId), [projectId]);
  const { data, loading, error, refresh } = useDbTelemetry(fetcher, [projectId], { pollMs: 8000, paused });
  const [filter, setFilter] = useState('all');

  if (loading && !data) return <LoadingState label="Loading activity…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const kinds = FILTERS.find(f => f.id === filter)?.kinds ?? null;
  const events = kinds ? data.events.filter(e => kinds.includes(e.kind)) : data.events;

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>{FILTERS.map(f => <TabsTrigger key={f.id} value={f.id}>{f.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <Panel contentClassName="p-0">
        {events.length === 0 ? (
          <EmptyState icon={Radio} title="No events yet">Events appear here as they are detected while the dashboard is polling.</EmptyState>
        ) : (
          <ul className="divide-y text-sm">
            {events.map((event, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-2.5">
                <time className="w-20 shrink-0 font-mono text-xs text-muted-foreground" dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
                <StatusBadge tone={KIND[event.kind].tone} className="w-36 justify-center">{KIND[event.kind].label}</StatusBadge>
                <span className="min-w-0 flex-1 truncate">{event.summary}</span>
                {event.detail && <span className="shrink-0 font-mono text-xs text-muted-foreground">{event.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
