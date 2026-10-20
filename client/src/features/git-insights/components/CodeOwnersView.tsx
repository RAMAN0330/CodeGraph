import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, FileCode2, Folder, ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import { GitHub } from '../../repository/services/github';
import { resolveBranch } from '../services/branch';
import {
  LOCATIONS, auditCodeowners, parseCodeowners, renderCodeowners, suggestAreas, suggestOwners,
  type AreaActivity, type Finding,
} from '../services/codeowners';

// Suggested CODEOWNERS from who actually commits where, plus an audit of the
// repository's existing file (services/codeowners.ts).

interface Props { owner: string; repo: string; branch?: string; data: any }

const MONTHS = 12;
const CONCURRENCY = 3;
type View = 'all' | 'owned' | 'quiet';

async function areaActivity(owner: string, repo: string, branch: string | undefined, area: string, files: number): Promise<AreaActivity> {
  const since = new Date(Date.now() - MONTHS * 30 * 86_400_000).toISOString();
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=100&since=${encodeURIComponent(since)}&path=${encodeURIComponent(area)}${branch ? `&sha=${encodeURIComponent(branch)}` : ''}`;
  const commits: any[] = await GitHub.request(url).catch(() => []);
  const counts = new Map<string, number>();
  commits.forEach(c => {
    const login: string | undefined = c?.author?.login;
    if (login && !login.endsWith('[bot]') && c?.author?.type !== 'Bot') counts.set(login, (counts.get(login) ?? 0) + 1);
  });
  return { area, files, commits: [...counts.values()].reduce((a, b) => a + b, 0), authors: [...counts].map(([login, n]) => ({ login, commits: n })) };
}

function describe(f: Finding): React.ReactNode {
  if (f.kind === 'stale-owner') return <><code className="font-mono">{f.owner}</code> owns <code className="font-mono">{f.pattern}</code> (line {f.line}) but hasn't committed under <code className="font-mono">{f.area}/</code> in {MONTHS} months.</>;
  if (f.kind === 'no-match') return <><code className="font-mono">{f.pattern}</code> (line {f.line}) matches no file in the repository.</>;
  return <><code className="font-mono">{f.area}/</code> ({f.files} files) has no owner{f.suggested.length ? <>; suggested: {f.suggested.join(' ')}</> : null}.</>;
}

const FINDING_LABEL: Record<Finding['kind'], string> = { 'stale-owner': 'Stale owner', 'no-match': 'Dead rule', unowned: 'Unowned area' };

export default function CodeOwnersView({ owner, repo, branch, data }: Props) {
  const paths: string[] = useMemo(() => (data?.files ?? []).map((f: any) => f.path), [data]);
  const areas = useMemo(() => suggestAreas(paths), [paths]);
  const [activity, setActivity] = useState<AreaActivity[] | null>(null);
  const [existing, setExisting] = useState<{ path: string; text: string } | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>('all');

  useEffect(() => {
    let cancelled = false;
    setActivity(null);
    setExisting(undefined);
    (async () => {
      // A branch the repository doesn't have would make every read below come back empty.
      const ref = await resolveBranch(owner, repo, branch).catch(() => branch);
      (async () => {
        for (const location of LOCATIONS) {
          const text = await GitHub.getFile(owner, repo, location, ref || undefined).catch(() => null);
          if (text) { if (!cancelled) setExisting({ path: location, text }); return; }
        }
        if (!cancelled) setExisting(null);
      })();
      const results: AreaActivity[] = new Array(areas.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, areas.length) }, async () => {
        while (next < areas.length) {
          const i = next++;
          results[i] = await areaActivity(owner, repo, ref || undefined, areas[i].area, areas[i].files);
        }
      }));
      if (!cancelled) setActivity(results);
    })();
    return () => { cancelled = true; };
  }, [owner, repo, branch, areas]);

  const suggestions = useMemo(() => (activity ? suggestOwners(activity) : []), [activity]);
  const generated = useMemo(() => renderCodeowners(suggestions, MONTHS), [suggestions]);
  const findings = useMemo(
    () => (activity && existing ? auditCodeowners(parseCodeowners(existing.text), paths, activity, suggestions) : []),
    [activity, existing, paths, suggestions],
  );
  const quiet = activity ? activity.filter(a => a.commits === 0) : [];
  const suggestionFor = useMemo(() => new Map(suggestions.map(s => [s.area, s])), [suggestions]);
  const rows = (activity ?? []).filter(a => view === 'all' || (view === 'quiet') === (a.commits === 0));

  const copy = () => {
    navigator.clipboard.writeText(generated).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([generated], { type: 'text/plain' }));
    Object.assign(document.createElement('a'), { href: url, download: 'CODEOWNERS' }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page>
      <PageHeader
        icon={UserCheck}
        tone="insights"
        title="Code owners"
        description={`Who actually maintains each area, from the last ${MONTHS} months of commits, as a CODEOWNERS file you can review and commit, plus an audit of the one you have.`}
        actions={<>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={download} disabled={!suggestions.length}><Download className="size-3.5" /> Download</Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={copy} disabled={!suggestions.length}>{copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy CODEOWNERS</>}</Button>
        </>}
      />

      {activity !== null && (
        <SummaryStrip items={[
          { label: 'Areas', value: areas.length, sub: 'Folders that need an owner', onClick: () => setView('all') },
          { label: 'Owners suggested', value: suggestions.length, tone: suggestions.length ? 'good' : 'neutral', sub: view === 'owned' ? 'Click to clear' : 'Areas with recent commits', onClick: () => setView(view === 'owned' ? 'all' : 'owned') },
          { label: 'Quiet areas', value: quiet.length, tone: quiet.length ? 'warn' : 'good', sub: view === 'quiet' ? 'Click to clear' : `No commits in ${MONTHS} months`, onClick: () => setView(view === 'quiet' ? 'all' : 'quiet') },
          { label: 'Audit findings', value: existing ? findings.length : '—', tone: findings.length ? 'warn' : existing ? 'good' : 'neutral', sub: existing ? existing.path : existing === null ? 'No CODEOWNERS file' : 'Looking for a file…' },
        ]} />
      )}

      {activity === null ? (
        <Section className="flex-1">
          <div className="flex flex-col gap-3" aria-busy="true">
            <p className="text-xs text-muted-foreground">Reading {MONTHS} months of commit history for {areas.length} areas…</p>
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        </Section>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
          <Section className="min-h-[300px]" bodyClassName="p-0 flex flex-col">
            <div className="border-b px-4 py-3">
              <Toolbar count={`${rows.length} area${rows.length === 1 ? '' : 's'}`}>
                <Segmented label="Filter areas" value={view} onChange={setView} options={[
                  { value: 'all', label: 'All', count: activity.length },
                  { value: 'owned', label: 'Active', count: activity.length - quiet.length },
                  { value: 'quiet', label: 'Quiet', count: quiet.length },
                ]} />
              </Toolbar>
            </div>
            {areas.length === 0 ? (
              <StateCard icon={Folder} title="No areas to own">The analysis found no folders below the repository root. Code owners are suggested per folder.</StateCard>
            ) : rows.length === 0 ? (
              <StateCard icon={Folder} title="No areas in this view" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setView('all')}>Show all areas</Button>}>
                {view === 'quiet' ? `Every area had commits in the last ${MONTHS} months.` : `No area had commits from a GitHub account in the last ${MONTHS} months; commit history may be unavailable without a GitHub connection.`}
              </StateCard>
            ) : (
              <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
                {rows.map(a => {
                  const s = suggestionFor.get(a.area);
                  return (
                    <li key={a.area} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><Folder className="size-4" strokeWidth={1.8} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <code className="truncate font-mono text-[13px] font-semibold">{a.area}/</code>
                        <span className="truncate text-xs text-muted-foreground">{a.files} files · {a.commits ? `${a.commits} commits by ${a.authors.length} ${a.authors.length === 1 ? 'person' : 'people'}` : `no commits in ${MONTHS} months`}</span>
                      </span>
                      {s ? (
                        <span className="shrink-0 text-right">
                          <b className="block max-w-48 truncate text-xs font-semibold">{s.owners.join(' ')}</b>
                          <span className="text-[11px] text-muted-foreground">{s.share}% of commits</span>
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] font-semibold text-[var(--color-warning)]">Quiet</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <div className="flex min-h-0 flex-col gap-3">
            <Section title="Generated CODEOWNERS" icon={FileCode2} meta={suggestions.length ? `${suggestions.length} rules` : undefined} className="min-h-[160px] flex-1" bodyClassName="p-0">
              {suggestions.length
                ? <pre className="m-0 h-full overflow-auto bg-card px-4 py-3 font-mono text-[11px] leading-relaxed">{generated}</pre>
                : <StateCard icon={FileCode2} title="Nothing to suggest yet">No commits with a GitHub account were found in the last {MONTHS} months. Once people commit here, owners are suggested from who changes each area most.</StateCard>}
            </Section>

            <Section title={existing ? `Audit of ${existing.path}` : 'Audit'} icon={existing && !findings.length ? ShieldCheck : AlertTriangle} meta={existing && findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : undefined} className="min-h-[140px] flex-1">
              {existing === undefined && <p className="text-xs text-muted-foreground">Looking for an existing CODEOWNERS file…</p>}
              {existing === null && (
                <StateCard icon={AlertTriangle} title="No CODEOWNERS file" action={suggestions.length ? <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={copy}><Copy className="size-3.5" /> Copy the suggestion</Button> : undefined}>
                  Commit the suggestion as <code className="font-mono">.github/CODEOWNERS</code> so reviews are requested from the right people automatically.
                </StateCard>
              )}
              {existing && (findings.length ? (
                <ul className="flex flex-col divide-y">
                  {findings.map((f, i) => (
                    <li key={i} className="flex flex-col gap-0.5 py-2 first:pt-0">
                      <span className={cn('text-[11px] font-semibold', f.kind === 'unowned' ? 'text-muted-foreground' : 'text-[var(--color-warning)]')}>{FINDING_LABEL[f.kind]}</span>
                      <p className="text-xs leading-relaxed">{describe(f)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <StateCard icon={ShieldCheck} title="CODEOWNERS is up to date">Every rule matches files and every listed person still commits there.</StateCard>
              ))}
            </Section>
          </div>
        </div>
      )}
    </Page>
  );
}
