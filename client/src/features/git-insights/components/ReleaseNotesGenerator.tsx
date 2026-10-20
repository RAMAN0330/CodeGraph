import { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Bug, BookOpen, Check, Copy, Download, FileText, Rocket, Search, Sparkles, Tag, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import { githubFetch } from '../../repository/services/github';

interface CommitItem {
  sha: string;
  parents?: { sha: string }[];
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string } | null;
}

interface TagItem {
  name: string;
  commit: { sha: string };
}

type Category = 'Features' | 'Bug Fixes' | 'Documentation' | 'Other' | 'Uncategorized';

interface CategorizedCommit {
  sha7: string;
  message: string;
  author: string;
  category: Category;
  merge: boolean;
}

interface ReleaseNotesGeneratorProps {
  owner: string;
  repo: string;
  token: string;
}

function categorize(message: string): Category {
  const lower = message.toLowerCase();
  if (lower.startsWith('feat')) return 'Features';
  if (lower.startsWith('fix')) return 'Bug Fixes';
  if (lower.startsWith('docs')) return 'Documentation';
  if (lower.startsWith('chore') || lower.startsWith('refactor') || lower.startsWith('perf')) return 'Other';
  return 'Uncategorized';
}

function stripScope(message: string): string {
  // Remove conventional commit prefix like "feat(scope): " or "fix: "
  return message.replace(/^[a-z]+(\([^)]*\))?:\s*/i, '').trim();
}

const CATEGORY_ORDER: Category[] = ['Features', 'Bug Fixes', 'Documentation', 'Other', 'Uncategorized'];
// Data palette in order; uncategorized stays grey.
const CATEGORY_COLOR: Record<Category, string> = { Features: 'var(--viz-1)', 'Bug Fixes': 'var(--viz-2)', Documentation: 'var(--viz-3)', Other: 'var(--viz-4)', Uncategorized: 'var(--text-muted)' };
const CATEGORY_ICON: Record<Category, LucideIcon> = { Features: Sparkles, 'Bug Fixes': Bug, Documentation: BookOpen, Other: Wrench, Uncategorized: FileText };
const CATEGORY_SHORT: Record<Category, string> = { Features: 'Features', 'Bug Fixes': 'Fixes', Documentation: 'Docs', Other: 'Maintenance', Uncategorized: 'Uncategorized' };

