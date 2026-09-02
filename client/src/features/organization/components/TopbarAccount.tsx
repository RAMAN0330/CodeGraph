import { LogOut, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { appConfig } from '../../../app/config';

export function TopbarAccount() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch(`${appConfig.apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      window.location.replace('/');
    }
  };

  return <div className="topbar-account" ref={ref}>
    <button className="topbar-account-trigger" type="button" onClick={() => setOpen(value => !value)} aria-label="Open account menu" aria-expanded={open} aria-haspopup="menu"><UserRound size={17} /></button>
    {open && <div className="topbar-account-menu" role="menu" aria-label="Account menu"><button type="button" role="menuitem" onClick={() => void signOut()} disabled={signingOut}><LogOut size={15} /> {signingOut ? 'Signing out…' : 'Sign out'}</button></div>}
  </div>;
}
