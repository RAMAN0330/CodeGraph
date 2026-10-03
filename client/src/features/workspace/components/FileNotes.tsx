import { useState } from 'react';
import { Check, Link2, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fileLink, type Annotation, useRepoAnnotations } from '../services/annotations';

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function NoteItem({ note, canDelete, onResolve, onDelete, children }: {
  note: Annotation; canDelete: boolean; onResolve: (resolved: boolean) => void; onDelete: () => void; children?: React.ReactNode;
}) {
  return (
    <li className={`note${note.resolvedAt ? ' resolved' : ''}`}>
      {children}
      <p className="note-body">{note.body}</p>
      <div className="note-meta">
        <span>{note.author ?? 'former member'} · {when(note.createdAt)}{note.resolvedAt ? ' · resolved' : ''}</span>
        <button type="button" onClick={() => onResolve(!note.resolvedAt)} aria-label={note.resolvedAt ? 'Reopen note' : 'Resolve note'} title={note.resolvedAt ? 'Reopen' : 'Resolve'}>
          {note.resolvedAt ? <RotateCcw size={12} /> : <Check size={12} />}
        </button>
        {canDelete && <button type="button" onClick={onDelete} aria-label="Delete note" title="Delete"><Trash2 size={12} /></button>}
      </div>
    </li>
  );
}

// Team notes on the selected file, in the code graph's file view.
export default function FileNotes({ owner, repo, path }: { owner: string; repo: string; path: string }) {
  const { notes, me, error, add, update, remove } = useRepoAnnotations(owner, repo);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);
  const mine = notes.filter(n => n.path === path);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    add(path, draft).then(() => { setDraft(''); setActionError(''); }).catch(e => setActionError(e.message)).finally(() => setSaving(false));
  };
  const copyLink = () => {
    navigator.clipboard.writeText(fileLink(owner, repo, path)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  const act = (p: Promise<unknown>) => p.then(() => setActionError('')).catch(e => setActionError(e.message));

  return (
    <section className="xfiles-card file-notes">
      <header className="xfiles-card-head">
        <h2><MessageSquare size={14} strokeWidth={2} /> Team notes</h2>
        <button type="button" className="file-notes-link" onClick={copyLink}>{copied ? <><Check size={12} /> Link copied</> : <><Link2 size={12} /> Copy link to file</>}</button>
      </header>
      {(error || actionError) && <p className="organization-error" role="alert">{actionError || error}</p>}
      {mine.length > 0 && (
        <ul className="notes-list">
          {mine.map(note => (
            <NoteItem key={note.id} note={note}
              canDelete={Boolean(me && (me.isAdmin || me.userId === note.authorId))}
              onResolve={resolved => act(update(note.id, { resolved }))}
              onDelete={() => act(remove(note.id))} />
          ))}
        </ul>
      )}
      <form className="note-form" onSubmit={submit}>
        <label htmlFor="file-note-draft" className="sr-only">Add a note about {path}</label>
        <textarea id="file-note-draft" value={draft} onChange={e => setDraft(e.target.value)} maxLength={2000} rows={2}
          placeholder={mine.length ? 'Reply or add context…' : 'Leave context for your team: gotchas, owners, plans…'} />
        <Button type="submit" className="xfiles-btn primary" disabled={saving || !draft.trim()}>{saving ? 'Saving…' : 'Add note'}</Button>
      </form>
    </section>
  );
}
