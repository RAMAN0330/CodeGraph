import { useMemo, useState } from 'react';
import {
  Box, Check, Copy, Download, Eye, FlaskConical, GitFork, Layers, Link2,
  ListChecks, RefreshCw, Search, ShieldAlert, Sparkles, Tag, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePersistentState } from '../../../../shared/hooks/usePersistentState';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../../shared/components/Page';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import { downloadCsv } from '../../../../shared/services/exportCsv';

type Priority = 'critical' | 'high' | 'medium';

interface Suggestion {
  icon: string;
  title: string;
  desc: string;
  action: string;
  impact: string;
  priority: Priority | string;
}

interface DuplicateFile {
  file: string;
  line?: number;
  name?: string;
}

interface Duplicate {
  type: 'code' | 'name' | string;
  name: string;
  count: number;
  files: DuplicateFile[];
  similarity: number;
  suggestion: string;
}

interface Props {
  data: { suggestions?: Suggestion[]; duplicates?: Duplicate[] } | null;
  onSelectFile?: (path: string) => void;
  onViewSource?: (path: string, line?: number) => void;
}

interface ActionItem {
  id: string;
  kind: 'suggestion' | 'duplicate';
  priority: Priority;
  title: string;
  desc: string;
  suggestion?: Suggestion;
  duplicate?: Duplicate;
}

const NO_ACTIONS_DONE: string[] = [];
const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2 };
const PRIORITY_LABEL: Record<Priority, string> = { critical: 'Critical', high: 'High', medium: 'Medium' };

const SUGGESTION_ICONS: Record<string, any> = {
  broom: Trash2, refresh: RefreshCw, split: GitFork, link: Link2, copy: Copy,
  box: Box, layers: Layers, shield: ShieldAlert, beaker: FlaskConical,
};

function toItems(suggestions: Suggestion[], duplicates: Duplicate[]): ActionItem[] {
  const fromSuggestions: ActionItem[] = suggestions.map((s, i) => ({
    id: `sg-${i}-${s.title}`,
    kind: 'suggestion',
    priority: (['critical', 'high', 'medium'].includes(s.priority) ? s.priority : 'medium') as Priority,
    title: s.title,
    desc: s.desc,
    suggestion: s,
  }));
  const fromDuplicates: ActionItem[] = duplicates.map((d, i) => ({
    id: `dup-${i}-${d.name}`,
    kind: 'duplicate',
    priority: d.type === 'code' ? 'high' : 'medium',
    title: d.type === 'code' ? `Similar Code: ${d.name}` : `Duplicate Name: ${d.name}`,
    desc: d.suggestion,
    duplicate: d,
  }));
  return [...fromSuggestions, ...fromDuplicates];
}

function iconFor(item: ActionItem) {
  if (item.kind === 'duplicate') return item.duplicate?.type === 'code' ? Copy : Tag;
  return SUGGESTION_ICONS[item.suggestion?.icon ?? ''] ?? Sparkles;
}

const PRIORITY_TONE: Record<Priority, Tone> = { critical: 'bad', high: 'warn', medium: 'neutral' };
const PRIORITY_DOT: Record<Priority, string> = { critical: 'bg-[var(--color-danger)]', high: 'bg-[var(--color-warning)]', medium: 'bg-muted-foreground' };
// Over a thousand duplicate findings is common; render in pages so the list stays quick.
const PAGE_SIZE = 150;

function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', toneText[PRIORITY_TONE[priority]])}>
      <i className={cn('size-1.5 rounded-full', PRIORITY_DOT[priority])} aria-hidden="true" />{PRIORITY_LABEL[priority]}
    </span>
  );
}

