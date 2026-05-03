import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import BookmarkDropdown from './BookmarkDropdown';

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
  activeSection: string;
  onSectionChange: (section: string) => void;
  onBookmarkSelect: (url: string) => void;
  onPaletteOpen: () => void;
  onExport?: () => void;
}

const NAV_TABS = [
  { id: 'explorer',     label: 'Explorer',      icon: 'M3 3h18v18H3V3zm4 4v10h10V7H7zm2 2h6v6H9V9z' },
  { id: 'branches',     label: 'Branches',      icon: 'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm12 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0-3a9 9 0 0 0 9 9m0-15v3m0 0a6 6 0 0 1-6 6H6' },
  { id: 'contributors', label: 'Contributors',  icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'commits',      label: 'Commits',       icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v7l4 2' },
  { id: 'pullrequests', label: 'PRs',           icon: 'M18 15l-6-6-6 6' },
  { id: 'database',     label: 'Database',      icon: 'M12 2C6.48 2 2 4.24 2 7s4.48 5 10 5 10-2.24 10-5-4.48-5-10-5zM2 17c0 2.76 4.48 5 10 5s10-2.24 10-5M2 12c0 2.76 4.48 5 10 5s10-2.24 10-5' },
  { id: 'migrations',   label: 'Migrations',    icon: 'M5 12h14M12 5l7 7-7 7' },
  { id: 'security',     label: 'Security',      icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'radar',        label: 'Stale Radar',   icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v5l4 2' },
  { id: 'ownership',    label: 'Ownership',     icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'releases',     label: 'Releases',      icon: 'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22' },
  { id: 'debt',         label: 'Tech Debt',     icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { id: 'trends',       label: 'Trends',        icon: 'M3 3v18h18M7 16l4-4 4 4 4-8' },
  { id: 'settings',     label: 'Settings',      icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm6.93-3a7.001 7.001 0 0 0-.14-1.36l2.96-2.3-3-5.2-3.46 1.32a7 7 0 0 0-2.36-1.36L12.74 1h-6l-.52 3.1A7 7 0 0 0 3.86 5.46L.4 4.14l-3 5.2 2.96 2.3A7.001 7.001 0 0 0 .22 13H0' },
];

function parseRepo(url: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
  const simple = url.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simple) return { owner: simple[1], repo: simple[2] };
  return null;
}

function TabIcon({ d }: { d: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

export default function WorkspaceHeader({
  login, avatarUrl, repoUrl, onRepoUrlChange, onAnalyze, loading, hasData,
  dbSchemaDetected, onPRReview, onDbMap, activeSection, onSectionChange, onBookmarkSelect, onPaletteOpen, onExport,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();
  const parsed = parseRepo(repoUrl);

  async function handleSignOut() {
    try {
      await fetch(`${API}/auth/logout`, { credentials: 'include' });
    } catch {}
    navigate('/');
  }

  return (
    <header style={{
      position: 'fixed',
      top: '10px', left: '10px', right: '10px',
      background: 'rgba(13,17,23,0.96)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid #21262d',
      borderRadius: '14px',
      zIndex: 1000,
      boxSizing: 'border-box',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
      overflow: 'hidden',
    }}>

      {/* Top row: logo + search + actions + user */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 14px',
        height: '46px',
        borderBottom: '1px solid #21262d',
      }}>

        {/* Logo */}
        <button
          onClick={() => navigate('/select-repo')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '0', flexShrink: 0 }}
        >
          <div style={{
            width: '26px', height: '26px',
            background: 'linear-gradient(135deg, #238636, #2ea043)',
            borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(35,134,54,0.4)',
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="white">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </div>
          <span style={{ color: '#f0f6fc', fontWeight: 700, fontSize: '0.88rem', letterSpacing: '-0.02em', flexShrink: 0 }}>
            CodeFlow
          </span>
        </button>

        <div style={{ width: '1px', height: '20px', background: '#21262d', flexShrink: 0 }} />

        {/* Repo search */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: '480px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BookmarkDropdown onSelect={onBookmarkSelect} />
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', color: '#484f58', pointerEvents: 'none' }} />
            <input
              value={repoUrl}
              onChange={e => onRepoUrlChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading) onAnalyze(); }}
              placeholder={parsed ? `${parsed.owner}/${parsed.repo}` : 'owner/repo or GitHub URL…'}
              style={{
                width: '100%',
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '8px',
                padding: '5px 76px 5px 32px',
                color: '#f0f6fc',
                fontSize: '0.8rem',
                outline: 'none',
                fontFamily: 'monospace',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#388bfd'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#30363d'; }}
            />
            {repoUrl && !loading && (
              <button
                onClick={onAnalyze}
                style={{
                  position: 'absolute', right: '5px',
                  background: 'linear-gradient(135deg, #238636, #2ea043)',
                  border: 'none', borderRadius: '5px',
                  color: 'white', padding: '3px 10px',
                  fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                  letterSpacing: '0.02em',
                }}
              >
                Analyze
              </button>
            )}
            {loading && (
              <span style={{ position: 'absolute', right: '10px', color: '#8b949e', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#388bfd', animation: 'pulse 1s ease-in-out infinite' }} />
                Loading
              </span>
            )}
          </div>
        </div>

        {/* Ctrl+K */}
        <button
          onClick={onPaletteOpen}
          title="Command palette (Ctrl+K)"
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '7px',
            color: '#8b949e',
            padding: '4px 9px',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '0.72rem', flexShrink: 0,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#58a6ff'; el.style.color = '#f0f6fc'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#8b949e'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <kbd style={{ fontSize: '0.62rem', color: '#484f58', fontFamily: 'inherit' }}>⌘K</kbd>
        </button>

        <div style={{ width: '1px', height: '20px', background: '#21262d', flexShrink: 0 }} />

        {/* Action buttons — only when data loaded */}
        {hasData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={onPRReview}
              style={{
                background: '#161b22', border: '1px solid #30363d',
                color: '#c9d1d9', padding: '4px 10px', borderRadius: '7px',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '5px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#388bfd'; el.style.color = '#f0f6fc'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#c9d1d9'; }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              PR Review
            </button>
            <button
              onClick={onDbMap}
              style={{
                background: dbSchemaDetected ? 'rgba(35,134,54,0.12)' : '#161b22',
                border: `1px solid ${dbSchemaDetected ? '#238636' : '#30363d'}`,
                color: dbSchemaDetected ? '#3fb950' : '#c9d1d9',
                padding: '4px 10px', borderRadius: '7px',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '5px',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!dbSchemaDetected) { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#238636'; el.style.color = '#3fb950'; }}}
              onMouseLeave={e => { if (!dbSchemaDetected) { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#c9d1d9'; }}}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              DB Map
              {dbSchemaDetected && (
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3fb950', boxShadow: '0 0 4px #3fb950' }} />
              )}
            </button>
            {onExport && (
              <button
                onClick={onExport}
                style={{
                  background: '#161b22', border: '1px solid #30363d',
                  color: '#c9d1d9', padding: '4px 10px', borderRadius: '7px',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#e3b341'; el.style.color = '#f0f6fc'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#c9d1d9'; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
            )}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {login && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              {avatarUrl
                ? <img src={avatarUrl} alt={login} style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #30363d' }} />
                : (
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, #238636, #388bfd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.7rem', fontWeight: 700 }}>
                    {login[0]?.toUpperCase()}
                  </div>
                )
              }
              <span style={{ color: '#8b949e', fontSize: '0.8rem', fontWeight: 500 }}>{login}</span>
            </div>
          )}
          <button
            onClick={handleSignOut}
            style={{
              background: 'transparent', border: '1px solid #30363d',
              color: '#8b949e', padding: '4px 9px', borderRadius: '7px',
              fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#f85149'; el.style.color = '#f85149'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#8b949e'; }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Bottom row: nav tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '0',
        padding: '0 10px',
        height: '34px',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}>
        {NAV_TABS.map(tab => {
          const active = activeSection === tab.id;
          const requiresData = ['branches','contributors','commits','pullrequests','database','migrations','security','radar','ownership','releases','debt','trends'].includes(tab.id);
          const disabled = requiresData && !hasData;
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && onSectionChange(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #388bfd' : '2px solid transparent',
                color: active ? '#f0f6fc' : disabled ? '#30363d' : '#8b949e',
                padding: '0 11px',
                fontSize: '0.75rem',
                fontWeight: active ? 600 : 400,
                cursor: disabled ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                flexShrink: 0,
                transition: 'color 0.15s, border-color 0.15s',
                marginBottom: '-1px',
              }}
              onMouseEnter={e => { if (!disabled && !active) (e.currentTarget as HTMLElement).style.color = '#e6edf3'; }}
              onMouseLeave={e => { if (!disabled && !active) (e.currentTarget as HTMLElement).style.color = '#8b949e'; }}
            >
              <TabIcon d={tab.icon} />
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
