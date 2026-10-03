import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { useRepoAnnotations } from '../services/annotations';
import { NoteItem } from './FileNotes';

// Every team note on the repository, newest first, open before resolved.
export default function TeamNotes({ owner, repo, onOpenFile }: { owner: string; repo: string; onOpenFile: (path: string) => void }) {
  const { notes, me, error, update, remove } = useRepoAnnotations(owner, repo);
  const [showResolved, setShowResolved] = useState(false);
  const [actionError, setActionError] = useState('');
  const open = notes.filter(n => !n.resolvedAt);
  const shown = showResolved ? notes : open;
  const act = (p: Promise<unknown>) => p.then(() => setActionError('')).catch(e => setActionError(e.message));

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Team notes</h1>
          <p>Notes your organization left on files in {owner}/{repo}. Add one from any file in the code graph.</p>
        </div>
        {notes.length > open.length && (
          <label className="notes-toggle"><input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} /> Show resolved ({notes.length - open.length})</label>
        )}
      </header>
      {(error || actionError) && <p className="organization-error" role="alert">{actionError || error}</p>}
      {!shown.length && !error && (
        <div className="guide-card"><p className="guide-empty"><MessageSquare size={14} /> {notes.length ? 'All notes are resolved.' : 'No notes yet. Open a file in the code graph and leave the first one.'}</p></div>
      )}
      {shown.length > 0 && (
        <ul className="notes-list notes-list-page">
          {shown.map(note => (
            <NoteItem key={note.id} note={note}
              canDelete={Boolean(me && (me.isAdmin || me.userId === note.authorId))}
              onResolve={resolved => act(update(note.id, { resolved }))}
              onDelete={() => act(remove(note.id))}>
              <button type="button" className="guide-file" onClick={() => onOpenFile(note.path)}>{note.path}</button>
            </NoteItem>
          ))}
        </ul>
      )}
    </div>
  );
}