export default function ActionsSection({ data, onSelectFile, onViewSource }: Props) {
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | ActionItem['kind']>('all');
  const [showDone, setShowDone] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  // Ticked-off actions are remembered in this browser, so a review can be resumed.
  const [done, setDone] = usePersistentState<string[]>('cg.actions.done', NO_ACTIONS_DONE);
  const toggleDone = (id: string) => setDone(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const items = useMemo(
    () => toItems(data?.suggestions ?? [], data?.duplicates ?? []),
    [data],
  );

  const counts = useMemo(() => {
    const c: Record<Priority, number> = { critical: 0, high: 0, medium: 0 };
    items.forEach(i => { c[i.priority]++; });
    return c;
  }, [items]);
  const kindCounts = useMemo(() => ({
    suggestion: items.filter(i => i.kind === 'suggestion').length,
    duplicate: items.filter(i => i.kind === 'duplicate').length,
  }), [items]);

  const doneSet = useMemo(() => new Set(done), [done]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter(i =>
      (priorityFilter === 'all' || i.priority === priorityFilter)
      && (kind === 'all' || i.kind === kind)
      && (showDone || !doneSet.has(i.id))
      && (!q || `${i.title} ${i.desc}`.toLowerCase().includes(q)));
    return filtered.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [items, priorityFilter, kind, query, showDone, doneSet]);
  const doneCount = items.filter(i => doneSet.has(i.id)).length;

  // The detail pane always shows something: the chosen action, else the top one.
  const selected = visible.find(i => i.id === selectedId) ?? visible[0] ?? null;

  if (!data) {
    return (
      <Page>
        <PageHeader icon={ListChecks} tone="actions" title="Actions" description="Prioritized recommendations based on your codebase analysis." />
        <StateCard icon={ListChecks} title="No analysis yet">Analyze a repository to see suggested actions.</StateCard>
      </Page>
    );
  }

  const setPriority = (value: Priority | 'all') => { setPriorityFilter(value); setLimit(PAGE_SIZE); };

  return (
    <Page>
      <PageHeader
        icon={ListChecks}
        tone="actions"
        title="Actions"
        description="What to fix next, ranked by priority. Tick items off as you go; progress is kept in this browser."
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!visible.length} onClick={() => downloadCsv('actions.csv', ['Priority', 'Type', 'Title', 'Description', 'Done'], visible.map(i => [PRIORITY_LABEL[i.priority], i.kind, i.title, i.desc, doneSet.has(i.id) ? 'yes' : 'no']))}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        }
      />

      <SummaryStrip items={[
        { label: 'Critical', value: counts.critical, tone: counts.critical ? 'bad' : 'good', sub: priorityFilter === 'critical' ? 'Click to clear' : 'Fix first', onClick: () => setPriority(priorityFilter === 'critical' ? 'all' : 'critical') },
        { label: 'High', value: counts.high, tone: counts.high ? 'warn' : 'good', sub: priorityFilter === 'high' ? 'Click to clear' : 'Plan this sprint', onClick: () => setPriority(priorityFilter === 'high' ? 'all' : 'high') },
        { label: 'Medium', value: counts.medium, sub: priorityFilter === 'medium' ? 'Click to clear' : 'When nearby', onClick: () => setPriority(priorityFilter === 'medium' ? 'all' : 'medium') },
        { label: 'Done', value: `${doneCount}/${items.length}`, tone: doneCount === items.length && items.length ? 'good' : 'neutral', sub: items.length ? `${Math.round((doneCount / items.length) * 100)}% complete` : undefined },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="p-0 flex flex-col">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${visible.length.toLocaleString()} action${visible.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE_SIZE); }} placeholder="Search actions" aria-label="Search actions" className="h-8 w-48 bg-card pl-8 text-xs" />
              </span>
              <Segmented label="Filter by type" value={kind} onChange={value => { setKind(value); setLimit(PAGE_SIZE); }} options={[
                { value: 'all', label: 'All', count: items.length },
                { value: 'suggestion', label: 'Fixes', count: kindCounts.suggestion },
                { value: 'duplicate', label: 'Duplicates', count: kindCounts.duplicate },
              ]} />
              <Button variant="ghost" size="sm" className="h-8 text-xs" aria-pressed={showDone} onClick={() => setShowDone(v => !v)}>{showDone ? 'Hide done' : `Show done${doneCount ? ` (${doneCount})` : ''}`}</Button>
            </Toolbar>
          </div>

          {visible.length === 0 ? (
            <StateCard icon={Sparkles} title={items.length === 0 ? 'Nothing to address' : 'No matching actions'}>
              {items.length === 0 ? 'Your codebase looks healthy.' : 'Try another filter or clear the search.'}
            </StateCard>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
              {visible.slice(0, limit).map(item => {
                const Glyph = iconFor(item);
                const isDone = doneSet.has(item.id);
                const active = selected?.id === item.id;
                return (
                  <li key={item.id} className={cn('group flex items-center gap-1 pr-3', active && 'bg-[var(--surface-hover)]')}>
                    <button type="button" onClick={() => setSelectedId(item.id)} aria-current={active} className="flex min-w-0 flex-1 items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit">
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card', toneText[PRIORITY_TONE[item.priority]])}><Glyph className="size-4" strokeWidth={1.8} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn('truncate text-[13px] font-semibold', isDone && 'text-muted-foreground line-through')}>{item.title}</span>
                        <span className="truncate text-xs text-muted-foreground">{item.desc}</span>
                      </span>
                      <PriorityLabel priority={item.priority} />
                    </button>
                    <Button variant="ghost" size="icon-sm" className={cn('shrink-0 rounded-full border', isDone ? 'border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]' : 'text-muted-foreground opacity-60 group-hover:opacity-100')} onClick={() => toggleDone(item.id)} aria-pressed={isDone} aria-label={isDone ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}><Check className="size-3.5" /></Button>
                  </li>
                );
              })}
              {visible.length > limit && (
                <li className="p-3 text-center">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLimit(l => l + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, visible.length - limit)} more of {(visible.length - limit).toLocaleString()}</Button>
                </li>
              )}
            </ul>
          )}
        </Section>

        {selected
          ? <ActionDetail item={selected} done={doneSet.has(selected.id)} onToggleDone={() => toggleDone(selected.id)} onSelectFile={onSelectFile} onViewSource={onViewSource} />
          : <Section><StateCard icon={ListChecks} title="Nothing selected">Pick an action to see what to do and where.</StateCard></Section>}
      </div>
    </Page>
  );
}

