import { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, Clock, Download, Radar, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../shared/components/Page';
import { StateCard } from '../../../shared/components/StateCard';
import { Meter } from '../../../shared/components/Dashboard';
import { toneFill, toneText, type Tone } from '../../../shared/components/dashboardTones';
import { downloadCsv } from '../../../shared/services/exportCsv';
import { githubFetch } from '../../repository/services/github';

interface StaleFile {
  path: string;
  basename: string;
  inDegree: number;
  daysSince: number;
  riskScore: number;
  lastModified: string;
}

interface StaleCodeRadarProps {
  owner: string;
  repo: string;
  token: string;
  files: any[];
  connections: any[];
}

const CHECKED = 15;

function timeAgoFromDays(days: number): string {
  if (days < 1) return 'today';
  if (days < 30) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

const ageTone = (days: number): Tone => days < 30 ? 'good' : days < 90 ? 'warn' : 'bad';
const endpoint = (v: any): string => (v && typeof v === 'object' ? v.id ?? v.path : v) || '';

export default function StaleCodeRadar({ owner, repo, token, files, connections }: StaleCodeRadarProps) {
  const [rows, setRows] = useState<StaleFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'stale'>('all');

  useEffect(() => {
    if (!files.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const abort = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setProgress(0);

        const inDegreeMap: Record<string, number> = {};
        for (const conn of connections) {
          const target = endpoint(conn.to || conn.target);
          if (target) inDegreeMap[target] = (inDegreeMap[target] || 0) + 1;
        }

        const sorted = [...files]
          .map(f => f.path || f.name || '')
          .filter(Boolean)
          .sort((a, b) => (inDegreeMap[b] || 0) - (inDegreeMap[a] || 0))
          .slice(0, CHECKED);

        // In parallel (it used to be one request after another, which could take a minute behind the proxy).
        const results = await Promise.all(sorted.map(async (filePath): Promise<StaleFile> => {
          let daysSince = 0;
          let lastModified = 'unknown';
          try {
            const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1&path=${encodeURIComponent(filePath)}`, token, { signal: abort.signal });
            if (res.ok) {
              const data = await res.json();
              const dateStr = Array.isArray(data) && data.length > 0 ? data[0].commit?.author?.date || data[0].commit?.committer?.date : null;
              if (dateStr) {
                daysSince = (Date.now() - new Date(dateStr).getTime()) / 86400000;
                lastModified = dateStr;
              }
            }
          } catch {
            // skip fetch error for this file
          }
          if (!cancelled) setProgress(p => p + 1);
          const inDegree = inDegreeMap[filePath] || 0;
          return {
            path: filePath,
            basename: filePath.split('/').pop() || filePath,
            inDegree,
            daysSince,
            riskScore: Math.round(daysSince * Math.log(1 + inDegree) * 10) / 10,
            lastModified,
          };
        }));

        if (!cancelled) setRows(results.sort((a, b) => b.riskScore - a.riskScore));
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to compute stale radar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; abort.abort(); };
  }, [owner, repo, token, files, connections]);

  const known = useMemo(() => rows.filter(r => r.lastModified !== 'unknown'), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(r => (filter === 'all' || r.daysSince >= 90) && r.path.toLowerCase().includes(q));
  }, [rows, query, filter]);

  const header = (
    <PageHeader
      icon={Radar}
      tone="quality"
      title="Stale code radar"
      description={`The ${CHECKED} most depended-on files and when each last changed. Old files that many others import are the riskiest to leave unreviewed.`}
      actions={!loading && rows.length > 0 && (
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!shown.length} onClick={() => downloadCsv('stale-code.csv', ['File', 'Dependents', 'Last modified', 'Days stale', 'Risk'], shown.map(r => [r.path, r.inDegree, r.lastModified, Math.round(r.daysSince), r.riskScore]))}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      )}
    />
  );

  if (loading) {
    const total = Math.min(CHECKED, files.length);
    return (
      <Page>
        {header}
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[84px] rounded-xl" />)}</div>
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
          <Section title="Files" meta={`Fetching last commit dates · ${progress} of ${total}`} icon={Clock} bodyClassName="flex flex-col gap-2.5">
            <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={progress} aria-label="Files checked">
              <i className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${(progress / Math.max(1, total)) * 100}%` }} />
            </div>
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </Section>
          <Section title="Age profile"><div className="flex flex-col gap-3">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-full" />)}</div></Section>
        </div>
      </Page>
    );
  }

  if (error || !rows.length || !known.length) {
    return (
      <Page>
        {header}
        <Section className="flex-1">
          <StateCard icon={error || rows.length ? AlertTriangle : Radar} title={error ? 'Could not compute the radar' : rows.length ? 'Commit dates unavailable' : 'No files to check'}>
            {error
              ? `${error}. Reopen this page to try again.`
              : rows.length
                ? 'GitHub returned no commit history for these files. Connect GitHub from the account menu (or check the repository is reachable), then reopen this page.'
                : 'This analysis has no files. Rescan the repository, then come back.'}
          </StateCard>
        </Section>
      </Page>
    );
  }

  const maxRisk = rows.reduce((m, r) => Math.max(m, r.riskScore), 1);
  const stale = known.filter(r => r.daysSince >= 90);
  const oldest = known.reduce((a, b) => (b.daysSince > a.daysSince ? b : a));
  const avg = Math.round(known.reduce((n, r) => n + r.daysSince, 0) / known.length);
  const buckets: { label: string; test: (d: number) => boolean; tone: Tone }[] = [
    { label: 'Changed this month', test: d => d < 30, tone: 'good' },
    { label: '1 to 3 months', test: d => d >= 30 && d < 90, tone: 'warn' },
    { label: '3 to 12 months', test: d => d >= 90 && d < 365, tone: 'bad' },
    { label: 'Over a year', test: d => d >= 365, tone: 'bad' },
  ];

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Files checked', value: rows.length, sub: 'Most depended-on' },
        { label: 'Stale (90d+)', value: stale.length, tone: stale.length ? 'warn' : 'good', sub: filter === 'stale' ? 'Click to show all' : stale.length ? 'Click to filter' : 'All recently touched', onClick: () => setFilter(f => f === 'stale' ? 'all' : 'stale') },
        { label: 'Oldest', value: `${Math.round(oldest.daysSince)}d`, sub: <span title={oldest.path}>{oldest.basename}</span>, tone: ageTone(oldest.daysSince) },
        { label: 'Average age', value: `${avg}d`, sub: 'Since last commit' },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="p-0 flex flex-col">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${shown.length} file${shown.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter files" aria-label="Filter files" className="h-8 w-48 bg-card pl-8 text-xs" />
              </span>
              <Segmented label="Show" value={filter} onChange={setFilter} options={[
                { value: 'all', label: 'All', count: rows.length },
                { value: 'stale', label: 'Stale 90d+', count: stale.length },
              ]} />
            </Toolbar>
          </div>
          {shown.length === 0 ? (
            <StateCard icon={Search} title="No files match">Clear the search or show all files.</StateCard>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <Table className="text-xs">
                <TableHeader className="sticky top-0 z-[1] bg-[var(--surface-subtle)]">
                  <TableRow>
                    <TableHead className="pl-4">File</TableHead>
                    <TableHead className="text-right">Dependents</TableHead>
                    <TableHead>Last change</TableHead>
                    <TableHead className="min-w-40 pr-4">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map(row => (
                    <TableRow key={row.path} className="hover:bg-[var(--surface-hover)]">
                      <TableCell className="max-w-72 pl-4">
                        <div className="truncate text-[13px] font-semibold" title={row.path}>{row.basename}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{row.path}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{row.inDegree}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.lastModified === 'unknown' ? <span className="text-muted-foreground">Unknown</span> : (
                          <span className={cn('inline-flex items-center gap-1.5', toneText[ageTone(row.daysSince)])}>
                            <i className={cn('size-1.5 rounded-full', toneFill[ageTone(row.daysSince)])} aria-hidden="true" />
                            {timeAgoFromDays(row.daysSince)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, Math.round((row.riskScore / maxRisk) * 100))}%` }} />
                          </div>
                          <span className="min-w-9 text-right font-mono tabular-nums">{row.riskScore.toFixed(1)}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        <div className="flex min-h-0 flex-col gap-3">
          <Section title="Age profile" meta={`${known.length} with history`} icon={Clock} className="shrink-0">
            {buckets.map(b => {
              const count = known.filter(r => b.test(r.daysSince)).length;
              return <Meter key={b.label} label={b.label} value={(count / known.length) * 100} display={count} tone={count ? b.tone : 'neutral'} />;
            })}
          </Section>
          <Section title="How risk is scored" icon={Radar} className="flex-1">
            <div className="flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
              <p><b className="font-mono text-foreground">risk = days since last change × ln(1 + dependents)</b></p>
              <p>A file nobody imports scores zero however old it is; a file many others import climbs quickly as it ages. Start at the top of the list: review it, check its tests still describe what callers rely on, and update or document it.</p>
              <p>Only the {CHECKED} files with the most dependents are checked, to keep GitHub requests low.</p>
            </div>
          </Section>
        </div>
      </div>
    </Page>
  );
}
