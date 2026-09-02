import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Database, FolderKanban, GitBranch, LogOut, Network, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { appConfig } from '../../../app/config';
import './WelcomePage.css';

const GH_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

function GithubIcon({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d={GH_PATH} /></svg>;
}

type MeResponse = {
  username: string;
  organizationName: string;
  github: { login: string; avatarUrl: string } | null;
};

const platformOffers = [
  { icon: Network, title: 'Visual architecture maps', copy: 'Every repository becomes a navigable graph of modules, files, and the paths between them.' },
  { icon: GitBranch, title: 'Dependency tracing', copy: 'Follow how code actually connects across your codebase, not just how it is organized on disk.' },
  { icon: ShieldCheck, title: 'Risk & security signals', copy: 'Surface stale code, ownership gaps, and vulnerability signals in the same workspace.' },
  { icon: FolderKanban, title: 'Workspaces & projects', copy: 'Keep repositories organized under focused workspaces so context never gets lost.' },
  { icon: Database, title: 'Database schema visualizer', copy: 'Connect a database or paste a SQL dump to see tables, keys, and relationships mapped out.' },
  { icon: Sparkles, title: 'AI-assisted explanations', copy: 'Get plain-language summaries of architecture and changes when you need the shortcut.' },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<MeResponse | null>(null);
  const [checked, setChecked] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connectFailed = searchParams.get('connect') === 'failed';
  const connectUnavailable = searchParams.get('connect') === 'unavailable';

  const refresh = () => fetch(`${appConfig.apiUrl}/auth/me`, { credentials: 'include', cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(value => {
      if (!value) { navigate('/login', { replace: true }); return; }
      setUser(value);
      setChecked(true);
    })
    .catch(() => navigate('/login', { replace: true }));

  useEffect(() => { void refresh(); }, [navigate]);

  const connectGithub = () => { window.location.href = `${appConfig.apiUrl}/auth/github`; };
  const disconnectGithub = async () => {
    setDisconnecting(true);
    try {
      await fetch(`${appConfig.apiUrl}/auth/github/disconnect`, { method: 'POST', credentials: 'include' });
      await refresh();
    } finally {
      setDisconnecting(false);
    }
  };
  const signOut = () => {
    fetch(`${appConfig.apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' })
      .finally(() => navigate('/', { replace: true }));
  };

  if (!checked || !user) return null;

  return (
    <main className="welcome-page">
      <header className="welcome-topbar">
        <div className="welcome-brand"><span className="welcome-brand-mark"><GitBranch size={19} /></span><strong>GraphKeep</strong></div>
        <button className="welcome-signout" onClick={signOut}><LogOut size={15} /> Sign out</button>
      </header>

      <section className="welcome-hero">
        <span className="welcome-kicker"><Sparkles size={13} /> {user.organizationName}</span>
        <h1>Welcome, {user.username}.</h1>
        <p>Connect GitHub to start analyzing repositories, or explore what GraphKeep can do below.</p>
      </section>

      {connectFailed && <p className="welcome-notice welcome-notice-error">GitHub connection did not complete. Please try again.</p>}
      {connectUnavailable && <p className="welcome-notice welcome-notice-error">GitHub OAuth is not configured on this server.</p>}

      {user.github ? (
        <section className="welcome-connection-card">
          <img className="welcome-avatar" src={user.github.avatarUrl} alt="" />
          <div className="welcome-connection-copy">
            <strong>GitHub connected</strong>
            <span>Connected as @{user.github.login}</span>
          </div>
          <div className="welcome-connection-actions">
            <button className="welcome-switch" onClick={connectGithub}><RefreshCw size={14} /> Use a different account</button>
            <button className="welcome-disconnect" onClick={() => void disconnectGithub()} disabled={disconnecting}>{disconnecting ? 'Disconnecting…' : 'Disconnect'}</button>
          </div>
        </section>
      ) : (
        <section className="welcome-connect-card">
          <span className="welcome-connect-icon"><GithubIcon size={22} /></span>
          <div className="welcome-connection-copy">
            <strong>GitHub not connected</strong>
            <span>Connect your account to browse and analyze repositories.</span>
          </div>
          <button className="welcome-connect-button" onClick={connectGithub}><GithubIcon size={16} /> Connect GitHub</button>
        </section>
      )}

      <section className="welcome-offers">
        <h2>What you'll get on GraphKeep</h2>
        <div className="welcome-offers-grid">
          {platformOffers.map(({ icon: Icon, title, copy }) => (
            <article key={title} className="welcome-offer-card">
              <span className="welcome-offer-icon"><Icon size={19} /></span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <button className="welcome-continue" onClick={() => navigate('/workspaces')}>
        Continue to your workspaces <ArrowRight size={17} />
      </button>
    </main>
  );
}
