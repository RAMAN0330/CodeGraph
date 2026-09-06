import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { appConfig } from '../../app/config';

const API = appConfig.apiUrl;

export interface AccountMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

interface GitHubUser {
  login: string;
  avatar_url: string;
}

interface AccountMenuProps {
  /** Known login/avatar (skips the self-fetch). Pass both or neither. */
  login?: string;
  avatarUrl?: string;
  /**
   * 'sidebar' — full-width row, collapses to icon-only when the sidebar is
   *   collapsed (name uses .sidebar-inline-label).
   * 'inline' — avatar + name always visible, for headers with room to spare.
   * 'topbar' — icon-only circular trigger; name appears inside the menu.
   */
  variant: 'sidebar' | 'inline' | 'topbar';
  /** Highlights the trigger, e.g. while its Settings destination is open. */
  active?: boolean;
  /** Extra items rendered above the built-in Sign out item. */
  menuItems?: AccountMenuItem[];
}

function useSelfFetchedUser(login?: string, avatarUrl?: string) {
  const [user, setUser] = useState<GitHubUser | null>(
    login ? { login, avatar_url: avatarUrl ?? '' } : null,
  );

  useEffect(() => {
    if (login) { setUser({ login, avatar_url: avatarUrl ?? '' }); return; }
    let cancelled = false;
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (!cancelled && data?.login) setUser(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [login, avatarUrl]);

  return user;
}

function Avatar({ login, avatarUrl, size }: { login: string; avatarUrl: string; size: number }) {
  if (avatarUrl) return <img className="account-avatar-img" src={avatarUrl} alt={login} style={{ width: size, height: size }} />;
  const initial = login.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      aria-hidden="true"
      className="account-avatar-fallback"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
    >
      {initial}
    </span>
  );
}

export default function AccountMenu({ login, avatarUrl, variant, active, menuItems = [] }: AccountMenuProps) {
  const user = useSelfFetchedUser(login, avatarUrl);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      window.location.replace('/');
    }
  }

  const name = user?.login ?? 'Account';
  const avatar = user?.avatar_url ?? '';

  return (
    <div className={`account-menu account-menu--${variant}`} ref={ref}>
      {variant === 'topbar' ? (
        <button
          className={`account-trigger account-trigger--icon${active ? ' active' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Open account menu"
        >
          <Avatar login={name} avatarUrl={avatar} size={20} />
        </button>
      ) : (
        <button
          className={`account-trigger${active ? ' active' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Open account menu"
        >
          <span className="account-avatar"><Avatar login={name} avatarUrl={avatar} size={26} /></span>
          <span className={variant === 'sidebar' ? 'account-trigger-copy sidebar-inline-label' : 'account-trigger-copy'}>
            <strong>{name}</strong>
            <small>Connected</small>
          </span>
        </button>
      )}

      {open && (
        <div className="account-panel" role="menu" aria-label="Account menu">
          {variant === 'topbar' && (
            <div className="account-panel-header">
              <Avatar login={name} avatarUrl={avatar} size={30} />
              <div><strong>{name}</strong><small>GitHub connected</small></div>
            </div>
          )}
          {menuItems.map(item => (
            <button key={item.label} role="menuitem" className="account-item" onClick={() => { item.onClick(); setOpen(false); }}>
              {item.icon}{item.label}
            </button>
          ))}
          <button role="menuitem" className="account-item danger" onClick={handleSignOut} disabled={signingOut}>
            <LogOut size={14} strokeWidth={1.9} /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
