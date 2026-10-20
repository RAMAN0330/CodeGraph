import { useCallback, useEffect, useState } from 'react';
import { Download, ScrollText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { appConfig } from '../../app/config';

interface Entry {
  id: string;
  actorName: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
}

const API = `${appConfig.apiUrl}/api/organization/audit`;
const PAGE = 50;
const GROUPS = ['', 'auth', 'organization', 'workspace', 'project', 'connection', 'sql'];

// Admin-only record of who did what in the organization (server: /api/organization/audit).
export default function AuditLogDialog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [group, setGroup] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');

  const query = (before?: string) => {
    const p = new URLSearchParams({ limit: String(PAGE) });
    if (group) p.set('action', group);
    if (before) p.set('before', before);
    return p;
  };

  const load = useCallback((before?: string) => {
    setError('');
    fetch(`${API}?${query(before)}`, { credentials: 'include' })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (res.status === 403) throw new Error('Only organization admins can view the audit log.');
        if (!res.ok) throw new Error(body?.error || 'Could not load the audit log.');
        setEntries(prev => (before && prev ? [...prev, ...body.entries] : body.entries));
        setMore(body.entries.length === PAGE);
      })
      .catch(e => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  useEffect(() => { setEntries(null); load(); }, [load]);

  const csvQuery = query();
  csvQuery.set('format', 'csv');

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="team-dialog">
        <DialogHeader>
          <DialogTitle><ScrollText size={16} /> Audit log</DialogTitle>
          <DialogDescription>Sign-ins, invites, connection changes and SQL runs across your organization.</DialogDescription>
        </DialogHeader>
        <div className="team-invite-row">
          <select aria-label="Filter by area" value={group} onChange={e => setGroup(e.target.value)}>
            {GROUPS.map(g => <option key={g} value={g}>{g || 'All activity'}</option>)}
          </select>
          <Button className="guide-copy" asChild>
            <a href={`${API}?${csvQuery}`}><Download size={14} /> Export CSV</a>
          </Button>
        </div>
        {error && <p className="organization-error" role="alert">{error}</p>}
        {entries === null && !error && <p className="guide-empty">Loading…</p>}
        {entries && entries.length === 0 && <p className="guide-empty">Nothing recorded yet.</p>}
        {entries && entries.length > 0 && (
          <ul className="team-members" style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {entries.map(e => (
              <li key={e.id}>
                <strong>{e.action}</strong>
                <small>{e.actorName ?? 'system'}{e.resourceType ? ` · ${e.resourceType}${e.resourceId ? ` ${e.resourceId}` : ''}` : ''}</small>
                <span className="guide-layer">{new Date(e.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
        {more && entries && <Button className="guide-copy" onClick={() => load(entries[entries.length - 1].id)}>Load more</Button>}
      </DialogContent>
    </Dialog>
  );
}
