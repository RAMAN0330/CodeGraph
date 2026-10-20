import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, DatabaseZap, Search, SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import { dbTelemetryApi, useDbTelemetry } from '../../services/dbTelemetryApi';
import type { TopQueryRow } from '../../types';

type Filter = 'all' | 'slow' | 'frequent';
const SLOW_MS = 200;
const IMPACT_TONE: Record<TopQueryRow['impact'], Tone> = { critical: 'bad', high: 'warn', medium: 'neutral', low: 'neutral' };
const IMPACT_DOT: Record<TopQueryRow['impact'], string> = { critical: 'bg-[var(--color-danger)]', high: 'bg-[var(--color-warning)]', medium: 'bg-muted-foreground', low: 'bg-border' };
const heading = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase';

const formatMs = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(0)} ms`);

// Exact steps to turn on statement statistics in PostgreSQL. The SQL workspace is read-only, so these run in psql as a superuser.
const PG_STEPS: { title: string; body: string; sql: string }[] = [
  {
    title: 'Load the module at server start',
    body: 'Adds pg_stat_statements to the preloaded libraries. If the setting already lists other libraries, keep them and append this one, comma separated.',
    sql: "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';",
  },
  {
    title: 'Restart PostgreSQL',
    body: 'The library only loads at startup, for example: sudo systemctl restart postgresql (or restart the container), then confirm the setting is live.',
    sql: 'SHOW shared_preload_libraries;',
  },
  {
    title: 'Create the extension in this database',
    body: 'Run once per database you want to watch.',
    sql: 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;',
  },
  {
    title: 'Check that it records',
    body: 'A non-zero count means statistics are flowing. This page picks them up on the next refresh.',
    sql: 'SELECT count(*) FROM pg_stat_statements;',
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost" size="icon-sm" aria-label={copied ? 'Copied' : 'Copy SQL'}
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function ImpactLabel({ impact }: { impact: TopQueryRow['impact'] }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold capitalize', toneText[IMPACT_TONE[impact]])}>
      <i className={cn('size-1.5 rounded-full', IMPACT_DOT[impact])} aria-hidden="true" />{impact}
    </span>
  );
}

interface QueriesPageProps { projectId: number; paused: boolean; onOpenSql: (sql: string) => void; }

export default function QueriesPage({ projectId, paused, onOpenSql }: QueriesPageProps) {
  const fetcher = useCallback(() => dbTelemetryApi.queries(projectId), [projectId]);
  const { data, loading, error } = useDbTelemetry(fetcher, [projectId], { pollMs: 15000, paused });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const frequentThreshold = useMemo(() => {
    if (!data?.queries.length) return Infinity;
    const sorted = [...data.queries].map(q => q.calls).sort((a, b) => b - a);
    return sorted[Math.floor(sorted.length / 4)] ?? Infinity;
  }, [data]);

  const filtered = useMemo(() => (data?.queries ?? []).filter(q => {
    if (search && !q.query.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'slow' && q.avgMs < SLOW_MS) return false;
    if (filter === 'frequent' && q.calls < frequentThreshold) return false;
    return true;
  }), [data, search, filter, frequentThreshold]);

  const header = (
    <PageHeader
      icon={DatabaseZap}
      tone="database"
      title="Queries"
      description={`The 20 statements using the most total time, from the database's own statistics. Impact: average over 100 ms is medium, 400 ms high, 1 s critical. Slow filter: ${SLOW_MS} ms or more.`}
    />
  );

  if (loading && !data) return <Page>{header}<Skeleton className="h-[86px] rounded-xl" /><Skeleton className="min-h-60 flex-1 rounded-xl" /></Page>;
  if (error && !data) return <Page>{header}<StateCard icon={AlertTriangle} title="Could not load query statistics">{error}</StateCard></Page>;
  if (!data) return null;

  if (!data.available) {
    const postgres = /pg_stat_statements/i.test(data.reason ?? '');
    return (
      <Page>
        {header}
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
          <Section title={postgres ? 'Turn on pg_stat_statements' : 'Turn on statement statistics'} meta={data.reason} className="min-h-[320px]" bodyClassName="flex flex-col gap-3">
            {postgres ? (
              <ol className="flex flex-col gap-3">
                {PG_STEPS.map((step, i) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-card font-mono text-[11px] font-semibold">{i + 1}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <strong className="text-[13px] font-semibold">{step.title}</strong>
                      <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                      <div className="flex items-center gap-1 rounded-lg border bg-card py-1 pr-1 pl-3">
                        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={step.sql}>{step.sql}</code>
                        <CopyButton text={step.sql} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] leading-relaxed">
                Enable <code className="font-mono">performance_schema</code> (set <code className="font-mono">performance_schema = ON</code> in my.cnf and restart MySQL), then check that{' '}
                <code className="font-mono">SELECT COUNT(*) FROM performance_schema.events_statements_summary_by_digest;</code> returns rows.
              </p>
            )}
          </Section>
          <div className="flex min-h-0 flex-col gap-3">
            <Section title="What you get" className="shrink-0" bodyClassName="text-xs leading-relaxed">
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted-foreground">
                <li><b className="text-foreground">Top statements</b> by total time, with calls, average time and rows.</li>
                <li><b className="text-foreground">Impact</b> ranking so the first fix is obvious.</li>
                <li><b className="text-foreground">Latency percentiles</b> on the Performance page.</li>
                <li><b className="text-foreground">Slow query events</b> (1 s or more on average) in Activity.</li>
              </ul>
            </Section>
            <Section title="Cost" className="min-h-0 flex-1" bodyClassName="text-xs leading-relaxed text-muted-foreground">
              Statement statistics add a small, steady overhead (typically a few percent) and keep normalized statement text, never parameter values. Managed services such as RDS, Cloud SQL and Azure enable it through their parameter groups instead of ALTER SYSTEM.
            </Section>
          </div>
        </div>
      </Page>
    );
  }

  const totalMs = data.queries.reduce((sum, q) => sum + q.totalMs, 0);
  const totalCalls = data.queries.reduce((sum, q) => sum + q.calls, 0);
  const slowest = data.queries.reduce<TopQueryRow | null>((top, q) => (!top || q.avgMs > top.avgMs ? q : top), null);
  const severe = data.queries.filter(q => q.impact === 'critical' || q.impact === 'high').length;
  const selected = filtered.find(q => q.fingerprint === selectedId) ?? filtered[0] ?? null;

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Tracked statements', value: data.queries.length, sub: `${totalCalls.toLocaleString()} calls` },
        { label: 'Total time', value: formatMs(totalMs), sub: 'Across these statements' },
        { label: 'Slowest average', value: slowest ? formatMs(slowest.avgMs) : '—', tone: slowest && slowest.avgMs >= 1000 ? 'bad' : slowest && slowest.avgMs >= 400 ? 'warn' : 'good', sub: slowest ? `${slowest.calls.toLocaleString()} calls` : undefined },
        { label: 'High impact', value: severe, tone: severe ? 'warn' : 'good', sub: severe ? 'Show slow ones' : 'None', onClick: severe ? () => setFilter(filter === 'slow' ? 'all' : 'slow') : undefined },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="flex flex-col p-0">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${filtered.length} statement${filtered.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SQL" aria-label="Search queries" className="h-8 w-48 bg-card pl-8 text-xs" />
              </span>
              <Segmented label="Filter queries" value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All', count: data.queries.length },
                { value: 'slow', label: 'Slow' },
                { value: 'frequent', label: 'Frequent' },
              ]} />
            </Toolbar>
          </div>
          {filtered.length === 0 ? (
            <StateCard icon={DatabaseZap} title={data.queries.length ? 'No statements match' : 'No statements recorded yet'}>
              {data.queries.length ? 'Try another filter or clear the search.' : 'Statistics are on. Statements appear once the application runs queries.'}
            </StateCard>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {filtered.map(q => {
                const active = selected?.fingerprint === q.fingerprint;
                return (
                  <li key={q.fingerprint}>
                    <button type="button" onClick={() => setSelectedId(q.fingerprint)} aria-current={active} className={cn('flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <code className="truncate font-mono text-[13px] font-semibold">{q.query}</code>
                        <span className="truncate text-xs text-muted-foreground">{q.calls.toLocaleString()} calls · {formatMs(q.avgMs)} avg · {formatMs(q.totalMs)} total</span>
                      </span>
                      <ImpactLabel impact={q.impact} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {selected ? (
          <Section className="min-h-[320px]" title="Statement" actions={<Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onOpenSql(selected.query)}><SquareTerminal className="size-3.5" /> Open in SQL</Button>} bodyClassName="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {([
                ['Impact', <ImpactLabel key="i" impact={selected.impact} />],
                ['Average', formatMs(selected.avgMs)],
                ['p95', selected.p95Ms === null ? '—' : formatMs(selected.p95Ms)],
                ['Calls', selected.calls.toLocaleString()],
                ['Total time', formatMs(selected.totalMs)],
                ['Rows', selected.rows === null ? '—' : selected.rows.toLocaleString()],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className={heading}>{label}</span>
                  <span className="font-mono text-[15px] font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <div className="flex min-h-0 flex-col gap-1.5">
              <h3 className={heading}>SQL</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border bg-card p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">{selected.query}</pre>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Share of total time: <b className="font-mono text-foreground">{totalMs ? Math.round((selected.totalMs / totalMs) * 100) : 0}%</b>. Open it in SQL and use Explain to see the plan; the statement is not run.
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">Fingerprint {selected.fingerprint}</p>
          </Section>
        ) : <Section><StateCard icon={DatabaseZap} title="Nothing selected">Pick a statement to see its numbers.</StateCard></Section>}
      </div>
    </Page>
  );
}
