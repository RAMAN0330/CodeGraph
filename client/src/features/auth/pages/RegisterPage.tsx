import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Network, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';
import { appConfig } from '../../../app/config';
import './LoginPage.css';

function GitGraphMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="auth-logo-gradient-register" x1="4" y1="3" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#61afef" />
          <stop offset="1" stopColor="#56b6c2" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#auth-logo-gradient-register)" />
      <path d="M18 10v4m0 0-8 5m8-5 8 5M10 19v7h16v-7" stroke="#181a1f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="9" r="3" fill="#181a1f" />
      <circle cx="10" cy="19" r="3" fill="#282c34" stroke="#d7dae0" strokeWidth="1.2" />
      <circle cx="26" cy="19" r="3" fill="#282c34" stroke="#d7dae0" strokeWidth="1.2" />
      <circle cx="18" cy="27" r="3" fill="#c678dd" stroke="#181a1f" strokeWidth="1.4" />
    </svg>
  );
}

const benefits = [
  'One organization for your whole team',
  'Connect GitHub once you are signed in',
  'Workspaces to keep every project organized',
];

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [organizationName, setOrganizationName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const response = await fetch(`${appConfig.apiUrl}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationName, username, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? 'Could not create your account.'); return; }
      navigate('/welcome', { replace: true });
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillGeneratedPassword = () => {
    const value = generatePassword();
    setPassword(value);
    setConfirmPassword(value);
  };

  return (
    <main className="auth-page">
      <button className="auth-back" onClick={() => navigate('/')}>
        <ArrowLeft size={16} /> Back to home
      </button>

      <section className="auth-shell">
        <aside className="auth-story">
          <div className="auth-brand">
            <GitGraphMark />
            <div>
              <div className="auth-brand-name">GraphKeep</div>
              <div className="auth-brand-version">visual code intelligence</div>
            </div>
          </div>

          <div className="auth-story-copy">
            <div className="auth-kicker"><Sparkles size={14} /> Set up your organization</div>
            <h1>Bring your team<br />into <span>focus.</span></h1>
            <p>Create your organization, then connect GitHub whenever you're ready to start analyzing repositories.</p>
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
            <div className="auth-eyebrow">CREATE ACCOUNT</div>
            <h2>Set up your organization</h2>
            <p className="auth-subtitle">This creates your organization and its first admin account.</p>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <label className="auth-field">Organization name
              <input autoFocus value={organizationName} onChange={event => setOrganizationName(event.target.value)} placeholder="Acme Inc." />
            </label>
            <label className="auth-field">Username
              <input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="3-32 characters" />
            </label>
            <label className="auth-field">
              <span className="auth-field-row">Password<button type="button" className="auth-field-hint" onClick={fillGeneratedPassword}><Wand2 size={12} /> Generate</button></span>
              <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" />
            </label>
            <label className="auth-field">Confirm password
              <input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
            </label>

            <button className="auth-primary-button" type="submit" disabled={submitting || !organizationName || !username || !password}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>

            <div className="auth-new-user">
              <strong>Already have an account?</strong>
              <p><Link to="/login">Sign in instead</Link>.</p>
            </div>

            <div className="auth-security">
              <ShieldCheck size={16} />
              <span>Your password is hashed before it's stored. GitHub access is granted separately, after sign in.</span>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
