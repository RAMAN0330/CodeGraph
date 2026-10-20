import { useMemo, useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { downloadCsv } from '../../../shared/services/exportCsv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
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

function timeAgoFromDays(days: number): string {
  if (days < 1) return 'today';
  if (days < 30) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function riskColor(days: number): string {
  if (days < 30) return 'var(--color-success)';
  if (days < 90) return 'var(--accent-orange)';
  return 'var(--color-danger)';
}

export default function StaleCodeRadar({ owner, repo, token, files, connections }: StaleCodeRadarProps) {
  const [rows, setRows] = useState<StaleFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);

  useEffect(() => {
    if (!files.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Build in-degree map from connections
        const inDegreeMap: Record<string, number> = {};
        for (const conn of connections) {
          const target = conn.to || conn.target || '';
          if (target) {
            inDegreeMap[target] = (inDegreeMap[target] || 0) + 1;
          }
        }

        // Take top 15 files by in-degree
        const sorted = [...files]
          .sort((a, b) => {
            const aPath = a.path || a.name || '';
            const bPath = b.path || b.name || '';
            return (inDegreeMap[bPath] || 0) - (inDegreeMap[aPath] || 0);
          })
          .slice(0, 15);

        // Fetch last commit date for each
        const results: StaleFile[] = [];
        for (const file of sorted) {
          if (cancelled) break;
          const filePath = file.path || file.name || '';
          if (!filePath) continue;

          let daysSince = 0;
          let lastModified = 'unknown';

          try {
            const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1&path=${encodeURIComponent(filePath)}`, token);
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                const dateStr = data[0].commit?.author?.date || data[0].commit?.committer?.date;
                if (dateStr) {
                  const ms = Date.now() - new Date(dateStr).getTime();
                  daysSince = ms / 86400000;
                  lastModified = dateStr;
                }
              }
            }
          } catch {
            // skip fetch error for this file
          }

          const inDegree = inDegreeMap[filePath] || 0;
          const riskScore = Math.round(daysSince * Math.log(1 + inDegree) * 10) / 10;
          const basename = filePath.split('/').pop() || filePath;

          results.push({ path: filePath, basename, inDegree, daysSince, riskScore, lastModified });
        }

        if (!cancelled) {
          results.sort((a, b) => b.riskScore - a.riskScore);
          setRows(results);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to compute stale radar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token, files, connections]);

  const shown = useMemo(() => rows.filter(r => (!staleOnly || r.daysSince >= 90) && r.path.toLowerCase().includes(query.trim().toLowerCase())), [rows, query, staleOnly]);

  if (loading) return <div className="gi-page"><p className="text-sm text-muted-foreground">Analyzing stale code… fetching commit dates</p></div>;
  if (error) return <div className="gi-page"><p className="text-sm text-destructive">Error: {error}</p></div>;
  if (!rows.length) return <div className="gi-page"><p className="text-sm text-muted-foreground">No file data available for stale analysis.</p></div>;

  const maxRisk = rows.reduce((m, r) => Math.max(m, r.riskScore), 1);
  const stale = rows.filter(r => r.daysSince >= 90);
  const oldest = rows.reduce((a, b) => (b.daysSince > a.daysSince ? b : a));
  const avg = Math.round(rows.reduce((n, r) => n + r.daysSince, 0) / rows.length);

  return (
    <div className="gi-page flex h-full min-h-0 flex-col gap-3">
      <SummaryStrip items={[
        { label: 'Files checked', value: rows.length, sub: 'Most depended-on' },
        { label: 'Stale (90d+)', value: stale.length, tone: stale.length ? 'warn' : 'good', sub: stale.length ? 'Not touched in 3 months' : 'All recently touched', onClick: () => setStaleOnly(v => !v) },
        { label: 'Oldest', value: `${Math.round(oldest.daysSince)}d`, sub: oldest.basename },
        { label: 'Average age', value: `${avg}d`, sub: 'Since last commit' },
      ]} />
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter files" aria-label="Filter files" className="h-8 max-w-60 text-xs" />
        <Button variant={staleOnly ? 'secondary' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setStaleOnly(v => !v)} aria-pressed={staleOnly}>Stale only</Button>
        <p className="hidden text-xs text-muted-foreground md:block">Risk = days stale × log(1 + dependents). Higher means more critical to update.</p>
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={() => downloadCsv('stale-code.csv', ['File', 'Dependents', 'Last modified', 'Days stale', 'Risk'], shown.map(r => [r.path, r.inDegree, r.lastModified, Math.round(r.daysSince), r.riskScore]))}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Dependents</TableHead>
              <TableHead>Last modified</TableHead>
              <TableHead className="text-right">Days stale</TableHead>
              <TableHead className="min-w-40">Risk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No files match.</TableCell></TableRow>}
            {shown.map(row => (
              <TableRow key={row.path}>
                <TableCell className="max-w-64 truncate font-mono" title={row.path}>{row.basename}</TableCell>
                <TableCell className={`text-right ${row.inDegree > 5 ? 'font-semibold text-destructive' : ''}`}>{row.inDegree}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{row.lastModified === 'unknown' ? '—' : timeAgoFromDays(row.daysSince)}</TableCell>
                <TableCell className="text-right" style={{ color: riskColor(row.daysSince) }}>{Math.round(row.daysSince)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${Math.round((row.riskScore / maxRisk) * 100)}%`, background: riskColor(row.daysSince) }} />
                    </div>
                    <span className="min-w-8 text-right text-muted-foreground">{row.riskScore.toFixed(1)}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
