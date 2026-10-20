import { ArrowRight, Database, FlaskConical, GitPullRequest, History, Network, ShieldAlert, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page, PageHeader, Section } from '../../../../shared/components/Page';
import { StateCard } from '../../../../shared/components/StateCard';
import { usePersistentState } from '../../../../shared/hooks/usePersistentState';

interface Props {
  prUrl: string;
  onPrUrlChange: (value: string) => void;
  onLoadPr: () => void;
}

const NO_RECENT: string[] = [];
const PR_PATTERN = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/;

// What the server-built report (the one the GitHub App posts on the PR) contains.
const COVERS = [
  { icon: ShieldAlert, title: 'Risk score', text: 'One score for the change, with files changed, lines modified and net change.' },
  { icon: Network, title: 'Blast radius', text: 'Files that depend on what changed, the dependency chains between them, and the files with the widest reach.' },
  { icon: FlaskConical, title: 'Test impact', text: 'Which tests are affected by the change, so you know what to run before merging.' },
  { icon: Database, title: 'Endpoints, tables and hotspots', text: 'API endpoints and database tables the change touches, and known hotspots it lands in.' },
  { icon: Users, title: 'Suggested reviewers', text: 'People who recently worked on the same files, from real commit history.' },
];

export default function PullRequestsSection({ prUrl, onPrUrlChange, onLoadPr }: Props) {
  // Recently reviewed PRs are remembered for this user, so a review is one click away.
  const [recent, setRecent] = usePersistentState<string[]>('cg.pr.recent', NO_RECENT);
  const match = prUrl.trim().match(PR_PATTERN);
  const invalid = prUrl.trim() !== '' && !match;

  const load = (url = prUrl) => {
    if (!PR_PATTERN.test(url)) return;
    const clean = url.trim();
    setRecent(list => [clean, ...list.filter(u => u !== clean)].slice(0, 8));
    if (clean !== prUrl) onPrUrlChange(clean);
    onLoadPr();
  };

  return (
    <Page>
      <PageHeader icon={GitPullRequest} tone="insights" title="PR review" description="Paste a GitHub pull request to review its change risk against this repository's analysis before you merge." />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,1fr)]">
        <div className="flex min-h-0 flex-col gap-3">
          <Section title="Review a pull request" icon={GitPullRequest} className="shrink-0" bodyClassName="flex flex-col gap-3 py-4">
            <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); load(); }}>
              <Input
                type="url"
                placeholder="https://github.com/owner/repo/pull/123"
                aria-label="Pull request URL"
                aria-invalid={invalid}
                value={prUrl}
                onChange={e => onPrUrlChange(e.target.value)}
                className="h-9 min-w-[240px] flex-1 bg-card text-[13px]"
              />
              <Button type="submit" className="h-9 gap-1.5" disabled={!match}>Review PR <ArrowRight className="size-4" /></Button>
            </form>
            <p className={invalid ? 'text-xs text-[var(--color-danger)]' : 'text-xs text-muted-foreground'} role={invalid ? 'alert' : undefined}>
              {invalid
                ? 'That is not a pull request link. It should look like github.com/owner/repo/pull/123.'
                : match
                  ? <>Pull request <strong className="font-semibold text-foreground">#{match[3]}</strong> in <code className="font-mono text-foreground">{match[1]}/{match[2]}</code>. Its number is reviewed against the repository analyzed here.</>
                  : 'Copy the link from the pull request page on GitHub and press Enter.'}
            </p>
          </Section>

          <Section title="Recent reviews" icon={History} meta={recent.length ? `${recent.length}` : undefined} className="min-h-[200px] flex-1" bodyClassName="p-0 flex flex-col"
            actions={recent.length ? <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setRecent(NO_RECENT)}>Clear</Button> : undefined}>
            {recent.length === 0 ? (
              <StateCard icon={History} title="No reviews yet">Pull requests you review are listed here, so you can reopen them in one click.</StateCard>
            ) : (
              <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
                {recent.map(url => {
                  const m = url.match(PR_PATTERN);
                  return (
                    <li key={url} className="group flex items-center gap-1 pr-3">
                      <button type="button" onClick={() => load(url)} className="flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><GitPullRequest className="size-4" strokeWidth={1.8} /></span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[13px] font-semibold">Pull request #{m?.[3]}</span>
                          <span className="truncate font-mono text-xs text-muted-foreground">{m ? `${m[1]}/${m[2]}` : url}</span>
                        </span>
                        <span className="shrink-0 text-xs text-primary">Review again</span>
                      </button>
                      <Button variant="ghost" size="icon-sm" className="shrink-0 opacity-60 group-hover:opacity-100" aria-label={`Remove pull request ${m?.[3] ?? url} from recent reviews`} onClick={() => setRecent(list => list.filter(u => u !== url))}><X className="size-3.5" /></Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        <Section title="What the review shows" className="min-h-[260px]" bodyClassName="flex flex-col gap-4 p-5">
          <ul className="flex flex-col gap-4">
            {COVERS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card text-primary"><Icon className="size-4" strokeWidth={1.8} /></span>
                <span className="flex flex-col gap-0.5">
                  <strong className="text-[13px] font-semibold">{title}</strong>
                  <span className="text-xs leading-relaxed text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-auto rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
            The same report is posted on the pull request automatically when the GitHub App is installed on the repository.
          </p>
        </Section>
      </div>
    </Page>
  );
}
