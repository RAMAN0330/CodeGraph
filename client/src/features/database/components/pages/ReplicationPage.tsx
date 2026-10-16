import { useCallback } from 'react';
import { GitCompare } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState, Panel, StatusBadge } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';

const LAG_WARN_MS = 5000;

interface ReplicationPageProps { projectId: number; paused: boolean; }

export default function ReplicationPage({ projectId, paused }: ReplicationPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.replication(projectId), [projectId]);
  const { data, loading, error, refresh } = useDbTelemetry(fetcher, [projectId], { pollMs: 20000, paused });

  if (loading && !data) return <LoadingState label="Loading replication…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  if (data.mode === 'standalone') {
    return (
      <Panel>
        <EmptyState icon={GitCompare} title="No replication on this instance">{data.note ?? 'This server is not a primary with replicas, and not a replica itself.'}</EmptyState>
      </Panel>
    );
  }

  return (
    <Panel title={data.mode === 'primary' ? 'Replicas' : 'Replica status'} description={data.mode === 'primary' ? 'This server is a primary' : 'This server is a replica'}
      action={<StatusBadge tone="info">{data.mode}</StatusBadge>} contentClassName="p-0">
      {data.replicas.length === 0 ? (
        <EmptyState icon={GitCompare} title="No replicas connected" />
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow><TableHead>Name</TableHead><TableHead>State</TableHead><TableHead className="text-right">Lag</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.replicas.map(r => (
              <TableRow key={r.name}>
                <TableCell className="font-mono text-xs">{r.name}</TableCell>
                <TableCell><StatusBadge tone={r.state === 'streaming' ? 'good' : 'neutral'}>{r.state}</StatusBadge></TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.lagMs === null ? <span className="text-muted-foreground">Unknown</span>
                    : <span className={r.lagMs > LAG_WARN_MS ? 'font-medium text-amber-600' : undefined}>{r.lagMs.toFixed(0)} ms</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
