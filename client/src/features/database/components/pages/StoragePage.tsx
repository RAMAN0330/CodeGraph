import { useCallback } from 'react';
import { HardDrive, ListTree, Rows3, Table2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LiveAreaChart from '../ui/LiveAreaChart';
import { ErrorState, LoadingState, Panel, Stat } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { formatBytes, signedBytes } from '../../services/format';
import { qualifiedName } from '../../services/sqlApi';

interface StoragePageProps { projectId: number; paused: boolean; onBrowse: (table: string) => void; }

export default function StoragePage({ projectId, paused, onBrowse }: StoragePageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.storage(projectId), [projectId]);
  const { data, loading, error, refresh } = useDbTelemetry(fetcher, [projectId], { pollMs: 60000, paused });

  if (loading && !data) return <LoadingState label="Loading storage…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;

  const largest = Math.max(1, ...data.tables.map(t => t.totalBytes));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={HardDrive} label="Database size" value={formatBytes(data.databaseSizeBytes)} />
        <Stat icon={TrendingUp} label="Growth, 7 days" value={data.growth7dBytes === null ? '—' : signedBytes(data.growth7dBytes)}
          hint={data.growth7dPercent === null ? 'Collecting history' : `${data.growth7dPercent >= 0 ? '+' : ''}${data.growth7dPercent.toFixed(1)}%`} />
        <Stat icon={Table2} label="Largest table" value={data.largestObject?.name ?? '—'} hint={data.largestObject ? formatBytes(data.largestObject.sizeBytes) : undefined} />
        <Stat icon={ListTree} label="Index size" value={formatBytes(data.indexesBytes)}
          hint={data.databaseSizeBytes && data.indexesBytes !== null ? `${Math.round((data.indexesBytes / data.databaseSizeBytes) * 100)}% of the database` : undefined} />
      </div>

      <Panel title="Size over time" description="Snapshots are taken while a dashboard is open" contentClassName="h-44 p-2">
        <LiveAreaChart points={data.history.map(h => h.sizeBytes)} name="Database size" format={v => formatBytes(v)} emptyLabel="Not enough history yet" />
      </Panel>

      <Panel title="Tables by size" description={`${data.tables.length} tables`} contentClassName="p-0">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Table</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Data</TableHead>
              <TableHead className="text-right">Indexes</TableHead>
              <TableHead className="w-[28%]">Total</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.tables.map(t => (
              <TableRow key={`${t.schema}.${t.name}`}>
                <TableCell className="font-mono text-xs">{qualifiedName({ name: t.name, schema: t.schema ?? undefined })}</TableCell>
                <TableCell className="text-right tabular-nums">{t.rows === null ? '—' : t.rows.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(t.dataBytes)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(t.indexBytes)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.max(2, (t.totalBytes / largest) * 100)}%` }} /></div>
                    <span className="w-16 text-right font-medium tabular-nums">{formatBytes(t.totalBytes)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onBrowse(qualifiedName({ name: t.name, schema: t.schema ?? undefined }))}>
                    <Rows3 className="size-3.5" /> Browse
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.tables.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No tables found.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}
