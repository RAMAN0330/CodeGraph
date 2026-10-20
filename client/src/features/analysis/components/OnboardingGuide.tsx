import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Copy, Flag, Layers, Users, Waypoints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import { EmptyNote } from '../../../shared/components/Dashboard';
import { buildOnboardingGuide, guideToMarkdown } from '../services/onboardingGuide';
import { computeOwnershipRisk } from '../../git-insights/services/ownershipRisk';

interface Props {
  owner: string;
  repo: string;
  data: any;
  onOpenFile: (path: string) => void;
}

type Focus = 'start' | 'core' | 'care';

function FileLink({ path, onOpenFile, className }: { path: string; onOpenFile: (path: string) => void; className?: string }) {
  return (
    <button type="button" onClick={() => onOpenFile(path)} title={`Open ${path} in the code graph`}
      className={cn('min-w-0 truncate border-0 bg-transparent p-0 text-left font-mono text-xs text-primary hover:underline', className)}>
      {path}
    </button>
  );
}

function LayerTag({ children, accent }: { children: string; accent?: boolean }) {
  return <span className={cn('shrink-0 rounded-full border px-1.5 text-[10px] leading-4 font-semibold tracking-wide uppercase', accent ? 'border-primary/40 text-primary' : 'text-muted-foreground')}>{children}</span>;
}