function ActionDetail({
  item, done, onToggleDone, onSelectFile, onViewSource,
}: {
  item: ActionItem;
  done: boolean;
  onToggleDone: () => void;
  onSelectFile?: (path: string) => void;
  onViewSource?: (path: string, line?: number) => void;
}) {
  const Glyph = iconFor(item);
  const heading = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase';

  return (
    <Section className="min-h-[320px]" bodyClassName="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-3" aria-label={`${item.title} details`}>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl border bg-card', toneText[PRIORITY_TONE[item.priority]])}><Glyph className="size-5" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <PriorityLabel priority={item.priority} />
          <h2 className="mt-1 text-base leading-snug font-semibold">{item.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
        </div>
      </div>

      {item.suggestion && (
        <>
          <div className="flex flex-col gap-1.5">
            <h3 className={heading}>What to do</h3>
            <p className="text-[13px] leading-relaxed">{item.suggestion.action}</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border bg-card p-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <h3 className={heading}>Expected impact</h3>
              <p className="mt-1 text-[13px] leading-relaxed">{item.suggestion.impact}</p>
            </div>
          </div>
        </>
      )}

      {item.duplicate && (
        <>
          <div className="flex flex-col gap-1.5">
            <h3 className={heading}>What to do</h3>
            <p className="text-[13px] leading-relaxed">
              {item.duplicate.type === 'code'
                ? 'Extract the similar code into one shared function, so a fix lands everywhere at once.'
                : 'Give these functions more specific names, or merge them into one shared function if they do the same thing.'}
            </p>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <h3 className={heading}>{item.duplicate.files.length} locations · {item.duplicate.similarity}% similar</h3>
            <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
              {item.duplicate.files.map((file, i) => (
                <li key={`${file.file}-${i}`} className="flex items-center gap-2 pr-2">
                  <button type="button" className="flex min-w-0 flex-1 flex-col items-start gap-0.5 border-0 bg-transparent px-3 py-2 text-left text-inherit hover:bg-[var(--surface-hover)]" onClick={() => onSelectFile?.(file.file)}>
                    <strong className="truncate text-xs font-semibold">{file.name ?? item.duplicate!.name}</strong>
                    <code className="truncate font-mono text-[11px] text-muted-foreground">{file.file}{file.line ? `:${file.line}` : ''}</code>
                  </button>
                  {onViewSource && (
                    <Button variant="ghost" size="icon-sm" onClick={() => onViewSource(file.file, file.line)} aria-label={`View source of ${file.file}`}><Eye className="size-3.5" /></Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Button variant={done ? 'outline' : 'default'} size="sm" className="mt-auto h-9 self-start gap-1.5" onClick={onToggleDone}>
        <Check className="size-4" /> {done ? 'Mark as not done' : 'Mark as done'}
      </Button>
    </Section>
  );
}
