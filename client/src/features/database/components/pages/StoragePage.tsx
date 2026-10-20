import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, HardDrive, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Toolbar } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { EmptyNote } from '../../../../shared/components/Dashboard';
import MiniLineChart from '../ui/MiniLineChart';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { qualifiedName } from '../../services/sqlApi';
import type { StorageTableRow } from '../../types';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Not available';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.abs(bytes), i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${bytes < 0 ? '-' : ''}${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

type SortKey = 'totalBytes' | 'dataBytes' | 'indexBytes' | 'rows';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'rows', label: 'Rows' },
  { key: 'dataBytes', label: 'Data' },
  { key: 'indexBytes', label: 'Indexes' },
  { key: 'totalBytes', label: 'Total' },
];

interface StoragePageProps { projectId: number; paused: boolean; onBrowseTable: (qualifiedName: string) => void; }

export default function StoragePage({ projectId, paused, onBrowseTable }: StoragePageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.storage(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 60000, paused });
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('totalBytes');

  const tables = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.tables ?? [])
      .filter(t => !q || `${t.schema ?? ''}.${t.name}`.toLowerCase().includes(q))
      .sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1));
  }, [data, query, sort]);
  const maxTotal = Math.max(1, ...(data?.tables ?? []).map(t => t.totalBytes));
  // Indexes bigger than the data they cover often point at unused or duplicate indexes.
  const indexHeavy = useMemo(() => (data?.tables ?? []).filter(t => t.indexBytes > t.dataBytes && t.indexBytes >= 64 * 1024), [data]);

  const header = (
    <PageHeader
      icon={HardDrive}
      tone="database"
      title="Storage"
      description="Where disk space goes, table by table. Size snapshots are saved while the dashboard is open, so the growth trend fills in over time."
    />
  );

  if (loading && !data) {
    return (
      <Page>
        {header}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[86px] rounded-xl" />)}</div>
        <Skeleton className="min-h-60 flex-1 rounded-xl" />
      </Page>
    );
  }
  if (error && !data) return <Page>{header}<StateCard icon={AlertTriangle} title="Could not load storage">{error}</StateCard></Page>;
  if (!data) return null;

  const tableBytes = data.tables.reduce((sum, t) => sum + t.totalBytes, 0);
  const indexShare = data.indexesBytes !== null && tableBytes ? Math.round((data.indexesBytes / tableBytes) * 100) : null;
  const browse = (t: StorageTableRow) => onBrowseTable(qualifiedName({ name: t.name, schema: t.schema ?? undefined }));

  return (
    <Page>
      {header}

      <SummaryStrip items={[
        { label: 'Database size', value: formatBytes(data.databaseSizeBytes), sub: `${data.tables.length} tables` },
        {
          label: '7-day growth',
          value: data.growth7dBytes === null ? '—' : `${data.growth7dBytes >= 0 ? '+' : ''}${formatBytes(data.growth7dBytes)}`,
          sub: data.growth7dPercent === null ? 'Collecting history' : `${data.growth7dPercent >= 0 ? '+' : ''}${data.growth7dPercent.toFixed(1)}% this week`,
        },
        { label: 'Largest table', value: data.largestObject?.name ?? '—', sub: data.largestObject ? formatBytes(data.largestObject.sizeBytes) : 'No tables' },
        { label: 'Indexes', value: formatBytes(data.indexesBytes), sub: indexShare === null ? undefined : `${indexShare}% of table storage` },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="flex flex-col p-0">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${tables.length} table${tables.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a table" aria-label="Find a table" className="h-8 w-48 bg-card pl-8 text-xs" />
              </span>
            </Toolbar>
          </div>
          {tables.length === 0 ? (
            <StateCard icon={HardDrive} title={data.tables.length ? 'No tables match' : 'No tables found'}>
              {data.tables.length ? 'Clear the search to see every table.' : 'This database has no user tables yet.'}
            </StateCard>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--surface-subtle)] text-left text-[11px] text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-medium">Table</th>
                    {COLUMNS.map(c => (
                      <th key={c.key} className="px-3 py-2 text-right font-medium" aria-sort={sort === c.key ? 'descending' : undefined}>
                        <button type="button" onClick={() => setSort(c.key)} className={cn('inline-flex items-center gap-1 border-0 bg-transparent p-0 text-inherit hover:text-foreground', sort === c.key && 'text-foreground')}>
                          {c.label}{sort === c.key && <ArrowDown className="size-3" />}
                        </button>
                      </th>
                    ))}
                    <th className="w-[18%] px-4 py-2 font-medium"><span className="sr-only">Share</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tables.map(t => (
                    <tr key={`${t.schema}.${t.name}`} className="hover:bg-[var(--surface-hover)]">
                      <td className="max-w-[16rem] px-4 py-2">
                        <button type="button" className="block max-w-full truncate border-0 bg-transparent p-0 text-left font-mono text-[13px] font-semibold text-inherit hover:text-primary hover:underline" title="Browse rows in Data" onClick={() => browse(t)}>
                          {t.schema && t.schema !== 'public' ? `${t.schema}.` : ''}{t.name}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-mono" title={t.rows === 0 && t.dataBytes > 0 ? 'Statistics not collected yet. Run ANALYZE for a count.' : 'Live row estimate from table statistics'}>{t.rows === null || (t.rows === 0 && t.dataBytes > 0) ? '—' : t.rows.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatBytes(t.dataBytes)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatBytes(t.indexBytes)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{formatBytes(t.totalBytes)}</td>
                      <td className="px-4 py-2">
                        <span className="flex h-1.5 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(3, (t.totalBytes / maxTotal) * 100)}%` }} title={`Data ${formatBytes(t.dataBytes)}, indexes ${formatBytes(t.indexBytes)}`}>
                          <i className="block h-full bg-[var(--viz-1)]" style={{ flexGrow: t.dataBytes, flexBasis: 0 }} />
                          <i className="block h-full bg-[var(--viz-2)]" style={{ flexGrow: t.indexBytes, flexBasis: 0 }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-4 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="h-1.5 w-3 rounded-full bg-[var(--viz-1)]" />Data</span>
            <span className="flex items-center gap-1.5"><i className="h-1.5 w-3 rounded-full bg-[var(--viz-2)]" />Indexes</span>
            <span className="ml-auto">Click a table to browse its rows. Row counts are statistics estimates.</span>
          </div>
        </Section>

        <div className="flex min-h-0 flex-col gap-3 max-lg:min-h-[480px]">
          <Section title="Size over time" meta={data.history.length ? `${data.history.length} snapshots` : undefined} className="min-h-[200px] flex-1" bodyClassName="flex flex-col">
            <MiniLineChart
              fill
              series={[{ label: 'Database size', color: 'var(--viz-1)', points: data.history.map(h => h.sizeBytes) }]}
              format={formatBytes}
              emptyLabel="Not enough history yet. A size snapshot is saved periodically while this dashboard is open."
            />
          </Section>
          <Section title="Worth a look" className="shrink-0" bodyClassName="flex flex-col gap-2 text-xs leading-relaxed">
            {indexHeavy.length ? (
              <>
                <p className="text-muted-foreground">Indexes larger than the table data. Check for unused or overlapping indexes; each one also slows writes.</p>
                <ul className="flex flex-col divide-y rounded-lg border bg-card">
                  {indexHeavy.slice(0, 4).map(t => (
                    <li key={`${t.schema}.${t.name}`} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="truncate font-mono font-semibold">{t.name}</span>
                      <span className="ml-auto shrink-0 font-mono text-muted-foreground">{formatBytes(t.indexBytes)} idx / {formatBytes(t.dataBytes)} data</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <EmptyNote>No table has indexes larger than its data. Large growth or index-heavy tables show up here.</EmptyNote>}
          </Section>
        </div>
      </div>
    </Page>
  );
}