/** A file row in the side lists: path, a muted reason, and a right-aligned figure. */
function FileRow({ path, note, meta, onOpenFile, tone }: { path: string; note?: string; meta?: string; onOpenFile: (path: string) => void; tone?: 'warn' }) {
  return (
    <li className="flex items-start gap-3 py-2">
      {tone === 'warn' && <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <FileLink path={path} onOpenFile={onOpenFile} />
        {note && <span className="text-xs leading-snug text-muted-foreground">{note}</span>}
      </div>
      {meta && <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{meta}</span>}
    </li>
  );
}

export default function OnboardingGuide({ owner, repo, data, onOpenFile }: Props) {
  const guide = useMemo(() => buildOnboardingGuide(data), [data]);
  const [owners, setOwners] = useState<Array<{ folder: string; people: string[] }> | null>(null);
  const [copied, setCopied] = useState(false);
  const [focus, setFocus] = useState<Focus>('start');

  // Same bounded, cached sampling the Overview's ownership panel uses.
  useEffect(() => {
    let cancelled = false;
    computeOwnershipRisk(owner, repo, data?.files ?? [])
      .then(summary => {
        if (cancelled || !summary) return;
        setOwners(summary.folders
          .filter(f => f.authors.length)
          .map(f => ({ folder: f.folder, people: f.authors.slice(0, 2).map(a => a.name) })));
      })
      .catch(() => { if (!cancelled) setOwners([]); });
    return () => { cancelled = true; };
  }, [owner, repo, data]);

  const copy = () => {
    navigator.clipboard.writeText(guideToMarkdown(guide, `${owner}/${repo}`, owners ?? undefined))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setCopied(false));
  };

  const header = (
    <PageHeader
      icon={BookOpen}
      tone="explore"
      title="Onboarding guide"
      description={guide.codeFiles
        ? `A reading path through ${owner}/${repo}, computed from the dependency graph of its ${guide.codeFiles.toLocaleString()} code files. Click any file to open it in the code graph.`
        : `A reading path through ${owner}/${repo}, computed from its dependency graph.`}
      actions={guide.codeFiles > 0 && (
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={copy}>
          {copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy as Markdown</>}
        </Button>
      )}
    />
  );

  if (!guide.codeFiles) {
    return (
      <Page>
        {header}
        <Section className="flex-1">
          <StateCard icon={BookOpen} title="No code files in this analysis">
            There is nothing to build a reading path from. Check the exclude patterns in Settings, then re-run the analysis.
          </StateCard>
        </Section>
      </Page>
    );
  }

  const pick = (value: Focus) => setFocus(value);
  const maxLayer = Math.max(1, ...guide.layers.map(l => l.files));

  return (
    <Page>
      {header}

      <SummaryStrip items={[
        { label: 'Code files', value: guide.codeFiles.toLocaleString(), sub: `${guide.layers.length} layer${guide.layers.length === 1 ? '' : 's'}` },
        { label: 'Reading path', value: guide.readingPath.length, sub: 'files, in order' },
        { label: 'Entry points', value: guide.entryPoints.length, sub: focus === 'start' ? 'Showing' : 'Where execution starts', onClick: () => pick('start') },
        { label: 'Core modules', value: guide.coreModules.length, sub: focus === 'core' ? 'Showing' : 'Most depended on', onClick: () => pick('core') },
        { label: 'Handle with care', value: guide.cautions.length, tone: guide.cautions.length ? 'warn' : 'good', sub: focus === 'care' ? 'Showing' : guide.cautions.length ? 'Read before changing' : 'Nothing flagged', onClick: () => pick('care') },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,1fr)]">
        <Section title="Reading path" icon={Waypoints} meta={guide.readingPath.length ? `${guide.readingPath.length} steps from the main entry point` : undefined} className="min-h-[320px]" bodyClassName="p-0">
          {guide.readingPath.length ? (
            <ol className="list-none divide-y">
              {guide.readingPath.map((step, i) => (
                <li key={step.path} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--surface-hover)]">
                  <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg border bg-card font-mono text-[11px] font-semibold', step.kind === 'entry' ? 'text-primary' : 'text-muted-foreground')}>{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileLink path={step.path} onOpenFile={onOpenFile} className="text-[13px] font-medium" />
                      <LayerTag accent={step.kind === 'entry'}>{step.kind === 'entry' ? 'start' : step.layer}</LayerTag>
                    </div>
                    <span className="text-xs leading-snug text-muted-foreground">{step.reason}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <StateCard icon={Waypoints} title="No path to follow">
              No dependencies between files were detected. Start with the entry points and the largest layers instead.
            </StateCard>
          )}
        </Section>

        <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Section
            title={focus === 'start' ? 'Start here' : focus === 'core' ? 'Core modules' : 'Handle with care'}
            icon={focus === 'care' ? AlertTriangle : Flag}
            className="min-h-[240px]"
            bodyClassName="py-1"
            actions={
              <Segmented label="Which files to show" value={focus} onChange={pick} options={[
                { value: 'start', label: 'Start', count: guide.entryPoints.length },
                { value: 'core', label: 'Core', count: guide.coreModules.length },
                { value: 'care', label: 'Care', count: guide.cautions.length },
              ]} />
            }
          >
            {focus === 'start' && (guide.entryPoints.length
              ? <ul className="list-none divide-y">{guide.entryPoints.map(e => <FileRow key={e.path} path={e.path} meta={`reaches ${e.reach}`} onOpenFile={onOpenFile} />)}</ul>
              : <EmptyNote>No entry points found: every file is used by another one.</EmptyNote>)}
            {focus === 'core' && (guide.coreModules.length
              ? <ul className="list-none divide-y">{guide.coreModules.map(m => <FileRow key={m.path} path={m.path} note={m.layer} meta={`used by ${m.dependents}`} onOpenFile={onOpenFile} />)}</ul>
              : <EmptyNote>No file is shared widely enough to count as a core module.</EmptyNote>)}
            {focus === 'care' && (guide.cautions.length
              ? <ul className="list-none divide-y">{guide.cautions.map(c => <FileRow key={c.path + c.reason} path={c.path} note={c.reason} tone="warn" onOpenFile={onOpenFile} />)}</ul>
              : <EmptyNote>No circular dependencies, critical complexity or wide blast radius found.</EmptyNote>)}
          </Section>

          <div className="grid min-h-0 gap-3 sm:grid-cols-2">
            <Section title="Layers" icon={Layers} meta={`${guide.layers.length}`} className="min-h-[200px]">
              <ul className="list-none flex flex-col gap-2.5">
                {guide.layers.map(l => (
                  <li key={l.layer} className="flex flex-col gap-1" title={l.examples.join('\n')}>
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium capitalize">{l.layer}</span>
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{l.files}</span>
                    </div>
                    <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <i className="block h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, (l.files / maxLayer) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Who to ask" icon={Users} className="min-h-[200px]">
              {owners === null ? <EmptyNote>Looking up recent committers…</EmptyNote>
                : owners.length ? (
                  <ul className="list-none divide-y">
                    {owners.map(o => (
                      <li key={o.folder} className="flex flex-col gap-0.5 py-2">
                        <code className="truncate font-mono text-xs">{o.folder}/</code>
                        <span className="truncate text-xs text-muted-foreground">{o.people.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyNote>Commit history isn't available for this repository right now, so owners can't be listed.</EmptyNote>}
            </Section>
          </div>
        </div>
      </div>
    </Page>
  );
}

