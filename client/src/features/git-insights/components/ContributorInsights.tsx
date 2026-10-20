import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { downloadCsv } from '../../../shared/services/exportCsv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { githubFetch } from '../../repository/services/github';

const AUTHOR_COLORS = ['var(--color-success)', 'var(--teal-500)', 'var(--accent-orange)', 'var(--chart-purple)', 'var(--color-danger)', 'var(--chart-cyan)', 'var(--accent-orange)', 'var(--chart-purple)'];

interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

interface ContributorInsightsProps {
  owner: string;
  repo: string;
  token: string;
  folders?: string[];
}

export default function ContributorInsights({ owner, repo, token }: ContributorInsightsProps) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=20`, token);
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setContributors(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load contributors');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, token]);

  if (loading) return (
    <div className="gi-page"><p className="gi-note">Loading contributors…</p></div>
  );

  if (error) return (
    <div className="gi-page"><p className="gi-note" style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>
  );

  if (!contributors.length) return (
    <div className="gi-page"><p className="gi-note">No contributors found.</p></div>
  );

  const total = contributors.reduce((n, c) => n + c.contributions, 0) || 1;
  const maxContributions = contributors[0]?.contributions || 1;
  // Fewest people whose commits add up to half of all commits: a low number means knowledge is concentrated.
  let running = 0, busFactor = 0;
  for (const c of contributors) { busFactor += 1; running += c.contributions; if (running >= total / 2) break; }
  const topShare = Math.round((contributors[0].contributions / total) * 100);
  const shown = contributors.filter(c => c.login.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="gi-page flex h-full min-h-0 flex-col gap-3">
      <SummaryStrip items={[
        { label: 'Contributors', value: contributors.length, sub: 'Top 20 by commits' },
        { label: 'Commits', value: total.toLocaleString(), sub: 'By these contributors' },
        { label: 'Top contributor', value: `${topShare}%`, tone: topShare > 70 ? 'warn' : 'neutral', sub: contributors[0].login },
        { label: 'Bus factor', value: busFactor, tone: busFactor <= 1 ? 'bad' : busFactor === 2 ? 'warn' : 'good', sub: 'People behind half the commits' },
      ]} />
      <div className="flex shrink-0 items-center gap-2">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a contributor" aria-label="Find a contributor" className="h-8 max-w-60 text-xs" />
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={() => downloadCsv('contributors.csv', ['Login', 'Commits', 'Share %'], contributors.map(c => [c.login, c.contributions, Math.round((c.contributions / total) * 1000) / 10]))}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-auto rounded-xl border bg-card">
        {shown.length === 0 && <li className="p-6 text-center text-xs text-muted-foreground">No contributor matches.</li>}
        {shown.map(c => {
          const i = contributors.indexOf(c);
          const color = AUTHOR_COLORS[i % AUTHOR_COLORS.length];
          return (
            <li key={c.login} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-5 text-right font-mono text-xs text-muted-foreground">{i + 1}</span>
              {c.avatar_url
                ? <img src={c.avatar_url} alt="" className="size-8 shrink-0 rounded-full" loading="lazy" />
                : <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: color, color: 'var(--bg0)' }}>{c.login[0].toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <a className="truncate font-semibold hover:underline" href={`https://github.com/${c.login}`} target="_blank" rel="noreferrer">{c.login}</a>
                  <span className="shrink-0 font-mono text-muted-foreground">{c.contributions.toLocaleString()} commits · {Math.round((c.contributions / total) * 100)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((c.contributions / maxContributions) * 100)}%`, background: color }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
