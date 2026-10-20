import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, ExternalLink, FileText, GitCommitHorizontal, GitMerge, History, Search, X } from 'lucide-react';
import CommitHeatmap from './CommitHeatmap';
import { Avatar, labelClass, shortDate, timeAgo } from './InsightsBits';
import { downloadCsv } from '../../../shared/services/exportCsv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import { githubFetch } from '../../repository/services/github';
import { resolveBranch } from '../services/branch';

interface CommitItem {
  sha: string;
  html_url?: string;
  parents?: { sha: string }[];
  commit: {
    message: string;
    author: { name: string; email?: string; date: string };
    committer?: { name: string; date: string };
    verification?: { verified: boolean };
  };
  author: { login: string; avatar_url?: string } | null;
}

interface CommitFile { filename: string; status: string; additions: number; deletions: number }
interface CommitDetail { stats?: { additions: number; deletions: number; total: number }; files?: CommitFile[] }

interface CommitTimelineProps {
  owner: string;
  repo: string;
  token: string;
  branch: string;
}

type Kind = 'all' | 'changes' | 'merges';
const ALL_AUTHORS = '__all__';
const who = (c: CommitItem) => c.author?.login || c.commit.author.name || 'unknown';
const isMerge = (c: CommitItem) => (c.parents?.length ?? 0) > 1;
const FILE_STATUS: Record<string, string> = { added: 'A', removed: 'D', modified: 'M', renamed: 'R', copied: 'C' };

