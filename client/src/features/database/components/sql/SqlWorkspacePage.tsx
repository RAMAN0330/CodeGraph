import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bookmark, Clipboard, Download, History, Loader2, Play, Search, SquareTerminal, Table2, Trash2, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Page, PageHeader, Segmented } from '../../../../shared/components/Page';
import { usePersistentState } from '../../../../shared/hooks/usePersistentState';
import { qualifiedName, sqlApi, toCsv, type ExplainResult, type HistoryEntry, type QueryResult, type SavedQuery } from '../../services/sqlApi';
import type { Schema } from '../../types';
import SqlEditor from './SqlEditor';
import ResultGrid from './ResultGrid';
import PlanView from './PlanView';

interface SqlWorkspacePageProps {
  projectId: number;
  schema: Schema;
  // A statement handed over from another page (schema explorer, data browser).
  pendingSql: string | null;
  onPendingSqlConsumed: () => void;
}

const LIMITS = [100, 500, 1000, 5000];

export default function SqlWorkspacePage({ projectId, schema, pendingSql, onPendingSqlConsumed }: SqlWorkspacePageProps) {
  const [sql, setSql] = usePersistentState<string>(`cg.db.${projectId}.sqlDraft`, '');
  const [limit, setLimit] = usePersistentState<number>(`cg.db.${projectId}.sqlLimit`, 500);
  const [railTab, setRailTab] = usePersistentState<string>('cg.db.sqlRailTab', 'tables');
  const [resultTab, setResultTab] = useState<'results' | 'plan'>('results');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [plan, setPlan] = useState<ExplainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<'run' | 'explain' | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [saveName, setSaveName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (pendingSql) { setSql(pendingSql); onPendingSqlConsumed(); }
  }, [pendingSql, onPendingSqlConsumed, setSql]);

  const loadLists = useCallback(() => {
    sqlApi.history(projectId).then(setHistory).catch(() => undefined);
    sqlApi.saved(projectId).then(setSaved).catch(() => undefined);
  }, [projectId]);
  useEffect(() => { loadLists(); return () => abortRef.current?.abort(); }, [loadLists]);

  const identifiers = useMemo(() => {
    const names = new Set<string>();
    for (const table of schema.tables) {
      names.add(qualifiedName(table));
      for (const column of table.columns) names.add(column.name);
    }
    return [...names];
  }, [schema]);

  const tables = useMemo(() => {
    const needle = tableFilter.trim().toLowerCase();
    return schema.tables.filter(t => !needle || qualifiedName(t).toLowerCase().includes(needle));
  }, [schema, tableFilter]);

  const execute = async (mode: 'run' | 'explain') => {
    if (!sql.trim() || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(mode);
    setError(null);
    try {
      if (mode === 'run') {
        setResult(await sqlApi.run(projectId, sql, limit, controller.signal));
        setResultTab('results');
      } else {
        setPlan(await sqlApi.explain(projectId, sql, controller.signal));
        setResultTab('plan');
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      if (abortRef.current === controller) setRunning(null);
      loadLists();
    }
  };

  const save = async () => {
    if (!saveName.trim() || !sql.trim()) return;
    try {
      await sqlApi.save(projectId, saveName.trim(), sql);
      setSaveOpen(false);
      setSaveName('');
      setNotice('Query saved for everyone on this project.');
      loadLists();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const copyCsv = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(toCsv(result.columns, result.rows));
      setNotice(`Copied ${result.rowCount} rows as CSV.`);
    } catch {
      setNotice('The browser blocked clipboard access; use Download instead.');
    }
  };

  const downloadCsv = () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([toCsv(result.columns, result.rows)], { type: 'text/csv' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'query-result.csv' });
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  return (
    <Page>
      <PageHeader
        icon={SquareTerminal}
        tone="database"
        title="SQL"
        description="Write and run read-only queries against this database. Ctrl+Enter runs, Explain shows the plan without running. Results stop at the row limit."
      />
    <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] gap-3 max-[900px]:grid-cols-1">
      <Tabs value={railTab} onValueChange={setRailTab} className="flex min-h-0 flex-col rounded-xl border bg-[var(--surface-subtle)] p-2">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tables" title="Tables"><Table2 className="size-3.5" /></TabsTrigger>
          <TabsTrigger value="saved" title="Saved queries"><Bookmark className="size-3.5" /></TabsTrigger>
          <TabsTrigger value="history" title="History"><History className="size-3.5" /></TabsTrigger>
        </TabsList>
        <TabsContent value="tables" className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
          <div className="relative">
            <Search className="absolute top-2.5 left-2 size-3.5 text-muted-foreground" />
            <Input value={tableFilter} onChange={e => setTableFilter(e.target.value)} placeholder="Filter tables" className="h-8 pl-7 text-xs" aria-label="Filter tables" />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <ul className="space-y-0.5 pr-2">
              {tables.map(table => (
                <li key={qualifiedName(table)}>
                  <button
                    type="button"
                    onClick={() => setSql(`SELECT *\nFROM ${qualifiedName(table)}\nLIMIT 100`)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border-0 bg-transparent px-2 py-1 text-left text-xs hover:bg-accent"
                    title={table.columns.map(c => `${c.name} ${c.type}`).join('\n')}
                  >
                    <span className="truncate font-mono">{qualifiedName(table)}</span>
                    {!!table.rowEstimate && <span className="shrink-0 text-[10px] text-muted-foreground">{Intl.NumberFormat(undefined, { notation: 'compact' }).format(table.rowEstimate)}</span>}
                  </button>
                </li>
              ))}
              {!tables.length && <li className="px-2 py-4 text-center text-xs text-muted-foreground">No tables match.</li>}
            </ul>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="saved" className="mt-2 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <ul className="space-y-1 pr-2">
              {saved.map(query => (
                <li key={query.id} className="group rounded border p-2 text-xs hover:bg-accent/50">
                  <div className="flex items-center gap-1">
                    <button type="button" className="cursor-pointer border-0 bg-transparent min-w-0 flex-1 truncate text-left font-medium" onClick={() => setSql(query.sql)}>{query.name}</button>
                    {query.canDelete && (
                      <Button size="icon" variant="ghost" className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${query.name}`}
                        onClick={() => sqlApi.removeSaved(projectId, query.id).then(loadLists).catch(e => setError(e.message))}>
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">{query.sql}</div>
                  {query.username && <div className="text-[10px] text-muted-foreground">by {query.username}</div>}
                </li>
              ))}
              {!saved.length && <li className="px-2 py-4 text-center text-xs text-muted-foreground">Save a query to share it with this project.</li>}
            </ul>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="history" className="mt-2 min-h-0 flex-1">
          <ScrollArea className="h-full">
            <ul className="space-y-1 pr-2">
              {history.map(entry => (
                <li key={entry.id}>
                  <button type="button" onClick={() => setSql(entry.sql)} className="w-full cursor-pointer rounded border bg-transparent p-2 text-left text-xs hover:bg-accent/50">
                    <div className="line-clamp-2 font-mono text-[11px]">{entry.sql}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {entry.error ? <Badge variant="destructive" className="h-4 px-1 text-[9px]">failed</Badge> : entry.rowCount != null && <span>{entry.rowCount} rows</span>}
                      {entry.durationMs != null && <span>{entry.durationMs} ms</span>}
                      <span className="ml-auto">{new Date(entry.ranAt).toLocaleTimeString()}</span>
                    </div>
                  </button>
                </li>
              ))}
              {!history.length && <li className="px-2 py-4 text-center text-xs text-muted-foreground">Statements you run appear here.</li>}
            </ul>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="grid min-h-0 grid-rows-[auto_minmax(120px,36%)_auto_minmax(0,1fr)] gap-2 max-[900px]:min-h-[640px]">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => execute('run')} disabled={!sql.trim() || running !== null}>
            {running === 'run' ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run
          </Button>
          <Button size="sm" variant="outline" onClick={() => execute('explain')} disabled={!sql.trim() || running !== null}>
            {running === 'explain' ? <Loader2 className="size-3.5 animate-spin" /> : <Workflow className="size-3.5" />} Explain
          </Button>
          <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
            <SelectTrigger size="sm" className="w-[120px] text-xs" aria-label="Row limit"><SelectValue /></SelectTrigger>
            <SelectContent>{LIMITS.map(n => <SelectItem key={n} value={String(n)}>{n.toLocaleString()} rows</SelectItem>)}</SelectContent>
          </Select>
          <Popover open={saveOpen} onOpenChange={setSaveOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={!sql.trim()}><Bookmark className="size-3.5" /> Save</Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2">
              <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-2">
                <label className="text-xs font-medium" htmlFor="sql-save-name">Name</label>
                <Input id="sql-save-name" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Top customers by revenue" className="h-8 text-xs" autoFocus />
                <p className="text-[11px] text-muted-foreground">Saving under an existing name replaces that query.</p>
                <Button type="submit" size="sm" className="w-full" disabled={!saveName.trim()}>Save query</Button>
              </form>
            </PopoverContent>
          </Popover>
          <span className="ml-auto text-[11px] text-muted-foreground">Read-only · 15 s timeout · one statement per run</span>
        </div>

        <SqlEditor value={sql} onChange={setSql} onRun={() => execute('run')} onExplain={() => execute('explain')} identifiers={identifiers} />

        <div className="flex min-h-7 items-center gap-2 text-xs" aria-live="polite">
          {error ? (
            <span className="flex min-w-0 items-center gap-1.5 text-destructive"><AlertTriangle className="size-3.5 shrink-0" /><span className="truncate" title={error}>{error}</span></span>
          ) : result && resultTab === 'results' ? (
            <>
              <Badge variant="secondary">{result.rowCount.toLocaleString()} rows</Badge>
              <Badge variant="secondary">{result.durationMs} ms</Badge>
              {result.truncated && <Badge variant="outline" className="border-[color-mix(in_srgb,var(--color-warning)_50%,transparent)] text-[var(--color-warning)]">Stopped at the {result.limit.toLocaleString()}-row limit</Badge>}
            </>
          ) : null}
          {notice && <span className="text-muted-foreground">{notice}</span>}
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={copyCsv} disabled={!result?.rowCount}><Clipboard className="size-3.5" /> Copy CSV</Button>
            <Button size="sm" variant="ghost" onClick={downloadCsv} disabled={!result?.rowCount}><Download className="size-3.5" /> Download</Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <Segmented label="Result view" className="self-start" value={resultTab} onChange={setResultTab} options={[
            { value: 'results', label: 'Results', count: result?.rowCount },
            { value: 'plan', label: 'Plan' },
          ]} />
          <div className="min-h-0 flex-1">
            {resultTab === 'results'
              ? <ResultGrid columns={result?.columns ?? []} rows={result?.rows ?? []} emptyText="Run a statement to see results here. Pick a table on the left to start from SELECT *." />
              : <PlanView plan={plan} />}
          </div>
        </div>
      </div>
    </div>
    </Page>
  );
}
