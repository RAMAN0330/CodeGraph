import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Folder, FolderTree, UserRound } from 'lucide-react';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import { downloadCsv } from '../../../shared/services/exportCsv';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { computeOwnershipRisk, type OwnershipRiskSummary, type FolderOwnership } from '../services/ownershipRisk';
import { labelClass } from './InsightsBits';

interface CodeOwnershipMapProps {
  owner: string;
  repo: string;
  token: string;
  files: any[];
}

// Data palette in order; authors beyond the top four fold into "Other".
const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)'];
const OTHER = 'var(--text-muted)';
type View = 'all' | 'single' | 'shared';

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export default function CodeOwnershipMap({ owner, repo, files }: CodeOwnershipMapProps) {
  // undefined while loading, null when there is nothing to sample.
  const [summary, setSummary] = useState<OwnershipRiskSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [view, setView] = useState<View>('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(undefined);
    setError(null);
    // Same sampling the Overview uses: the 8 biggest top-level folders, 30 recent commits each.
    computeOwnershipRisk(owner, repo, files)
      .then(s => { if (!cancelled) setSummary(s); })
      .catch(e => { if (!cancelled) setError(e?.message || 'Failed to compute ownership'); });
    return () => { cancelled = true; };
  }, [owner, repo, files, reload]);

  const topLevelFolders = useMemo(() => new Set(files.map(f => { const p = (f.path || f.name || '').split('/'); return p.length > 1 ? p[0] : '(root)'; })).size, [files]);

  // One colour per author for the whole page, ranked by commits across the sampled folders.
  const authorColor = useMemo(() => {
    const totals = new Map<string, number>();
    summary?.folders.forEach(f => f.authors.forEach(a => totals.set(a.name, (totals.get(a.name) ?? 0) + a.commits)));
    const ranked = [...totals].sort((a, b) => b[1] - a[1]);
    return { ranked, color: (name: string) => { const i = ranked.findIndex(([n]) => n === name); return i >= 0 && i < VIZ.length ? VIZ[i] : OTHER; } };
  }, [summary]);

  const header = (
    <PageHeader
      icon={FolderTree}
      tone="insights"
      title="Ownership"
      description="Who works on each of the largest folders, from their 30 most recent commits. Folders with a single author are a knowledge risk; pair or rotate reviews there."
      actions={
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!summary?.folders.length} onClick={() => downloadCsv('ownership.csv', ['Folder', 'Files', 'Main owner', 'Owner share %', 'Authors', 'Sampled commits'], (summary?.folders ?? []).map(f => [f.folder, f.fileCount, f.authors[0]?.name, pct(f.authors[0]?.commits ?? 0, f.sampledCommits), f.authors.length, f.sampledCommits]))}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      }
    />
  );

  if (summary === undefined || error || !summary || !summary.folders.length) return (
    <Page>
      {header}
      <Section className="flex-1">
        {error ? (
          <StateCard icon={AlertTriangle} title="Couldn't build the ownership map" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setReload(n => n + 1)}>Try again</Button>}>{error}</StateCard>
        ) : summary === undefined ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <p className="text-xs text-muted-foreground">Reading recent commits for the largest folders…</p>
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <StateCard icon={FolderTree} title={files.length ? 'No commit history found' : 'No files analyzed yet'}>
            {files.length ? 'GitHub returned no commits for the largest folders. Check that your GitHub connection can read this repository, then reopen this page.' : 'Analyze the repository first; ownership is computed per folder from its files.'}
          </StateCard>
        )}
      </Section>
    </Page>
  );

  const folders = summary.folders.filter(f => view === 'all' || (view === 'single') === (f.authors.length === 1));
  const selected = folders.find(f => f.folder === selectedFolder) ?? folders[0] ?? null;
  const filesCovered = summary.folders.reduce((n, f) => n + f.fileCount, 0);
  const { ranked } = authorColor;
  const legend = [...ranked.slice(0, 4).map(([name]) => ({ name, color: authorColor.color(name) })), ...(ranked.length > 4 ? [{ name: `Other (${ranked.length - 4})`, color: OTHER }] : [])];

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Folders sampled', value: summary.sampledFolders, sub: `Largest of ${topLevelFolders} top-level` },
        { label: 'Files covered', value: filesCovered.toLocaleString(), sub: `${pct(filesCovered, files.length)}% of analyzed files` },
        { label: 'Single owner', value: summary.singleOwnerFolders, tone: summary.singleOwnerFolders ? 'warn' : 'good', sub: view === 'single' ? 'Click to clear' : 'Folders with one author', onClick: () => setView(view === 'single' ? 'all' : 'single') },
        { label: 'Bus factor', value: summary.busFactor ?? '—', tone: summary.busFactor === null ? 'neutral' : summary.busFactor <= 1 ? 'bad' : summary.busFactor === 2 ? 'warn' : 'good', sub: 'People behind half the commits' },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        <Section className="min-h-[300px]" bodyClassName="p-0 flex flex-col">
          <div className="flex flex-col gap-2 border-b px-4 py-3">
            <Toolbar count={`${folders.length} folder${folders.length === 1 ? '' : 's'}`}>
              <Segmented label="Filter folders" value={view} onChange={setView} options={[
                { value: 'all', label: 'All', count: summary.folders.length },
                { value: 'single', label: 'Single owner', count: summary.singleOwnerFolders },
                { value: 'shared', label: 'Shared', count: summary.folders.length - summary.singleOwnerFolders },
              ]} />
            </Toolbar>
            <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Author colours">
              {legend.map(l => <li key={l.name} className="flex items-center gap-1.5 text-xs text-muted-foreground"><i className="size-2 rounded-full" style={{ background: l.color }} aria-hidden="true" />{l.name}</li>)}
            </ul>
          </div>
          {folders.length === 0 ? (
            <StateCard icon={Folder} title="No folders in this view" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setView('all')}>Show all folders</Button>}>
              {view === 'single' ? 'Every sampled folder has more than one author.' : 'Every sampled folder has a single author.'}
            </StateCard>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {folders.map(f => {
                const lead = f.authors[0];
                const active = selected?.folder === f.folder;
                return (
                  <li key={f.folder}>
                    <button type="button" onClick={() => setSelectedFolder(f.folder)} aria-current={active} className={cn('flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><Folder className="size-4" strokeWidth={1.8} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-baseline gap-2">
                          <code className="truncate font-mono text-[13px] font-semibold">{f.folder === '(root)' ? '(root)' : `${f.folder}/`}</code>
                          <span className="shrink-0 text-xs text-muted-foreground">{f.fileCount} files</span>
                        </span>
                        <AuthorBar folder={f} color={authorColor.color} />
                      </span>
                      <span className="w-28 shrink-0 text-right">
                        <b className="block truncate text-xs font-semibold">{lead.name}</b>
                        <span className={cn('text-[11px]', f.authors.length === 1 ? 'text-[var(--color-warning)]' : 'text-muted-foreground')}>{f.authors.length === 1 ? 'Only author' : `${pct(lead.commits, f.sampledCommits)}% · ${f.authors.length} authors`}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {summary.unownedFolders > 0 && <p className="border-t px-4 py-2 text-xs text-muted-foreground">{summary.unownedFolders} of the largest folders returned no commit history and are left out.</p>}
        </Section>

        {selected ? (
          <Section className="min-h-[300px]" bodyClassName="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-muted-foreground"><Folder className="size-5" strokeWidth={1.7} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-mono text-base font-semibold">{selected.folder === '(root)' ? '(root)' : `${selected.folder}/`}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{selected.fileCount} files · {pct(selected.fileCount, files.length)}% of the codebase · last {selected.sampledCommits} commits sampled</p>
              </div>
            </div>
            <p className={cn('rounded-lg border bg-card p-3 text-[13px] leading-relaxed', selected.authors.length === 1 && 'text-[var(--color-warning)]')}>
              {selected.authors.length === 1
                ? `${selected.authors[0].name} made every recent change here. Ask someone else to review the next few changes so the knowledge is shared.`
                : `${selected.authors[0].name} leads with ${pct(selected.authors[0].commits, selected.sampledCommits)}% of recent commits, shared with ${selected.authors.length - 1} other ${selected.authors.length === 2 ? 'person' : 'people'}.`}
            </p>
            <div className="flex flex-col gap-2">
              <h3 className={labelClass}>Recent authors</h3>
              <ul className="flex flex-col gap-1">
                {selected.authors.map(a => (
                  <li key={a.name} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,40%)_4.5rem] items-center gap-3 py-1">
                    <span className="flex min-w-0 items-center gap-2 text-xs"><UserRound className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{a.name}</span></span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full" style={{ width: `${Math.max(2, pct(a.commits, selected.sampledCommits))}%`, background: authorColor.color(a.name) }} /></span>
                    <b className="text-right font-mono text-xs font-semibold">{a.commits} · {pct(a.commits, selected.sampledCommits)}%</b>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        ) : (
          <Section className="min-h-[300px]"><StateCard icon={Folder} title="No folder selected">Pick a folder to see who works on it.</StateCard></Section>
        )}
      </div>
    </Page>
  );
}

/** A folder's recent commits split by author, in the page's author colours; hover names each slice. */
function AuthorBar({ folder, color }: { folder: FolderOwnership; color: (name: string) => string }) {
  return (
    <span className="flex h-1.5 gap-px overflow-hidden rounded-full bg-muted" role="img" aria-label={folder.authors.map(a => `${a.name} ${pct(a.commits, folder.sampledCommits)}%`).join(', ')}>
      {folder.authors.map(a => (
        <i key={a.name} title={`${a.name}: ${a.commits} of ${folder.sampledCommits} commits`} className="block h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(a.commits / folder.sampledCommits) * 100}%`, background: color(a.name) }} />
      ))}
    </span>
  );
}
