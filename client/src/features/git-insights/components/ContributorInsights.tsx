import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Download, ExternalLink, Search, Users } from 'lucide-react';
import { Page, PageHeader, Section, Toolbar } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import { toneText, type Tone } from '../../../shared/components/dashboardTones';
import { downloadCsv } from '../../../shared/services/exportCsv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { githubFetch } from '../../repository/services/github';
import { Avatar, labelClass } from './InsightsBits';

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

// Data palette, in order; a fifth slice and beyond fold into "Other".
const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)'];

export default function ContributorInsights({ owner, repo, token }: ContributorInsightsProps) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=20`, token);
        if (!res.ok) throw new Error(`GitHub answered ${res.status} for the contributor list.`);
        const data = await res.json();
        if (!cancelled) setContributors(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load contributors');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, token, reload]);

  const total = contributors.reduce((n, c) => n + c.contributions, 0) || 1;
  // Fewest people whose commits add up to half of all commits: a low number means knowledge is concentrated.
  const busFactor = useMemo(() => {
    let running = 0, n = 0;
    for (const c of contributors) { n += 1; running += c.contributions; if (running >= total / 2) break; }
    return n;
  }, [contributors, total]);
  const shown = contributors.filter(c => c.login.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = shown.find(c => c.login === selectedLogin) ?? shown[0] ?? null;
  const share = (c: Contributor) => Math.round((c.contributions / total) * 100);

  const header = (
    <PageHeader
      icon={Users}
      tone="insights"
      title="People"
      description="Who writes this codebase and how concentrated that knowledge is. A low bus factor means a few people hold most of the history."
      actions={
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!contributors.length} onClick={() => downloadCsv('contributors.csv', ['Login', 'Commits', 'Share %'], contributors.map(c => [c.login, c.contributions, Math.round((c.contributions / total) * 1000) / 10]))}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      }
    />
  );

  if (loading || error || !contributors.length) return (
    <Page>
      {header}
      <Section className="flex-1">
        {loading ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {[0, 1, 2, 3].map(i => <div key={i} className="flex items-center gap-3"><Skeleton className="size-8 rounded-full" /><Skeleton className="h-3.5 flex-1" /></div>)}
          </div>
        ) : error ? (
          <StateCard icon={AlertTriangle} title="Couldn't load contributors" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReload(n => n + 1)}>Try again</Button>}>
            {error} Check your GitHub connection, then try again.
          </StateCard>
        ) : (
          <StateCard icon={Users} title="No contributors yet">GitHub lists no contributors for this repository. Contributors appear once commits are pushed by GitHub accounts.</StateCard>
        )}
      </Section>
    </Page>
  );

  const top = contributors[0];
  const topShare = share(top);
  const busTone: Tone = busFactor <= 1 ? 'bad' : busFactor === 2 ? 'warn' : 'good';
  // Composition: top four in palette order, the rest folded into "Other".
  const slices = contributors.slice(0, 4).map((c, i) => ({ label: c.login, value: c.contributions, color: VIZ[i] }));
  const otherCommits = contributors.slice(4).reduce((n, c) => n + c.contributions, 0);
  if (otherCommits) slices.push({ label: `Other (${contributors.length - 4})`, value: otherCommits, color: 'var(--text-muted)' });
  const maxContributions = top.contributions || 1;

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Contributors', value: contributors.length, sub: contributors.length >= 20 ? 'Top 20 by commits' : 'Everyone with commits' },
        { label: 'Commits', value: total.toLocaleString(), sub: 'By these contributors' },
        { label: 'Top contributor', value: `${topShare}%`, tone: topShare > 70 ? 'warn' : 'neutral', sub: top.login, onClick: () => { setQuery(''); setSelectedLogin(top.login); } },
        { label: 'Bus factor', value: busFactor, tone: busTone, sub: 'People behind half the commits' },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)]">
        <Section className="min-h-[300px]" bodyClassName="p-0 flex flex-col">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${shown.length} ${shown.length === 1 ? 'person' : 'people'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a contributor" aria-label="Find a contributor" className="h-8 w-52 bg-card pl-8 text-xs" />
              </span>
            </Toolbar>
          </div>
          {shown.length === 0 ? (
            <StateCard icon={Search} title="No contributor matches" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setQuery('')}>Clear search</Button>}>Check the spelling of the GitHub username.</StateCard>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {shown.map(c => {
                const rank = contributors.indexOf(c) + 1;
                const active = selected?.login === c.login;
                return (
                  <li key={c.login}>
                    <button type="button" onClick={() => setSelectedLogin(c.login)} aria-current={active} className={cn('flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}>
                      <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{rank}</span>
                      <Avatar login={c.login} src={c.avatar_url} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[13px] font-semibold">{c.login}</span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <i className="block h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, (c.contributions / maxContributions) * 100)}%` }} />
                        </span>
                      </span>
                      <span className="w-24 shrink-0 text-right">
                        <b className="block font-mono text-xs font-semibold">{c.contributions.toLocaleString()}</b>
                        <span className="text-[11px] text-muted-foreground">{share(c)}% of commits</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className="flex min-h-0 flex-col gap-3">
          <Section title="Commit share" meta={`${total.toLocaleString()} commits`} className="shrink-0" bodyClassName="flex flex-col gap-3">
            <ShareBar slices={slices} total={total} />
            <p className={cn('text-xs leading-relaxed', toneText[busTone])}>
              {busFactor <= 1
                ? `${top.login} alone wrote half of the history. If they step away, most context goes with them; pair on reviews and document the hot areas.`
                : busFactor === 2
                  ? 'Two people wrote half of the history. Spread reviews so more people know each area.'
                  : `${busFactor} people share half of the history, a healthy spread of knowledge.`}
            </p>
          </Section>

          {selected && (
            <Section className="min-h-[180px] flex-1" bodyClassName="flex flex-col gap-4 p-5">
              <div className="flex items-center gap-3">
                <Avatar login={selected.login} src={selected.avatar_url} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{selected.login}</h2>
                  <p className="text-xs text-muted-foreground">Rank {contributors.indexOf(selected) + 1} of {contributors.length}</p>
                </div>
                <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary">
                  <a href={`https://github.com/${selected.login}`} target="_blank" rel="noreferrer">Profile <ExternalLink className="size-3.5" /></a>
                </Button>
              </div>
              <dl className="grid grid-cols-3 gap-2">
                {[
                  ['Commits', selected.contributions.toLocaleString()],
                  ['Share', `${share(selected)}%`],
                  ['With those above', `${Math.round((contributors.slice(0, contributors.indexOf(selected) + 1).reduce((n, c) => n + c.contributions, 0) / total) * 100)}%`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-card px-3 py-2">
                    <dt className={labelClass}>{label}</dt>
                    <dd className="mt-0.5 font-mono text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}
        </div>
      </div>
    </Page>
  );
}

/** One stacked bar of commit share with a legend that labels each slice directly; hover shows the exact figure. */
function ShareBar({ slices, total }: { slices: { label: string; value: number; color: string }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={slices.map(s => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}>
          {slices.map((s, i) => (
            <i key={s.label} className={cn('block h-full first:rounded-l-full last:rounded-r-full transition-opacity', hover !== null && hover !== i && 'opacity-40')}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </div>
        {hover !== null && (
          <div role="status" className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-sm">
            <strong className="font-semibold">{slices[hover].label}</strong> · {slices[hover].value.toLocaleString()} commits ({Math.round((slices[hover].value / total) * 100)}%)
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-1.5 text-xs" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <i className="size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />
            <span className="max-w-[12ch] truncate">{s.label}</span>
            <b className="font-mono font-semibold text-muted-foreground">{Math.round((s.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
