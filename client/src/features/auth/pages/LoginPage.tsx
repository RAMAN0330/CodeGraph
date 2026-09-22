import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, Network, ShieldCheck, Sparkles } from 'lucide-react';
import { appConfig } from '../../../app/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import './LoginPage.css';

function GitGraphMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="auth-logo-gradient" x1="4" y1="3" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--teal-500)" />
          <stop offset="1" stopColor="var(--chart-cyan)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#auth-logo-gradient)" />
      <path d="M18 10v4m0 0-8 5m8-5 8 5M10 19v7h16v-7" stroke="var(--bg-canvas)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="9" r="3" fill="var(--bg-canvas)" />
      <circle cx="10" cy="19" r="3" fill="var(--surface-subtle)" stroke="var(--text-primary)" strokeWidth="1.2" />
      <circle cx="26" cy="19" r="3" fill="var(--surface-subtle)" stroke="var(--text-primary)" strokeWidth="1.2" />
      <circle cx="18" cy="27" r="3" fill="var(--chart-purple)" stroke="var(--bg-canvas)" strokeWidth="1.4" />
    </svg>
  );
}

const benefits = [
  'Visualize architecture and dependencies',
  'Explore public and private repositories',
  'Review schema, branches, and security',
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const authFailed = searchParams.get('auth') === 'failed';

  useEffect(() => {
    fetch(`${appConfig.apiUrl}/auth/me`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(user => { if (user) navigate('/welcome', { replace: true }); })
      .catch(() => undefined);
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await fetch(`${appConfig.apiUrl}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? 'Could not sign in.'); return; }
      navigate('/welcome', { replace: true });
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <Button variant="ghost" className="auth-back" onClick={() => navigate('/')}>
        <ArrowLeft size={16} /> Back to home
      </Button>

      <section className="auth-shell">
        <aside className="auth-story">
          <div className="auth-brand">
            <GitGraphMark />
            <div>
              <div className="auth-brand-name">Structrace</div>
              <div className="auth-brand-version">visual code intelligence</div>
            </div>
          </div>

          <div className="auth-story-copy">
            <div className="auth-kicker"><Sparkles size={14} /> Your codebase, connected</div>
            <h1>See the structure<br />behind the <span>source.</span></h1>
            <p>Turn any GitHub repository into a living map of its architecture, data, history, and risk.</p>
            <div className="auth-benefits">
              {benefits.map(item => <div key={item}><Check size={16} /> {item}</div>)}
            </div>
          </div>

          <div className="auth-story-footer">
            <Network size={17} /> One repository. Every relationship.
          </div>
        </aside>

        <div className="auth-form-side">
          <form className="auth-card" onSubmit={submit}>
            <div className="auth-eyebrow">SIGN IN</div>
            <h2>Welcome back</h2>
            <p className="auth-subtitle">Sign in with your Structrace account.</p>

            {authFailed && <Alert variant="destructive" className="auth-error"><AlertDescription className="text-inherit">Your session expired. Please sign in again.</AlertDescription></Alert>}
            {error && <Alert variant="destructive" className="auth-error"><AlertDescription className="text-inherit">{error}</AlertDescription></Alert>}

            <div className="auth-field">
              <Label htmlFor="login-username">Username</Label>
              <Input id="login-username" autoFocus autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} />
            </div>
            <div className="auth-field">
              <Label htmlFor="login-password">Password</Label>
              <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
            </div>

            <Button className="auth-primary-button" type="submit" disabled={submitting || !username || !password}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>

            <div className="auth-new-user">
              <strong>New to Structrace?</strong>
              <p><Link to="/register">Create an organization account</Link> — no credit card, no setup required.</p>
            </div>

            <div className="auth-security">
              <ShieldCheck size={16} />
              <span>Passwords are hashed and never stored in plain text. Connecting GitHub happens after you sign in.</span>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
