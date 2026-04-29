import { useNavigate } from 'react-router-dom';
import { Database, GitBranch, Shield, Zap, GitMerge, Eye } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export default function LandingPage() {
  const navigate = useNavigate();

  const handleAuth = () => {
    window.location.href = `${API}/auth/github`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0f6fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #30363d', padding: '0 48px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(8px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', background: '#238636', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>CodeFlow</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(['Features', 'Docs', 'Security'] as const).map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{ color: '#8b949e', fontSize: '0.875rem', textDecoration: 'none', padding: '6px 12px', borderRadius: '6px', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f0f6fc')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8b949e')}>
              {item}
            </a>
          ))}
          <button onClick={handleAuth} style={{ background: '#238636', border: '1px solid #2ea043', color: 'white', padding: '7px 16px', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            Sign in with GitHub
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: '960px', margin: '0 auto', padding: '96px 24px 80px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#161b22', border: '1px solid #30363d', borderRadius: '20px', padding: '5px 14px', fontSize: '0.8rem', color: '#8b949e', marginBottom: '32px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#238636', display: 'inline-block' }} />
          Open source · Built for developers
        </div>
        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-0.03em', color: '#f0f6fc' }}>
          A Git UI built for<br />
          <span style={{ color: '#58a6ff' }}>deep code intelligence</span>
        </h1>
        <p style={{ fontSize: '1.125rem', color: '#8b949e', maxWidth: '600px', margin: '0 auto 40px', lineHeight: 1.7 }}>
          Visualize repository architecture, explore database schemas, review branches, and scan for security issues — all in one place.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleAuth} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#238636', border: '1px solid #2ea043', color: 'white', padding: '12px 24px', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Sign in with GitHub
          </button>
          <button onClick={() => navigate('/db')} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: '1px solid #30363d', color: '#f0f6fc', padding: '12px 24px', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#58a6ff')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#30363d')}>
            <Database size={18} />
            Database Visualizer
          </button>
        </div>
      </section>

      {/* Stats */}
      <section style={{ borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d', background: '#161b22' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', textAlign: 'center' }}>
          {[{ v: '1M+', l: 'Files handled' }, { v: '250ms', l: 'Analysis speed' }, { v: '10k+', l: 'Files at 60fps' }, { v: '12', l: 'Frameworks' }].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f0f6fc', marginBottom: '4px' }}>{s.v}</div>
              <div style={{ fontSize: '0.8rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ maxWidth: '960px', margin: '0 auto', padding: '80px 24px' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '48px', textAlign: 'center', color: '#f0f6fc' }}>Everything you need to understand your codebase</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[
            { icon: <GitBranch size={20} />, title: 'Branch Diff & Merge', desc: 'Compare branches, stage files, and resolve conflicts with a visual diff editor.', color: '#58a6ff' },
            { icon: <Database size={20} />, title: 'DB Schema Visualizer', desc: 'Auto-detect Django, SQLAlchemy, and Prisma schemas into interactive ER diagrams.', color: '#3fb950' },
            { icon: <Shield size={20} />, title: 'Security Intelligence', desc: 'Scan for secrets, vulnerable patterns, and security regressions before they ship.', color: '#f0883e' },
            { icon: <Zap size={20} />, title: 'Ghost File System', desc: 'Virtualized tree renders 10,000+ files at 60fps with zero main-thread lag.', color: '#d2a8ff' },
            { icon: <GitMerge size={20} />, title: 'Migration Maker', desc: 'Generate Django migrations from detected schema changes using AST introspection.', color: '#ffa657' },
            { icon: <Eye size={20} />, title: 'Code Ownership', desc: 'Identify who owns what — blast radius, PR risk, and suggested reviewers.', color: '#79c0ff' },
          ].map(f => (
            <div key={f.title} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '10px', padding: '24px', transition: 'border-color 0.15s', cursor: 'default' }}
              onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = f.color)}
              onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = '#30363d')}>
              <div style={{ color: f.color, marginBottom: '12px' }}>{f.icon}</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px', color: '#f0f6fc', margin: '0 0 8px' }}>{f.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security section */}
      <section id="security" style={{ background: '#161b22', borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '64px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '48px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Shield size={20} style={{ color: '#f0883e' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f0883e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Security</span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '16px', color: '#f0f6fc', margin: '0 0 16px' }}>Built with security in mind</h2>
            <p style={{ color: '#8b949e', lineHeight: 1.7, margin: 0 }}>Your GitHub token stays server-side in an encrypted session. We never store credentials or repo contents — analysis runs in memory and is discarded when your session ends.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '240px' }}>
            {['OAuth 2.0 — token never exposed to browser', 'Server-side sessions with 24h expiry', 'No repo content stored on disk', 'Analysis runs in isolated worker'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', color: '#8b949e' }}>
                <span style={{ color: '#3fb950', flexShrink: 0 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: '640px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '16px', color: '#f0f6fc', margin: '0 0 16px' }}>Ready to explore your codebase?</h2>
        <p style={{ color: '#8b949e', marginBottom: '32px' }}>Sign in with GitHub and start analyzing any repository in seconds.</p>
        <button onClick={handleAuth} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#238636', border: '1px solid #2ea043', color: 'white', padding: '12px 28px', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          Get started free
        </button>
      </section>

      {/* Footer */}
      <footer id="docs" style={{ borderTop: '1px solid #30363d', padding: '32px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '24px', height: '24px', background: '#238636', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>CodeFlow</span>
        </div>
        <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>© 2026 CodeFlow · Built for developers</span>
      </footer>
    </div>
  );
}
