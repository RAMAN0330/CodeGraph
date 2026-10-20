import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Copy, Eraser, FileX, HelpCircle, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../shared/components/Page';
import { StateCard } from '../../../shared/components/StateCard';
import { toneText } from '../../../shared/components/dashboardTones';
import { buildCleanupPlan, planToMarkdown } from '../services/cleanupPlan';

// Unused functions as a removal plan (services/cleanupPlan.ts). Ticks are a
// per-viewer convenience kept in this browser only.

interface Props { owner: string; repo: string; data: any; onOpenFile: (path: string) => void }

const storageKey = (owner: string, repo: string) => `structrace:cleanup:${owner}/${repo}`.toLowerCase();

function loadTicks(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}

export default function CleanupPlanView({ owner, repo, data, onOpenFile }: Props) {
  const plan = useMemo(() => buildCleanupPlan(data), [data]);
  const key = storageKey(owner, repo);
  const [done, setDone] = useState<Set<string>>(() => loadTicks(key));
  const [copied, setCopied] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'whole' | 'check'>('all');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  useEffect(() => { setDone(loadTicks(key)); }, [key]);

  const toggle = (id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* storage unavailable: ticks last for this visit */ }
      return next;
    });
  };
  const copy = () => {
    navigator.clipboard.writeText(planToMarkdown(plan, `${owner}/${repo}`)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  const header = (description: string, actions?: ReactNode) => (
    <PageHeader icon={Eraser} tone="quality" title="Cleanup plan" description={description} actions={actions} />
  );

  if (!plan.totals.functions) {
    return (
      <Page>
        {header('Unused functions grouped into a removal plan, file by file.')}
        <Section className="flex-1">
          <StateCard icon={Sparkles} title="No unused functions">Every function in this analysis is called from somewhere. Rescan after large changes to check again.</StateCard>
        </Section>
      </Page>
    );
  }
  const isDone = (path: string, name: string) => done.has(`${path}#${name}`);
  const doneCount = plan.files.reduce((n, f) => n + f.items.filter(i => isDone(f.path, i.name)).length, 0);
  const hasMentions = (data?.deadFunctions ?? []).some((f: any) => Array.isArray(f.mentions));
  const q = query.trim().toLowerCase();
  const visible = plan.files.filter(f =>
    (kind === 'all' || (kind === 'whole' ? f.wholeFile : f.items.some(i => i.confidence === 'check')))
    && (!hideDone || f.items.some(i => !isDone(f.path, i.name)))
    && (!q || f.path.toLowerCase().includes(q) || f.items.some(i => i.name.toLowerCase().includes(q))));
  const selected = visible.find(f => f.path === selectedPath) ?? visible[0] ?? null;
  const checkFiles = plan.files.filter(f => f.items.some(i => i.confidence === 'check')).length;

  return (
    <Page>
      {header(
        `${plan.totals.functions} unused functions, about ${plan.totals.lines} lines${plan.totals.wholeFiles ? `, including ${plan.totals.wholeFiles} whole file${plan.totals.wholeFiles === 1 ? '' : 's'} that can go` : ''}. ${plan.totals.check ? `${plan.totals.check} are named elsewhere and may be called dynamically, so check those first.` : ''}${!hasMentions ? ' Rescan to also check whether names appear elsewhere.' : ''} Ticks are kept in this browser.`,
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={copy}>{copied ? <><Check className="size-3.5" /> Copied</> : <><Copy className="size-3.5" /> Copy as checklist</>}</Button>,
      )}

      <SummaryStrip items={[
        { label: 'Unused functions', value: plan.totals.functions, sub: `${plan.totals.lines} lines`, onClick: () => setKind('all') },
        { label: 'Whole files', value: plan.totals.wholeFiles, tone: plan.totals.wholeFiles ? 'warn' : 'good', sub: kind === 'whole' ? 'Click to clear' : 'Can be deleted', onClick: () => setKind(k => k === 'whole' ? 'all' : 'whole') },
        { label: 'Check first', value: plan.totals.check, tone: plan.totals.check ? 'warn' : 'good', sub: kind === 'check' ? 'Click to clear' : 'Named elsewhere', onClick: () => setKind(k => k === 'check' ? 'all' : 'check') },
        { label: 'Removed', value: `${doneCount}/${plan.totals.functions}`, tone: doneCount ? 'good' : 'neutral', sub: hideDone ? 'Click to show ticked' : 'Click to hide ticked', onClick: () => setHideDone(v => !v) },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Section className="min-h-[320px]" bodyClassName="p-0 flex flex-col">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${visible.length} file${visible.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" aria-label="Search files or functions" className="h-8 w-40 bg-card pl-8 text-xs" />
              </span>
              <Segmented label="Filter files" value={kind} onChange={setKind} options={[
                { value: 'all', label: 'All', count: plan.files.length },
                { value: 'whole', label: 'Whole files', count: plan.totals.wholeFiles },
                { value: 'check', label: 'Check first', count: checkFiles },
              ]} />
            </Toolbar>
          </div>
          {visible.length === 0 ? (
            <StateCard icon={Search} title="No matching files">Try another filter or clear the search.</StateCard>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {visible.map(file => {
                const ticked = file.items.filter(i => isDone(file.path, i.name)).length;
                const checks = file.items.filter(i => i.confidence === 'check').length;
                const active = selected?.path === file.path;
                const Glyph = file.wholeFile ? FileX : Eraser;
                return (
                  <li key={file.path} className={cn(active && 'bg-[var(--surface-hover)]')}>
                    <button type="button" aria-current={active} onClick={() => setSelectedPath(file.path)} title={file.path} className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]">
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card', file.wholeFile ? toneText.warn : 'text-muted-foreground')}><Glyph className="size-4" strokeWidth={1.8} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn('truncate text-[13px] font-semibold', ticked === file.items.length && 'text-muted-foreground line-through')}>{file.path.split('/').pop()}</span>
                        <span className="truncate text-xs text-muted-foreground">{file.wholeFile ? 'Delete whole file · ' : ''}{file.items.length} function{file.items.length === 1 ? '' : 's'} · {file.lines} lines{checks ? ` · ${checks} to check` : ''}</span>
                      </span>
                      <span className={cn('shrink-0 font-mono text-[11px] tabular-nums', ticked ? toneText.good : 'text-muted-foreground')}>{ticked}/{file.items.length}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {selected ? (
          <Section
            title={selected.path.split('/').pop()}
            meta={selected.wholeFile ? 'whole file can go' : `${selected.items.length} unused`}
            icon={selected.wholeFile ? FileX : Eraser}
            className="min-h-[320px]"
            bodyClassName="p-0"
            action="Open file"
            onAction={() => onOpenFile(selected.path)}
          >
            <p className="truncate border-b px-4 py-2 font-mono text-[11px] text-muted-foreground" title={selected.path}>{selected.path}</p>
            {selected.wholeFile && <p className={cn('border-b px-4 py-2 text-xs', toneText.warn)}>Nothing imports this file and every function in it is unused: delete the file instead of the functions one by one.</p>}
            <ul className="divide-y">
              {selected.items.filter(item => !hideDone || !isDone(selected.path, item.name)).map(item => {
                const id = `${selected.path}#${item.name}`;
                const ticked = done.has(id);
                return (
                  <li key={id} className="px-4 py-2.5">
                    <label className="flex cursor-pointer items-center gap-3">
                      <input type="checkbox" className="size-4 shrink-0 accent-[var(--color-success)]" checked={ticked} onChange={() => toggle(id)} />
                      <code className={cn('min-w-0 truncate font-mono text-[13px] font-semibold', ticked && 'text-muted-foreground line-through')}>{item.name}()</code>
                      {item.confidence === 'check' && <span className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold', toneText.warn)} title={`Also named in ${item.mentions.join(', ')}`}><HelpCircle className="size-3" /> check first</span>}
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">line {item.line} · {item.lines} lines</span>
                    </label>
                    {item.confidence === 'check' && (
                      <div className="mt-1.5 flex flex-col gap-1 pl-7">
                        <span className="text-xs text-muted-foreground">Named in {item.mentions.length} other file{item.mentions.length === 1 ? '' : 's'}; make sure none of them calls it dynamically:</span>
                        {item.mentions.map(m => (
                          <button key={m} type="button" onClick={() => onOpenFile(m)} className="inline-flex w-fit max-w-full items-center gap-1 border-0 bg-transparent p-0 text-left font-mono text-[11px] text-primary hover:underline">
                            <span className="truncate">{m}</span><ArrowRight className="size-3 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : <Section><StateCard icon={Eraser} title="Nothing selected">Pick a file to see its unused functions.</StateCard></Section>}
      </div>
    </Page>
  );
}
