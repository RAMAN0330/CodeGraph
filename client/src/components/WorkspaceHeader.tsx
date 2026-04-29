import { useNavigate } from 'react-router-dom';

interface WorkspaceHeaderProps {
  login: string;
  avatarUrl: string;
  repoUrl: string;
}

function parseRepo(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  const simple = url.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simple) return { owner: simple[1], repo: simple[2] };
  return null;
}

export default function WorkspaceHeader({ login, avatarUrl, repoUrl }: WorkspaceHeaderProps) {
  const navigate = useNavigate();
  const parsed = parseRepo(repoUrl);

  async function handleSignOut() {
    await fetch('http://localhost:5000/auth/logout', { credentials: 'include' });
    navigate('/');
  }

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: '56px',
      background: '#0d1117',
      borderBottom: '1px solid #30363d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      zIndex: 1000,
      boxSizing: 'border-box',
    }}>
      {/* Left: Logo */}
      <button
        onClick={() => navigate('/')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0 }}
      >
        <div style={{ width: '28px', height: '28px', background: '#238636', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </div>
        <span style={{ color: '#f0f6fc', fontWeight: 700, fontSize: '1rem' }}>CodeFlow</span>
      </button>

      {/* Center: Repo breadcrumb */}
      <div style={{ color: '#8b949e', fontSize: '0.875rem', fontFamily: 'monospace' }}>
        {parsed ? (
          <>
            <span style={{ color: '#8b949e' }}>{parsed.owner}</span>
            <span style={{ color: '#30363d', margin: '0 6px' }}>/</span>
            <span style={{ color: '#f0f6fc', fontWeight: 600 }}>{parsed.repo}</span>
          </>
        ) : (
          <span>No repository loaded</span>
        )}
      </div>

      {/* Right: User + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => navigate('/db')}
          style={{
            background: 'transparent',
            border: '1px solid #30363d',
            color: '#f0f6fc',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          DB Visualizer
        </button>

        {login && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {avatarUrl && (
              <img
                src={avatarUrl}
                alt={login}
                style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #30363d' }}
              />
            )}
            <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>{login}</span>
          </div>
        )}

        <button
          onClick={handleSignOut}
          style={{
            background: '#21262d',
            border: '1px solid #30363d',
            color: '#f0f6fc',
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
