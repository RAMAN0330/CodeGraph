import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

interface WorkspaceHeaderProps {
  login: string;
  avatarUrl: string;
  repoUrl: string;
  onRepoUrlChange: (url: string) => void;
  onAnalyze: () => void;
  loading: boolean;
  hasData: boolean;
  dbSchemaDetected: boolean;
  onPRReview: () => void;
  onDbMap: () => void;
}

function parseRepo(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  const simple = url.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simple) return { owner: simple[1], repo: simple[2] };
  return null;
}

export default function WorkspaceHeader({
  login, avatarUrl, repoUrl, onRepoUrlChange, onAnalyze, loading, hasData, dbSchemaDetected, onPRReview, onDbMap,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();
  const parsed = parseRepo(repoUrl);

  async function handleSignOut() {
    try {
      await fetch(`${API}/auth/logout`, { credentials: 'include' });
    } catch {
      // best-effort logout; navigate away regardless
    }
    navigate('/');
  }

  return (
    <header style={{
      position: 'fixed',
      top: '10px', left: '60px', right: '10px',
      height: '46px',
      background: 'rgba(22,27,34,0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid #30363d',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '0 14px',
      zIndex: 1000,
      boxSizing: 'border-box',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    }}>
      {/* Left: Logo */}
      <button
        onClick={() => navigate('/select-repo')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px', flexShrink: 0 }}
      >
        <div style={{ width: '26px', height: '26px', background: '#238636', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="white">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </div>
        <span style={{ color: '#f0f6fc', fontWeight: 700, fontSize: '0.95rem' }}>CodeFlow</span>
      </button>

      {/* Divider */}
      <span style={{ color: '#30363d', fontSize: '1.2rem', flexShrink: 0 }}>|</span>

      {/* Center: Search bar */}
      <div style={{ flex: 1, maxWidth: '560px', position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', color: '#8b949e', pointerEvents: 'none' }} />
        <input
          value={repoUrl}
          onChange={e => onRepoUrlChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !loading) onAnalyze(); }}
          placeholder={parsed ? `${parsed.owner}/${parsed.repo}` : 'owner/repo or GitHub URL...'}
          style={{
            width: '100%',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '8px',
            padding: '7px 80px 7px 32px',
            color: '#f0f6fc',
            fontSize: '0.85rem',
            outline: 'none',
            fontFamily: 'monospace',
            boxSizing: 'border-box',
          }}
        />
        {repoUrl && !loading && (
          <button
            onClick={onAnalyze}
            style={{
              position: 'absolute', right: '6px',
              background: '#238636', border: 'none', borderRadius: '5px',
              color: 'white', padding: '4px 12px', fontSize: '0.78rem',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Analyze
          </button>
        )}
        {loading && (
          <span style={{ position: 'absolute', right: '10px', color: '#8b949e', fontSize: '0.78rem' }}>
            Loading…
          </span>
        )}
      </div>

      {/* Action buttons (only when data loaded) */}
      {hasData && (
        <>
          <button
            onClick={onPRReview}
            style={{ background: 'transparent', border: '1px solid #30363d', color: '#f0f6fc', padding: '5px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            PR Review
          </button>
          <button
            onClick={onDbMap}
            style={{ background: dbSchemaDetected ? '#1a2b1a' : 'transparent', border: `1px solid ${dbSchemaDetected ? '#238636' : '#30363d'}`, color: dbSchemaDetected ? '#3fb950' : '#f0f6fc', padding: '5px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            DB Map
          </button>
        </>
      )}

      {/* Right: User + sign out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto', flexShrink: 0 }}>
        {login && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={login} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid #30363d' }} />
              : <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#238636', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.75rem', fontWeight: 700 }}>{login[0]?.toUpperCase()}</div>
            }
            <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>{login}</span>
          </div>
        )}
        <button
          onClick={handleSignOut}
          style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', padding: '5px 10px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
