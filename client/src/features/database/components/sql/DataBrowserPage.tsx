import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, SquareTerminal, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Page, PageHeader } from '../../../../shared/components/Page';
import { StateCard } from '../../../../shared/components/StateCard';
import { usePersistentState } from '../../../../shared/hooks/usePersistentState';
import { qualifiedName, sqlApi, type BrowseParams, type BrowseResult } from '../../services/sqlApi';
import type { Schema } from '../../types';
import ResultGrid, { type GridSort } from './ResultGrid';

interface DataBrowserPageProps {
  projectId: number;
  schema: Schema;
  onOpenSql: (sql: string) => void;
}

const PAGE_SIZES = [50, 100, 250, 500];
const FRESH_MS = 30_000;
const ALL_COLUMNS = '__all__';

// Pages already seen stay cached briefly, so paging back and forth or
// switching tables is instant instead of re-querying the database.
const pageCache = new Map<string, { at: number; data: BrowseResult }>();

export default function DataBrowserPage({ projectId, schema, onOpenSql }: DataBrowserPageProps) {
  const [tableKey, setTableKey] = usePersistentState<string>(`cg.db.${projectId}.browseTable`, '');
  const [pageSize, setPageSize] = usePersistentState<number>('cg.db.browsePageSize', 100);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<GridSort | null>(null);
  const [filterColumn, setFilterColumn] = useState<string>(ALL_COLUMNS);
  const [filterInput, setFilterInput] = useState('');
  const [filter, setFilter] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Older links (Storage) stored "public.orders" while qualifiedName drops "public.", so match both forms.
  const table = useMemo(() => schema.tables.find(t => qualifiedName(t) === tableKey || `${t.schema ?? 'public'}.${t.name}` === tableKey) ?? schema.tables[0] ?? null, [schema, tableKey]);
  const tables = useMemo(() => {
    const needle = tableSearch.trim().toLowerCase();
    return schema.tables.filter(t => !needle || qualifiedName(t).toLowerCase().includes(needle));
  }, [schema, tableSearch]);

  const selectTable = (key: string) => {
    setTableKey(key);
    setPage(0); setSort(null); setFilterColumn(ALL_COLUMNS); setFilterInput(''); setFilter('');
  };

  useEffect(() => {
    const id = setTimeout(() => { setFilter(filterInput); setPage(0); }, 300);
    return () => clearTimeout(id);
  }, [filterInput]);

  const filterTarget = filterColumn === ALL_COLUMNS ? table?.columns.find(c => /char|text/i.test(c.type))?.name ?? table?.columns[0]?.name : filterColumn;

  useEffect(() => {
    if (!table) return;
    const params: BrowseParams = {
      schema: table.schema, table: table.name, page, pageSize,
      sort: sort?.column, dir: sort?.dir,
      filterColumn: filter ? filterTarget : undefined, filter: filter || undefined,
    };
    const key = JSON.stringify([projectId, params]);
    const hit = pageCache.get(key);
    if (hit && Date.now() - hit.at < FRESH_MS) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- serving the cached page is this effect's job
      setData(hit.data); setError(null); return;
    }
    const controller = new AbortController();
    setLoading(true);
    sqlApi.browse(projectId, params, controller.signal)
      .then(result => { pageCache.set(key, { at: Date.now(), data: result }); setData(result); setError(null); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, table, page, pageSize, sort, filter, filterTarget, reloadToken]);

  const toggleSort = (column: string) => {
    setPage(0);
    setSort(current => (current?.column !== column ? { column, dir: 'asc' } : current.dir === 'asc' ? { column, dir: 'desc' } : null));
  };

  const header = (
    <PageHeader
      icon={Table2}
      tone="database"
      title="Data"
      description="Browse table rows page by page. Click a column to sort, filter on any column, or hand the view to SQL to go further. Read-only."
    />
  );

  if (!schema.tables.length) {
    return <Page>{header}<StateCard icon={Table2} title="No tables to browse">This connection has no tables yet. Create tables in the database, then refresh the schema from Database Settings.</StateCard></Page>;
  }

  const from = data && data.rowCount ? page * pageSize + 1 : 0;
  const to = data ? page * pageSize + data.rowCount : 0;

  return (
    <Page>
      {header}
    <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] gap-3 max-[900px]:grid-cols-1">
      <div className="flex min-h-0 flex-col gap-2 rounded-xl border bg-[var(--surface-subtle)] p-2 max-[900px]:max-h-60">
        <div className="relative">
          <Search className="absolute top-2.5 left-2 size-3.5 text-muted-foreground" />
          <Input value={tableSearch} onChange={e => setTableSearch(e.target.value)} placeholder="Find a table" className="h-8 pl-7 text-xs" aria-label="Find a table" />
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="space-y-0.5 pr-2">
            {tables.map(t => {
              const key = qualifiedName(t);
              const selected = table && key === qualifiedName(table);
              return (
                <li key={key}>
                  <button type="button" onClick={() => selectTable(key)} aria-current={selected ? 'true' : undefined}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 px-2 py-1.5 text-left text-xs ${selected ? 'bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(20,24,32,0.08)]' : 'bg-transparent hover:bg-[var(--surface-hover)]'}`}>
                    <span className="truncate font-mono">{key}</span>
                    {!!t.rowEstimate && <span className="shrink-0 text-[10px] text-muted-foreground">{Intl.NumberFormat(undefined, { notation: 'compact' }).format(t.rowEstimate)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>

      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-mono text-sm font-semibold">{table ? qualifiedName(table) : ''}</h2>
          <Select value={filterColumn} onValueChange={v => { setFilterColumn(v); setPage(0); }}>
            <SelectTrigger size="sm" className="w-[160px] text-xs" aria-label="Filter column"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COLUMNS}>Filter: {filterTarget ?? 'column'}</SelectItem>
              {table?.columns.map(c => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative w-56">
            <Search className="absolute top-2.5 left-2 size-3.5 text-muted-foreground" />
            <Input value={filterInput} onChange={e => setFilterInput(e.target.value)} placeholder="Contains…" className="h-8 pl-7 text-xs" aria-label="Filter value" />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => { pageCache.clear(); setReloadToken(n => n + 1); }} disabled={loading} aria-label="Reload rows">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
            <Button size="sm" variant="outline" onClick={() => table && onOpenSql(`SELECT *\nFROM ${qualifiedName(table)}${sort ? `\nORDER BY ${sort.column} ${sort.dir.toUpperCase()}` : ''}\nLIMIT ${pageSize}`)}>
              <SquareTerminal className="size-3.5" /> Open in SQL
            </Button>
          </div>
        </div>

        {error ? (
          <div className="grid place-items-center rounded-md border bg-card p-6"><StateCard icon={Table2} title="Could not load rows">{error}</StateCard></div>
        ) : data && !loading && data.rowCount === 0 && page === 0 ? (
          <div className="grid place-items-center rounded-md border bg-card">
            <StateCard icon={Table2} title={filter ? 'No rows match the filter' : `${table ? qualifiedName(table) : 'This table'} is empty`}>
              {filter ? `No ${filterTarget} value contains "${filter}". Clear the filter or pick another column.` : 'The table exists but holds no rows yet. Pick another table on the left.'}
            </StateCard>
          </div>
        ) : (
          <ResultGrid columns={data?.columns ?? []} rows={data?.rows ?? []} columnTypes={data?.columnTypes} sort={sort} onSort={toggleSort}
            emptyText={loading ? 'Loading rows…' : 'No rows match.'} />
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{data?.rowCount ? `Rows ${from.toLocaleString()}–${to.toLocaleString()}` : 'No rows'}{data?.estimatedTotal != null && !filter ? ` of about ${data.estimatedTotal.toLocaleString()}` : ''}</span>
          {data && <Badge variant="secondary">{data.durationMs} ms</Badge>}
          <div className="ml-auto flex items-center gap-1">
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger size="sm" className="w-[110px] text-xs" aria-label="Rows per page"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
            </Select>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || loading} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
            <span className="w-14 text-center">Page {page + 1}</span>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setPage(p => p + 1)} disabled={!data?.hasMore || loading} aria-label="Next page"><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      </div>
    </div>
    </Page>
  );
}
