import { useMemo, useState } from 'react';
import {
  Box, Check, ChevronRight, Copy, Download, Eye, FlaskConical, GitFork, Layers, Link2,
  ListChecks, RefreshCw, Search, ShieldAlert, Sparkles, Tag, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistentState } from '../../../../shared/hooks/usePersistentState';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
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

export default function ActionsSection({ data, onSelectFile, onViewSource }: Props) {
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | ActionItem['kind']>('all');
  const [showDone, setShowDone] = useState(false);
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

  const selected = useMemo(
    () => visible.find(i => i.id === selectedId) ?? null,
    [visible, selectedId],
  );

  if (!data) {
    return (
      <div className="act-page">
        <header className="act-header">
          <div className="act-header-copy">
            <h1>Actions</h1>
            <p>Prioritized recommendations based on your codebase analysis.</p>
          </div>
        </header>
        <div className="act-empty">
          <ListChecks size={34} strokeWidth={1.6} />
          <h3>No analysis yet</h3>
          <p>Analyze a repository to see suggested actions.</p>
        </div>
      </div>
    );
  }

  const tabs: (Priority | 'all')[] = ['all', 'critical', 'high', 'medium'];

  return (
    <div className="act-page">
      <header className="act-header">
        <div className="act-header-copy">
          <h1>Actions</h1>
          <p>Prioritized recommendations based on your codebase analysis.</p>
        </div>
        <Tabs value={priorityFilter} onValueChange={value => setPriorityFilter(value as Priority | 'all')}>
          <TabsList className="act-tabs" aria-label="Filter by priority">
            {tabs.map(tab => {
              const count = tab === 'all' ? items.length : counts[tab];
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className={`act-tab act-tab-${tab}${priorityFilter === tab ? ' active' : ''}`}
                >
                  {tab === 'all' ? 'All' : PRIORITY_LABEL[tab]}
                  <span>{count}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </header>

      <SummaryStrip items={[
        { label: 'Critical', value: counts.critical, tone: counts.critical ? 'bad' : 'good', onClick: () => setPriorityFilter(priorityFilter === 'critical' ? 'all' : 'critical') },
        { label: 'High', value: counts.high, tone: counts.high ? 'warn' : 'good', onClick: () => setPriorityFilter(priorityFilter === 'high' ? 'all' : 'high') },
        { label: 'Medium', value: counts.medium, onClick: () => setPriorityFilter(priorityFilter === 'medium' ? 'all' : 'medium') },
        { label: 'Done', value: `${doneCount}/${items.length}`, tone: doneCount === items.length && items.length ? 'good' : 'neutral', sub: items.length ? `${Math.round((doneCount / items.length) * 100)}% complete` : undefined },
      ]} />

      <div className={`act-body${selected ? ' with-detail' : ''}`}>
        <section className="act-list-panel">
          <header className="act-list-header">
            <strong>{visible.length} action{visible.length === 1 ? '' : 's'}</strong>
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search actions…" aria-label="Search actions" className="h-7 w-44 pl-7 text-xs" />
              </span>
              <Tabs value={kind} onValueChange={value => setKind(value as typeof kind)}>
                <TabsList aria-label="Filter by type" className="h-7">
                  <TabsTrigger value="all" className="px-2 text-xs">All types</TabsTrigger>
                  <TabsTrigger value="suggestion" className="px-2 text-xs">Fixes</TabsTrigger>
                  <TabsTrigger value="duplicate" className="px-2 text-xs">Duplicates</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button variant="ghost" size="sm" className="h-7 text-xs" aria-pressed={showDone} onClick={() => setShowDone(v => !v)}>{showDone ? 'Hide done' : 'Show done'}</Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" disabled={!visible.length} onClick={() => downloadCsv('actions.csv', ['Priority', 'Type', 'Title', 'Description', 'Done'], visible.map(i => [PRIORITY_LABEL[i.priority], i.kind, i.title, i.desc, doneSet.has(i.id) ? 'yes' : 'no']))}><Download size={13} /> Export CSV</Button>
            </div>
          </header>

          {visible.length === 0 ? (
            <div className="act-empty act-empty-inline">
              <Sparkles size={30} strokeWidth={1.6} />
              <h3>{items.length === 0 ? 'No issues to address!' : 'No matching actions'}</h3>
              <p>{items.length === 0 ? 'Your codebase looks healthy.' : 'Try a different priority filter.'}</p>
            </div>
          ) : (
            <div className="act-list">
              {visible.map(item => {
                const Glyph = iconFor(item);
                return (
                  <div key={item.id} className="act-row-wrap">
                  <Button
                    variant="ghost"
                    className={`act-row h-auto pri-${item.priority}${selectedId === item.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                    aria-current={selectedId === item.id}
                  >
                    <span className="act-row-icon"><Glyph size={18} strokeWidth={1.8} /></span>
                    <span className="act-row-body">
                      <span className="act-row-title">{item.title}</span>
                      <span className="act-row-desc">{item.desc}</span>
                    </span>
                    <Badge className={`act-badge pri-${item.priority}`}>{PRIORITY_LABEL[item.priority]}</Badge>
                    <ChevronRight className="act-row-chevron" size={16} strokeWidth={1.8} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" className={`act-done${doneSet.has(item.id) ? ' on' : ''}`} onClick={() => toggleDone(item.id)} aria-pressed={doneSet.has(item.id)} aria-label={doneSet.has(item.id) ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}><Check size={14} /></Button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {selected && (
          <ActionDetail item={selected} onClose={() => setSelectedId(null)} onSelectFile={onSelectFile} onViewSource={onViewSource} />
        )}
      </div>
    </div>
  );
}

function ActionDetail({
  item, onClose, onSelectFile, onViewSource,
}: {
  item: ActionItem;
  onClose: () => void;
  onSelectFile?: (path: string) => void;
  onViewSource?: (path: string, line?: number) => void;
}) {
  const Glyph = iconFor(item);

  return (
    <aside className="act-detail" aria-label={`${item.title} details`}>
      <header className="act-detail-head">
        <span className={`act-detail-icon pri-${item.priority}`}><Glyph size={22} strokeWidth={1.7} /></span>
        <div className="act-detail-title">
          <h2>{item.title}</h2>
          <p>{item.desc}</p>
        </div>
        <Badge className={`act-badge pri-${item.priority}`}>{PRIORITY_LABEL[item.priority]}</Badge>
        <Button variant="ghost" className="act-detail-close" onClick={onClose} aria-label="Close details">×</Button>
      </header>

      {item.suggestion && (
        <>
          <section className="act-block">
            <h3>Recommended Action</h3>
            <p className="act-prose">{item.suggestion.action}</p>
          </section>
          <section className="act-block">
            <h3>Expected Impact</h3>
            <p className="act-prose act-impact"><Sparkles size={14} strokeWidth={2.2} /><span>{item.suggestion.impact}</span></p>
          </section>
        </>
      )}

      {item.duplicate && (
        <>
          <section className="act-block">
            <h3>Suggested Action</h3>
            <p className="act-prose">
              {item.duplicate.type === 'code'
                ? 'Extract the similar code into a shared utility function. This reduces maintenance burden and ensures consistent behavior.'
                : 'Rename these functions to be more specific, or consolidate them into a single shared function if they serve the same purpose.'}
            </p>
          </section>
          <section className="act-block">
            <h3>Locations ({item.duplicate.files.length}) · {item.duplicate.similarity}% similar</h3>
            <div className="act-files">
              {item.duplicate.files.map((file, i) => (
                <div key={`${file.file}-${i}`} className="act-file">
                  <Button variant="ghost" className="act-file-main h-auto" onClick={() => onSelectFile?.(file.file)}>
                    <strong>{file.name ?? item.duplicate!.name}</strong>
                    <code>{file.file}{file.line ? `:${file.line}` : ''}</code>
                  </Button>
                  {onViewSource && (
                    <Button variant="ghost" className="act-file-view" onClick={() => onViewSource(file.file, file.line)} title="View source">
                      <Eye size={13} strokeWidth={1.9} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </aside>
  );
}
