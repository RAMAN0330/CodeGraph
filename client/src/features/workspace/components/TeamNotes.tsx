import { useMemo, useState } from 'react';
import { Check, ExternalLink, FileCode2, MessageSquare, MessageSquarePlus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import { useRepoAnnotations, type Annotation } from '../services/annotations';

type Status = 'open' | 'resolved' | 'all';

const heading = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase';

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fileName(path: string) {
  return path.split('/').pop() || path;
}

// Every team note on the repository, newest first, open before resolved.
export default function TeamNotes({ owner, repo, onOpenFile }: { owner: string; repo: string; onOpenFile: (path: string) => void }) {
  const { notes, me, error, add, update, remove } = useRepoAnnotations(owner, repo);
  const [status, setStatus] = useState<Status>('open');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const act = (p: Promise<unknown>) => p.then(() => setActionError('')).catch(e => setActionError(e.message));

  const open = notes.filter(n => !n.resolvedAt);
  const files = useMemo(() => new Set(notes.map(n => n.path)).size, [notes]);
  const authors = useMemo(() => new Set(notes.map(n => n.author ?? '')).size, [notes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes
      .filter(n => (status === 'all' || (status === 'open') === !n.resolvedAt)
        && (!q || `${n.path} ${n.body} ${n.author ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(Boolean(a.resolvedAt)) - Number(Boolean(b.resolvedAt)) || b.createdAt.localeCompare(a.createdAt));
  }, [notes, status, query]);
  const selected = shown.find(n => n.id === selectedId) ?? shown[0] ?? null;
  const toggleStatus = (value: Status) => setStatus(s => (s === value ? 'all' : value));

  return (
    <Page>
      <PageHeader
        icon={MessageSquare}
        tone="explore"
        title="Team notes"
        description={`Notes your organization left on files in ${owner}/${repo}: gotchas, owners, plans. Resolve a note once it no longer applies.`}
      />

      {notes.length > 0 && (
        <SummaryStrip items={[
          { label: 'Open', value: open.length, tone: open.length ? 'warn' : 'good', sub: status === 'open' ? 'Showing' : 'Needs attention', onClick: () => toggleStatus('open') },
          { label: 'Resolved', value: notes.length - open.length, sub: status === 'resolved' ? 'Showing' : 'No longer applies', onClick: () => toggleStatus('resolved') },
          { label: 'Files with notes', value: files },
          { label: 'Contributors', value: authors },
        ]} />
      )}

      {(error || actionError) && <p className="shrink-0 rounded-lg border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger)]" role="alert">{actionError || error}</p>}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="p-0 flex flex-col">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${shown.length} note${shown.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notes" aria-label="Search notes" className="h-8 w-48 bg-card pl-8 text-xs" />
              </span>
              <Segmented label="Filter by status" value={status} onChange={setStatus} options={[
                { value: 'open', label: 'Open', count: open.length },
                { value: 'resolved', label: 'Resolved', count: notes.length - open.length },
                { value: 'all', label: 'All', count: notes.length },
              ]} />
            </Toolbar>
          </div>

          {shown.length === 0 ? (
            notes.length === 0
              ? <StateCard icon={MessageSquarePlus} title={error ? 'Notes could not be loaded' : 'No notes yet'}>{error ? 'Try again in a moment.' : 'Notes live on files. Open a file in the code graph and use its Team notes card to leave the first one.'}</StateCard>
              : <StateCard icon={MessageSquare} title={query ? 'No matching notes' : status === 'open' ? 'All notes are resolved' : 'No resolved notes'}>{query ? 'Try another word or clear the search.' : 'Switch the filter to see the other notes.'}</StateCard>
          ) : (
            <ul className="list-none min-h-0 flex-1 divide-y overflow-y-auto">
              {shown.map(note => {
                const active = selected?.id === note.id;
                return (
                  <li key={note.id}>
                    <button type="button" onClick={() => setSelectedId(note.id)} aria-current={active}
                      className={cn('flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><FileCode2 className="size-4" strokeWidth={1.8} /></span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cn('truncate text-[13px] font-semibold', note.resolvedAt && 'text-muted-foreground line-through')}>{fileName(note.path)}</span>
                        <span className="truncate text-xs text-muted-foreground">{note.body}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <i className={cn('size-1.5 rounded-full', note.resolvedAt ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]')} aria-hidden="true" />
                          {note.resolvedAt ? 'Resolved' : 'Open'}
                        </span>
                        <span>{when(note.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {selected
          ? <NoteDetail key={selected.id} note={selected} related={notes.filter(n => n.path === selected.path && n.id !== selected.id)}
              canDelete={Boolean(me && (me.isAdmin || me.userId === selected.authorId))}
              onOpenFile={onOpenFile} onSelect={id => { setStatus('all'); setSelectedId(id); }}
              onResolve={resolved => act(update(selected.id, { resolved }))}
              onDelete={() => act(remove(selected.id))}
              onAdd={body => add(selected.path, body).then(note => { setActionError(''); setStatus('open'); setSelectedId(note.id); })} />
          : <HowNotesWork />}
      </div>
    </Page>
  );
}

function NoteDetail({ note, related, canDelete, onOpenFile, onSelect, onResolve, onDelete, onAdd }: {
  note: Annotation;
  related: Annotation[];
  canDelete: boolean;
  onOpenFile: (path: string) => void;
  onSelect: (id: number) => void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  onAdd: (body: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    onAdd(draft).then(() => { setDraft(''); setError(''); }).catch(e => setError(e.message)).finally(() => setSaving(false));
  };

  return (
    <Section className="min-h-[320px]" bodyClassName="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-card text-muted-foreground"><FileCode2 className="size-5" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold', note.resolvedAt ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]')}>
            <i className={cn('size-1.5 rounded-full', note.resolvedAt ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]')} aria-hidden="true" />
            {note.resolvedAt ? `Resolved ${when(note.resolvedAt)}` : 'Open'}
          </span>
          <h2 className="mt-1 truncate text-base font-semibold">{fileName(note.path)}</h2>
          <button type="button" onClick={() => onOpenFile(note.path)} className="inline-flex max-w-full items-center gap-1 border-0 bg-transparent p-0 font-mono text-[11px] text-primary hover:underline" title={`Open ${note.path} in the code graph`}>
            <span className="truncate">{note.path}</span><ExternalLink className="size-3 shrink-0" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className={heading}>Note</h3>
        <p className="rounded-lg border bg-card p-3 text-[13px] leading-relaxed whitespace-pre-wrap">{note.body}</p>
        <p className="text-xs text-muted-foreground">{note.author ?? 'Former member'} · {when(note.createdAt)}{note.updatedAt !== note.createdAt ? ` · edited ${when(note.updatedAt)}` : ''}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant={note.resolvedAt ? 'outline' : 'default'} size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onResolve(!note.resolvedAt)}>
          {note.resolvedAt ? <><RotateCcw className="size-3.5" /> Reopen</> : <><Check className="size-3.5" /> Resolve</>}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onOpenFile(note.path)}><FileCode2 className="size-3.5" /> Open file</Button>
        {canDelete && <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-[var(--color-danger)]" onClick={onDelete}><Trash2 className="size-3.5" /> Delete</Button>}
      </div>

      {related.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className={heading}>Other notes on this file · {related.length}</h3>
          <ul className="list-none divide-y overflow-hidden rounded-lg border bg-card">
            {related.map(n => (
              <li key={n.id}>
                <button type="button" onClick={() => onSelect(n.id)} className="flex w-full flex-col gap-0.5 border-0 bg-transparent px-3 py-2 text-left text-inherit hover:bg-[var(--surface-hover)]">
                  <span className={cn('truncate text-xs', n.resolvedAt && 'text-muted-foreground line-through')}>{n.body}</span>
                  <span className="text-[11px] text-muted-foreground">{n.author ?? 'Former member'} · {when(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="mt-auto flex flex-col gap-2" onSubmit={submit}>
        <label htmlFor="team-note-draft" className={heading}>Add a note on this file</label>
        <textarea id="team-note-draft" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} rows={3}
          placeholder="Reply or add context for your team…"
          className="w-full resize-none rounded-lg border bg-card px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-[var(--border-focus)]" />
        {error && <p className="text-xs text-[var(--color-danger)]" role="alert">{error}</p>}
        <Button type="submit" size="sm" className="h-8 self-start gap-1.5 text-xs" disabled={saving || !draft.trim()}><MessageSquarePlus className="size-3.5" /> {saving ? 'Saving…' : 'Add note'}</Button>
      </form>
    </Section>
  );
}

/** Shown beside an empty list, so the page explains itself instead of sitting blank. */
function HowNotesWork() {
  const steps = [
    ['Open a file', 'Select any file in Explore > Code graph, or click a file link on another page.'],
    ['Leave a note', 'In the file view, find the Team notes card, write the context your team needs, and press Add note.'],
    ['Share and resolve', 'Notes are visible to everyone in your organization. Copy the link to the file to point people at it, and resolve the note once it no longer applies.'],
  ];
  return (
    <Section title="How team notes work" icon={MessageSquarePlus} className="min-h-[320px]" bodyClassName="flex flex-col gap-4 p-5">
      <ol className="list-none flex flex-col gap-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg border bg-card font-mono text-[11px] font-semibold text-primary">{i + 1}</span>
            <div className="flex flex-col gap-0.5">
              <strong className="text-[13px] font-semibold">{title}</strong>
              <span className="text-xs leading-relaxed text-muted-foreground">{body}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-auto rounded-lg border bg-card p-3 text-xs leading-relaxed text-muted-foreground">Anyone can resolve or reopen a note. Only its author or an organization admin can delete it.</p>
    </Section>
  );
}
