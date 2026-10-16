import { useCallback, useMemo, useState } from 'react';
import { Search, SquareTerminal, Terminal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, ErrorState, FactList, LoadingState, Panel, StatusBadge } from '../ui/dbkit';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import { severityTone } from '../../services/format';
import type { TopQueryRow } from '../../types';

type Filter = 'all' | 'slow' | 'frequent';

interface QueriesPageProps { projectId: number; paused: boolean; onOpenSql: (sql: string) => void; }

export default function QueriesPage({ projectId, paused, onOpenSql }: QueriesPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.queries(projectId), [projectId]);
  const { data, loading, error, refresh } = useDbTelemetry(fetcher, [projectId], { pollMs: 15000, paused });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const frequentThreshold = useMemo(() => {
    if (!data?.queries.length) return Infinity;
    const sorted = data.queries.map(q => q.calls).sort((a, b) => b - a);
    return sorted[Math.floor(sorted.length / 4)] ?? Infinity;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.toLowerCase();
    return data.queries.filter(q => {
      if (needle && !q.query.toLowerCase().includes(needle)) return false;
      if (filter === 'slow' && q.avgMs < 200) return false;
      if (filter === 'frequent' && q.calls < frequentThreshold) return false;
      return true;
    });
  }, [data, search, filter, frequentThreshold]);

  if (loading && !data) return <LoadingState label="Loading query statistics…" />;
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />;
  if (!data) return null;
  if (!data.available) {
    return (
      <Panel>
        <EmptyState icon={Terminal} title="Query statistics are not available">
          <p>{data.reason}</p>
          {/pg_stat_statements/.test(data.reason ?? '') && (
            <p className="mt-2">A database administrator can turn it on by adding <code className="font-mono">pg_stat_statements</code> to <code className="font-mono">shared_preload_libraries</code>, restarting, then running <code className="font-mono">CREATE EXTENSION pg_stat_statements;</code></p>
          )}
        </EmptyState>
      </Panel>
    );
  }

  // Look the selection up in fresh data so its numbers follow each poll.
  const selected: TopQueryRow | null = data.queries.find(q => q.fingerprint === selectedId) ?? null;

  return (
    <div className={cn('grid gap-3', selected && 'xl:grid-cols-[minmax(0,1fr)_380px]')}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search statements" className="h-9 pl-8" aria-label="Search statements" />
          </div>
          <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="slow">Slow (≥200 ms)</TabsTrigger>
              <TabsTrigger value="frequent">Most called</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {data.queries.length} statements</span>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Statement</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead>Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(q => (
                <TableRow key={q.fingerprint} onClick={() => setSelectedId(q.fingerprint)} data-state={q.fingerprint === selectedId ? 'selected' : undefined} className="cursor-pointer">
                  <TableCell className="max-w-[420px] truncate font-mono text-xs" title={q.query}>{q.query}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{q.avgMs.toFixed(0)} ms</TableCell>
                  <TableCell className="text-right tabular-nums">{(q.totalMs / 1000).toFixed(1)} s</TableCell>
                  <TableCell className="text-right tabular-nums">{q.rows === null ? '—' : q.rows.toLocaleString()}</TableCell>
                  <TableCell><StatusBadge tone={severityTone(q.impact)}>{q.impact}</StatusBadge></TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No statements match this filter.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selected && (
        <Panel className="self-start xl:sticky xl:top-0" title="Statement details"
          action={<Button variant="ghost" size="icon" className="size-7" onClick={() => setSelectedId(null)} aria-label="Close details"><X className="size-4" /></Button>}>
          <pre className="mb-3 max-h-56 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap break-words">{selected.query}</pre>
          <FactList rows={[
            { label: 'Impact', value: <StatusBadge tone={severityTone(selected.impact)}>{selected.impact}</StatusBadge> },
            { label: 'Average', value: `${selected.avgMs.toFixed(1)} ms` },
            { label: 'Calls', value: selected.calls.toLocaleString() },
            { label: 'Total time', value: `${(selected.totalMs / 60000).toFixed(1)} min` },
            { label: 'Rows', value: selected.rows === null ? '—' : selected.rows.toLocaleString() },
            { label: 'Fingerprint', value: <span className="font-mono text-xs">{selected.fingerprint}</span> },
          ]} />
          <Button className="mt-4 w-full" variant="outline" onClick={() => onOpenSql(selected.query)}>
            <SquareTerminal className="size-4" /> Open in SQL editor
          </Button>
          {/\$\d/.test(selected.query) && (
            <p className="mt-2 text-xs text-muted-foreground">The database recorded this statement with placeholders such as $1. Put in real values before you run or explain it.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