export default function ReleaseNotesGenerator({ owner, repo, token }: ReleaseNotesGeneratorProps) {
  const [commits, setCommits] = useState<CategorizedCommit[]>([]);
  const [tagFrom, setTagFrom] = useState<string>('');
  const [tagTo, setTagTo] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [hideMerges, setHideMerges] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {

        // Fetch tags
        const tagsRes = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=10`, token);
        if (!tagsRes.ok) throw new Error(`GitHub answered ${tagsRes.status} for the tag list.`);
        const tags: TagItem[] = await tagsRes.json();

        let rawCommits: CommitItem[] = [];

        if (tags.length >= 2) {
          const base = tags[1].name;
          const head = tags[0].name;

          const compareRes = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`, token);
          if (!compareRes.ok) throw new Error(`GitHub answered ${compareRes.status} comparing ${base} and ${head}.`);
          const compareData = await compareRes.json();
          // Compare lists oldest first; release notes read newest first.
          rawCommits = [...(compareData.commits || [])].reverse();

          if (!cancelled) {
            setTagFrom(base);
            setTagTo(head);
          }
        } else {
          // Fewer than 2 tags — fall back to last 30 commits
          const commitsRes = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`, token);
          if (!commitsRes.ok) throw new Error(`GitHub answered ${commitsRes.status} for the commit list.`);
          rawCommits = await commitsRes.json();

          if (!cancelled && tags.length === 1) {
            setTagFrom('(start)');
            setTagTo(tags[0].name);
          }
        }

        if (!cancelled) {
          const categorized: CategorizedCommit[] = rawCommits.map((c) => ({
            sha7: c.sha.slice(0, 7),
            message: stripScope(c.commit.message.split('\n')[0]),
            author: c.author?.login || c.commit.author.name,
            category: categorize(c.commit.message),
            merge: (c.parents?.length ?? 0) > 1,
          }));

          const firstDate = rawCommits[0]?.commit?.author?.date;
          if (firstDate) setToDate(new Date(firstDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

          setCommits(categorized);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to generate release notes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token, reload]);

  // What you see is what you copy: the merge toggle applies to the exports too.
  const included = useMemo(() => commits.filter(c => !hideMerges || !c.merge), [commits, hideMerges]);
  const counts = useMemo(() => {
    const n = Object.fromEntries(CATEGORY_ORDER.map(c => [c, 0])) as Record<Category, number>;
    included.forEach(c => { n[c.category]++; });
    return n;
  }, [included]);
  const merges = commits.filter(c => c.merge).length;
  const authors = new Set(included.map(c => c.author)).size;
  const needle = query.trim().toLowerCase();
  const visible = included.filter(c => (category === 'all' || c.category === category) && (!needle || `${c.message} ${c.sha7} ${c.author}`.toLowerCase().includes(needle)));

  function buildMarkdown(): string {
    const header = `## ${tagTo || 'Latest'} — ${toDate}\n\n`;
    const sections = CATEGORY_ORDER.map((cat) => {
      const items = included.filter((c) => c.category === cat);
      if (!items.length) return '';
      return `### ${cat}\n${items.map((c) => `- ${c.message} (${c.sha7})`).join('\n')}\n`;
    }).filter(Boolean);
    return header + sections.join('\n');
  }

  function buildJson(): string {
    const grouped: Record<string, any[]> = {};
    for (const cat of CATEGORY_ORDER) {
      grouped[cat] = included.filter((c) => c.category === cat).map((c) => ({
        sha: c.sha7,
        message: c.message,
        author: c.author,
      }));
    }
    return JSON.stringify({ version: tagTo || 'latest', date: toDate, changes: grouped }, null, 2);
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([buildMarkdown()], { type: 'text/markdown' }));
    Object.assign(document.createElement('a'), { href: url, download: `release-notes-${tagTo || 'latest'}.md` }).click();
    URL.revokeObjectURL(url);
  };

  const range = tagFrom && tagTo ? <>Changes from <code className="font-mono text-foreground">{tagFrom}</code> to <code className="font-mono text-foreground">{tagTo}</code></> : 'No two release tags yet, so these notes cover the last 30 commits';
  const ready = !loading && !error;

  return (
    <Page>
      <PageHeader
        icon={Rocket}
        tone="insights"
        title="Releases"
        description={<>{range}{toDate ? `, up to ${toDate}` : ''}. Commits are grouped by their conventional prefix (feat, fix, docs, chore). Review, then copy the notes into your release.</>}
        actions={<>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!ready || !included.length} onClick={() => copyText(buildJson(), 'json')}>
            {copied === 'json' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === 'json' ? 'Copied' : 'Copy JSON'}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!ready || !included.length} onClick={download}><Download className="size-3.5" /> Download .md</Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={!ready || !included.length} onClick={() => copyText(buildMarkdown(), 'md')}>
            {copied === 'md' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === 'md' ? 'Copied' : 'Copy Markdown'}
          </Button>
        </>}
      />

      {loading || error ? (
        <Section className="flex-1">
          {error ? (
            <StateCard icon={AlertTriangle} title="Couldn't generate release notes" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReload(n => n + 1)}>Try again</Button>}>{error} Check your GitHub connection, then try again.</StateCard>
          ) : (
            <div className="flex flex-col gap-3" aria-busy="true">
              <p className="text-xs text-muted-foreground">Reading tags and commits…</p>
              {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          )}
        </Section>
      ) : (
        <>
          <SummaryStrip items={[
            { label: 'Commits', value: included.length, sub: hideMerges ? `${merges} merges hidden` : tagTo ? `In ${tagTo}` : 'Last 30', onClick: () => setCategory('all') },
            ...(['Features', 'Bug Fixes'] as Category[]).map(cat => ({ label: CATEGORY_SHORT[cat], value: counts[cat], sub: category === cat ? 'Click to clear' : `${CATEGORY_SHORT[cat]} only`, onClick: () => setCategory(category === cat ? 'all' : cat) })),
            { label: 'Uncategorized', value: counts.Uncategorized, tone: counts.Uncategorized && counts.Uncategorized === included.length ? 'warn' : 'neutral', sub: counts.Uncategorized ? 'No feat/fix/docs prefix' : 'Every commit is labelled', onClick: () => setCategory(category === 'Uncategorized' ? 'all' : 'Uncategorized') },
            { label: 'Authors', value: authors, sub: 'In this release' },
          ]} />

          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)]">
            <Section className="min-h-[300px]" bodyClassName="p-0 flex flex-col">
              <div className="border-b px-4 py-3">
                <Toolbar count={`${visible.length} change${visible.length === 1 ? '' : 's'}`}>
                  <span className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search changes" aria-label="Search changes" className="h-8 w-40 bg-card pl-8 text-xs" />
                  </span>
                  <Segmented label="Filter by category" value={category} onChange={setCategory} options={[
                    { value: 'all', label: 'All', count: included.length },
                    ...CATEGORY_ORDER.filter(c => counts[c]).map(c => ({ value: c, label: CATEGORY_SHORT[c], count: counts[c] })),
                  ]} />
                  {merges > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs" aria-pressed={hideMerges} onClick={() => setHideMerges(v => !v)}>{hideMerges ? 'Show merges' : `Hide merges (${merges})`}</Button>}
                </Toolbar>
              </div>
              {visible.length === 0 ? (
                <StateCard icon={Tag} title={commits.length ? 'No matching changes' : 'No commits in this range'} action={commits.length ? <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setCategory('all'); setQuery(''); setHideMerges(false); }}>Clear filters</Button> : undefined}>
                  {commits.length ? 'Try another category or clear the search.' : 'The two latest tags point at the same commits. Tag a new release to see what changed.'}
                </StateCard>
              ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto">
                  {CATEGORY_ORDER.filter(cat => visible.some(c => c.category === cat)).map(cat => {
                    const Icon = CATEGORY_ICON[cat];
                    const items = visible.filter(c => c.category === cat);
                    return (
                      <li key={cat}>
                        <h3 className="sticky top-0 z-[1] flex items-center gap-2 border-b bg-[var(--surface-subtle)] px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          <i className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[cat] }} aria-hidden="true" />{cat}<span className="ml-auto font-mono normal-case">{items.length}</span>
                        </h3>
                        <ul className="divide-y">
                          {items.map(c => (
                            <li key={c.sha7} className="flex items-center gap-3 px-4 py-2 hover:bg-[var(--surface-hover)]">
                              <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
                              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="truncate text-[13px] font-semibold" title={c.message}>{c.message}</span>
                                <span className="truncate text-xs text-muted-foreground">{c.author}{c.merge ? ' · merge' : ''}</span>
                              </span>
                              <code className="shrink-0 font-mono text-[11px] text-muted-foreground">{c.sha7}</code>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <div className="flex min-h-0 flex-col gap-3">
              <Section title="What's in it" className="shrink-0" bodyClassName="flex flex-col gap-2.5">
                <CategoryBar counts={counts} total={included.length} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {counts.Uncategorized === included.length && included.length
                    ? 'No commit uses a conventional prefix yet. Start messages with feat:, fix: or docs: and the notes sort themselves.'
                    : `${included.length - counts.Uncategorized} of ${included.length} commits carry a conventional prefix.`}
                </p>
              </Section>
              <Section title="Markdown preview" icon={FileText} className="min-h-[200px] flex-1" bodyClassName="p-0">
                <pre className="m-0 h-full overflow-auto bg-card px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{buildMarkdown()}</pre>
              </Section>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}

/** Stacked bar of commits per category with a labelled legend; hover a slice for its figure. */
function CategoryBar({ counts, total }: { counts: Record<Category, number>; total: number }) {
  const [hover, setHover] = useState<Category | null>(null);
  const cats = CATEGORY_ORDER.filter(c => counts[c]);
  if (!total) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={cats.map(c => `${c} ${counts[c]}`).join(', ')}>
          {cats.map(c => (
            <i key={c} className={cn('block h-full first:rounded-l-full last:rounded-r-full transition-opacity', hover && hover !== c && 'opacity-40')}
              style={{ width: `${(counts[c] / total) * 100}%`, background: CATEGORY_COLOR[c] }} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} />
          ))}
        </div>
        {hover && (
          <div role="status" className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-sm">
            <strong className="font-semibold">{hover}</strong> · {counts[hover]} commit{counts[hover] === 1 ? '' : 's'} ({Math.round((counts[hover] / total) * 100)}%)
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {cats.map(c => (
          <li key={c} className="flex items-center gap-1.5 text-xs" onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
            <i className="size-2 rounded-full" style={{ background: CATEGORY_COLOR[c] }} aria-hidden="true" />{CATEGORY_SHORT[c]} <b className="font-mono font-semibold text-muted-foreground">{counts[c]}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