export default function CommitTimeline({ owner, repo, token, branch }: CommitTimelineProps) {
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [resolvedBranch, setResolvedBranch] = useState(branch);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // A day picked on the heatmap (YYYY-MM-DD, UTC) narrows the list to it.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState(ALL_AUTHORS);
  const [kind, setKind] = useState<Kind>('all');
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const sha = await resolveBranch(owner, repo, branch, token);
        if (!cancelled) setResolvedBranch(sha);
        const range = selectedDay ? `&since=${selectedDay}T00:00:00Z&until=${selectedDay}T23:59:59Z` : '';
        const res = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=100${sha ? `&sha=${encodeURIComponent(sha)}` : ''}${range}`, token);
        if (!res.ok) throw new Error(`GitHub answered ${res.status} for the commit list.`);
        const data = await res.json();
        if (!cancelled) setCommits(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load commits');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, token, branch, selectedDay, reload]);

  const authors = useMemo(() => {
    const counts = new Map<string, number>();
    commits.forEach(c => counts.set(who(c), (counts.get(who(c)) ?? 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [commits]);
  const merges = useMemo(() => commits.filter(isMerge).length, [commits]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commits.filter(c => (author === ALL_AUTHORS || who(c) === author)
      && (kind === 'all' || (kind === 'merges') === isMerge(c))
      && (!needle || c.commit.message.toLowerCase().includes(needle) || c.sha.startsWith(needle)));
  }, [commits, author, kind, query]);
  const selected = visible.find(c => c.sha === selectedSha) ?? visible[0] ?? null;

  const filtersOn = query || author !== ALL_AUTHORS || kind !== 'all';
  const clearFilters = () => { setQuery(''); setAuthor(ALL_AUTHORS); setKind('all'); };
  const dayLabel = selectedDay && new Date(`${selectedDay}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const newest = commits[0]?.commit.author.date;
  const oldest = commits[commits.length - 1]?.commit.author.date;

  return (
    <Page>
      <PageHeader
        icon={History}
        tone="insights"
        title="Commits"
        description={<>Recent history of <code className="font-mono text-foreground">{resolvedBranch || 'the default branch'}</code>{resolvedBranch && resolvedBranch !== branch ? <> (the workspace asked for <code className="font-mono">{branch}</code>, which this repository doesn't have)</> : null}. Pick a day on the heatmap, filter by author, and open a commit to see what it changed.</>}
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!visible.length} onClick={() => downloadCsv('commits.csv', ['SHA', 'Author', 'Date', 'Message'], visible.map(c => [c.sha, who(c), c.commit.author.date, c.commit.message.split('\n')[0]]))}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        }
      />

      {!error && !loading && commits.length > 0 && (
        <SummaryStrip items={[
          { label: selectedDay ? 'Commits that day' : 'Commits loaded', value: commits.length, sub: selectedDay ? dayLabel : commits.length >= 100 ? 'Latest 100' : 'All on this branch' },
          { label: 'Authors', value: authors.length, sub: `${authors[0][0]} made ${Math.round((authors[0][1] / commits.length) * 100)}%`, onClick: () => setAuthor(author === authors[0][0] ? ALL_AUTHORS : authors[0][0]) },
          { label: 'Merges', value: merges, sub: kind === 'merges' ? 'Click to clear' : 'Show only merges', onClick: () => setKind(kind === 'merges' ? 'all' : 'merges') },
          { label: 'Latest commit', value: newest ? timeAgo(newest) : '—', sub: oldest ? `Since ${shortDate(oldest)}` : undefined },
        ]} />
      )}

      <CommitHeatmap owner={owner} repo={repo} token={token} selectedDay={selectedDay} onSelectDay={setSelectedDay} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(340px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="p-0 flex flex-col">
          <div className="flex flex-col gap-2 border-b px-4 py-3">
            <Toolbar count={loading ? 'Loading…' : `${visible.length.toLocaleString()} commit${visible.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Message or SHA" aria-label="Search commits" className="h-8 w-44 bg-card pl-8 text-xs" />
              </span>
              <Select value={author} onValueChange={setAuthor}>
                <SelectTrigger size="sm" aria-label="Filter by author" className="h-8 w-40 bg-card text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_AUTHORS}>All authors</SelectItem>
                  {authors.map(([login, n]) => <SelectItem key={login} value={login}>{login} ({n})</SelectItem>)}
                </SelectContent>
              </Select>
              <Segmented label="Commit type" value={kind} onChange={setKind} options={[
                { value: 'all', label: 'All' },
                { value: 'changes', label: 'Changes', count: commits.length - merges },
                { value: 'merges', label: 'Merges', count: merges },
              ]} />
            </Toolbar>
            {(selectedDay || filtersOn) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
                {selectedDay && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-card py-0.5 pr-1 pl-2.5">
                    Day: <strong className="font-semibold text-foreground">{dayLabel}</strong>
                    <button type="button" aria-label="Show recent commits" className="grid size-5 place-items-center rounded-full border-0 bg-transparent text-muted-foreground hover:bg-[var(--surface-hover)]" onClick={() => setSelectedDay(null)}><X className="size-3" /></button>
                  </span>
                )}
                {filtersOn && <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearFilters}>Clear filters</Button>}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col gap-3 p-4" aria-busy="true">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3"><Skeleton className="size-8 rounded-full" /><div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/3" /></div></div>
              ))}
            </div>
          ) : error ? (
            <StateCard icon={AlertTriangle} title="Couldn't load commits" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReload(n => n + 1)}>Try again</Button>}>
              {error} Check that the repository is still reachable with your GitHub connection, then try again.
            </StateCard>
          ) : visible.length === 0 ? (
            <StateCard icon={GitCommitHorizontal} title={commits.length ? 'No matching commits' : selectedDay ? 'No commits that day on this branch' : 'No commits yet'}
              action={commits.length ? <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>Clear filters</Button> : selectedDay ? <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setSelectedDay(null)}>Show recent commits</Button> : undefined}>
              {commits.length ? 'Try another author or type, or clear the search.' : selectedDay ? `The heatmap counts the default branch; ${resolvedBranch} had no commits on ${dayLabel}.` : `Nothing has been committed to ${resolvedBranch} yet.`}
            </StateCard>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {visible.map(c => {
                const active = selected?.sha === c.sha;
                const title = c.commit.message.split('\n')[0];
                return (
                  <li key={c.sha}>
                    <button type="button" onClick={() => setSelectedSha(c.sha)} aria-current={active} className={cn('flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}>
                      <Avatar login={who(c)} src={c.author?.avatar_url} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-semibold" title={title}>{title}</span>
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                          {isMerge(c) && <GitMerge className="size-3 shrink-0" aria-label="Merge commit" />}
                          {who(c)} · <code className="font-mono text-[11px]">{c.sha.slice(0, 7)}</code>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground" title={new Date(c.commit.author.date).toLocaleString()}>{timeAgo(c.commit.author.date)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {selected && !loading && !error
          ? <CommitDetailPane commit={selected} owner={owner} repo={repo} token={token} />
          : <Section className="min-h-[320px]"><StateCard icon={GitCommitHorizontal} title={loading ? 'Loading commits…' : 'No commit selected'}>{loading ? 'The list appears on the left in a moment.' : 'Pick a commit to see its full message and the files it changed.'}</StateCard></Section>}
      </div>
    </Page>
  );
}

function CommitDetailPane({ commit, owner, repo, token }: { commit: CommitItem; owner: string; repo: string; token: string }) {
  const [detail, setDetail] = useState<CommitDetail | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(undefined);
    githubFetch(`https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`, token)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); });
    return () => { cancelled = true; };
  }, [owner, repo, token, commit.sha]);

  const [title, ...rest] = commit.commit.message.split('\n');
  const body = rest.join('\n').trim();
  const copy = () => {
    navigator.clipboard.writeText(commit.sha).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  const files = detail?.files ?? [];
  const maxChange = Math.max(1, ...files.map(f => f.additions + f.deletions));

  return (
    <Section className="min-h-[320px]" bodyClassName="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <Avatar login={who(commit)} src={commit.author?.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-snug font-semibold break-words">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong className="font-semibold text-foreground">{who(commit)}</strong> committed {timeAgo(commit.commit.author.date)} · {new Date(commit.commit.author.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 gap-1.5 font-mono text-xs" onClick={copy} aria-label="Copy full SHA">
          {copied ? <Check className="size-3.5 text-[var(--color-success)]" /> : <Copy className="size-3.5" />}{commit.sha.slice(0, 7)}
        </Button>
        {isMerge(commit) && <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-xs text-muted-foreground"><GitMerge className="size-3.5" /> Merge of {commit.parents!.length} parents</span>}
        {commit.commit.verification?.verified && <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-xs text-[var(--color-success)]"><Check className="size-3.5" /> Verified</span>}
        {commit.html_url && (
          <Button asChild variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs text-primary">
            <a href={commit.html_url} target="_blank" rel="noreferrer">Open on GitHub <ExternalLink className="size-3.5" /></a>
          </Button>
        )}
      </div>

      {body && <pre className="max-h-40 shrink-0 overflow-auto rounded-lg border bg-card p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{body}</pre>}

      <div className="flex min-h-0 flex-col gap-2">
        <h3 className={labelClass}>
          {detail === undefined ? 'Files changed' : detail?.stats ? <>Files changed · {files.length}{files.length >= 300 ? '+' : ''} · <span className="text-[var(--color-success)]">+{detail.stats.additions}</span> <span className="text-[var(--color-danger)]">−{detail.stats.deletions}</span></> : 'Files changed'}
        </h3>
        {detail === undefined ? (
          <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-7 w-full" />)}</div>
        ) : detail === null ? (
          <p className="text-xs text-muted-foreground">The file list isn't available right now. Open the commit on GitHub to see it.</p>
        ) : files.length === 0 ? (
          <p className="text-xs text-muted-foreground">This commit changed no files (an empty or merge-only commit).</p>
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
            {files.map(f => (
              <li key={f.filename} className="grid grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-2 px-3 py-1.5" title={f.filename}>
                <span className="font-mono text-[11px] font-semibold text-muted-foreground">{FILE_STATUS[f.status] ?? '?'}</span>
                <span className="flex min-w-0 items-center gap-1.5"><FileText className="size-3.5 shrink-0 text-muted-foreground" /><code className="truncate font-mono text-[11px]">{f.filename}</code></span>
                {/* Share of the biggest file's change, split into lines added and removed. */}
                <span className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <i className="block h-full bg-[var(--color-success)]" style={{ width: `${(f.additions / maxChange) * 100}%` }} />
                  <i className="block h-full bg-[var(--color-danger)]" style={{ width: `${(f.deletions / maxChange) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-[11px] text-muted-foreground">+{f.additions} −{f.deletions}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
