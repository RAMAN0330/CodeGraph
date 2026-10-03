import { useEffect, useState } from 'react';
import { Bookmark, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { appConfig } from '../../../app/config';
import { moduleForSection, WORKSPACE_MODULES } from '../config/workspaceModules';

// Named views of the workspace (section + file + branch), shared with the
// organization (server: /api/views).

export interface ViewState { section: string; file: string | null; branch: string | null }
interface SavedView extends ViewState { id: number; name: string; createdBy: string | null; createdById: number | null }

interface Props {
  owner: string;
  repo: string;
  current: ViewState;
  onOpen: (view: ViewState) => void;
}

function toolLabel(section: string): string {
  for (const m of WORKSPACE_MODULES) {
    const tool = m.tools.find(t => t.id === section);
    if (tool) return tool.label === m.label ? m.label : `${m.label} · ${tool.label}`;
  }
  return moduleForSection(section).label;
}

export default function SavedViews({ owner, repo, current, onOpen }: Props) {
  const base = `${appConfig.apiUrl}/api/views`;
  const [views, setViews] = useState<SavedView[]>([]);
  const [me, setMe] = useState<{ userId: number; isAdmin: boolean } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`${base}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { credentials: 'include' })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body?.error || 'Could not load saved views.');
        setViews(body.views);
        setMe({ userId: body.userId, isAdmin: body.isAdmin });
      })
      .catch(e => setError(e.message));
  }, [open, base, owner, repo]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    fetch(`${base}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...current }),
    })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body?.error || 'Could not save the view.');
        setViews(list => [...list, body].sort((a, b) => a.name.localeCompare(b.name)));
        setName('');
      })
      .catch(e => setError(e.message));
  };

  const remove = (id: number) => {
    fetch(`${base}/${id}`, { method: 'DELETE', credentials: 'include' })
      .then(res => { if (res.ok) setViews(list => list.filter(v => v.id !== id)); else setError('Could not delete that view.'); });
  };

  const currentLabel = `${toolLabel(current.section)}${current.file ? ` · ${current.file.split('/').pop()}` : ''}${current.branch ? ` · ${current.branch}` : ''}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="workspace-views-trigger" aria-label="Saved views"><Bookmark size={14} strokeWidth={1.8} /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="saved-views">
        <h2>Saved views</h2>
        {views.length ? (
          <ul>
            {views.map(v => (
              <li key={v.id}>
                <button type="button" className="saved-view-open" onClick={() => { onOpen(v); setOpen(false); }}>
                  <strong>{v.name}</strong>
                  <small>{toolLabel(v.section)}{v.file ? ` · ${v.file.split('/').pop()}` : ''}{v.branch ? ` · ${v.branch}` : ''}{v.createdBy ? ` · ${v.createdBy}` : ''}</small>
                </button>
                {me && (me.isAdmin || me.userId === v.createdById) && (
                  <button type="button" className="saved-view-delete" aria-label={`Delete view ${v.name}`} onClick={() => remove(v.id)}><Trash2 size={13} /></button>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="guide-empty">No saved views for this repository yet.</p>}
        <form onSubmit={save}>
          <label htmlFor="saved-view-name">Save this view <small>{currentLabel}</small></label>
          <div>
            <input id="saved-view-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="e.g. Payments hot path" autoComplete="off" />
            <Button type="submit" className="guide-copy" disabled={!name.trim()}>Save</Button>
          </div>
        </form>
        {error && <p className="organization-error" role="alert">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
