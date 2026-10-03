import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { appConfig } from '../../app/config';

interface Member { id: number; username: string; role: string; githubLogin: string | null }

// Organization members, and single-use invite links for admins
// (server: /api/organization/members, /api/organization/invites).
export default function TeamDialog({ onClose }: { onClose: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [canInvite, setCanInvite] = useState(false);
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${appConfig.apiUrl}/api/organization/members`, { credentials: 'include' })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body?.error || 'Could not load your team.');
        setMembers(body.members);
        setCanInvite(Boolean(body.canInvite));
      })
      .catch(e => setError(e.message));
  }, []);

  const createInvite = () => {
    setError('');
    fetch(`${appConfig.apiUrl}/api/organization/invites`, { method: 'POST', credentials: 'include' })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body?.error || 'Could not create an invite.');
        setInvite(body);
        setCopied(false);
      })
      .catch(e => setError(e.message));
  };

  const copy = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.url).then(() => setCopied(true)).catch(() => setCopied(false));
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="team-dialog">
        <DialogHeader>
          <DialogTitle><Users size={16} /> Your team</DialogTitle>
          <DialogDescription>Everyone here shares notes on repository files. Projects and workspaces stay personal.</DialogDescription>
        </DialogHeader>
        {error && <p className="organization-error" role="alert">{error}</p>}
        {members === null && !error && <p className="guide-empty">Loading…</p>}
        {members && (
          <ul className="team-members">
            {members.map(m => (
              <li key={m.id}><strong>{m.username}</strong>{m.githubLogin && <small>@{m.githubLogin}</small>}<span className="guide-layer">{m.role}</span></li>
            ))}
          </ul>
        )}
        {canInvite && (
          <div className="team-invite">
            {invite ? (
              <>
                <label htmlFor="team-invite-url">Invite link — works once, expires {new Date(invite.expiresAt).toLocaleDateString()}</label>
                <div className="team-invite-row">
                  <input id="team-invite-url" readOnly value={invite.url} onFocus={event => event.currentTarget.select()} />
                  <Button className="guide-copy" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</Button>
                </div>
                <p className="guide-empty">Send it privately: whoever opens it first can join as a member.</p>
              </>
            ) : (
              <Button className="guide-copy" onClick={createInvite}><Link2 size={14} /> Create invite link</Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
