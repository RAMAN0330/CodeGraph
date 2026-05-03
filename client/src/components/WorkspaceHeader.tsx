import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

interface WorkspaceHeaderProps {
  login: string;
  avatarUrl: string;
  repoInfo: { owner: string; repo: string; name?: string } | null;
  loading: boolean;
  hasData: boolean;
  dbSchemaDetected: boolean;
  onPRReview: () => void;
  onDbMap: () => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onPaletteOpen: () => void;
  onExport?: () => void;
  onGoHome?: () => void;
  currentBranch?: string;
  branches?: { name: string }[];
  branchLoading?: boolean;
  onBranchSwitch?: (branch: string) => void;
}

const NAV_TABS = [
  { id: 'explorer',     label: 'Explorer',     icon: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 5h2m4 0h-2m-2-2v2m0 4v-2' },
  { id: 'architecture', label: 'Architecture', icon: 'M3 5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm10 0a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2zm-5 9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2zm-1-5v3m8-3v3m-4 0v3' },
  { id: 'branches',     label: 'Branches',     icon: 'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm12 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0-3a9 9 0 0 0 9 9m0-15v3m0 0a6 6 0 0 1-6 6H6' },
  { id: 'contributors', label: 'People',       icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { id: 'commits',      label: 'Commits',      icon: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z' },
{ id: 'database',     label: 'Database',     icon: 'M12 2C6.48 2 2 4.24 2 7s4.48 5 10 5 10-2.24 10-5-4.48-5-10-5zM2 17c0 2.76 4.48 5 10 5s10-2.24 10-5M2 12c0 2.76 4.48 5 10 5s10-2.24 10-5' },
  { id: 'migrations',   label: 'Migrations',   icon: 'M5 12h14M12 5l7 7-7 7' },
  { id: 'security',     label: 'Security',     icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'radar',        label: 'Radar',        icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5v5l4 2' },
  { id: 'ownership',    label: 'Ownership',    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { id: 'releases',     label: 'Releases',     icon: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' },
  { id: 'debt',         label: 'Tech Debt',    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { id: 'trends',       label: 'Trends',       icon: 'M3 3v18h18M7 16l4-4 4 4 4-8' },
  { id: 'settings',     label: 'Settings',     icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' },
];

const REQUIRES_DATA = new Set(['architecture','branches','contributors','commits','database','migrations','security','radar','ownership','releases','debt','trends']);

function TabIcon({ d }: { d: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

function BranchPicker({ current, branches, loading, onSwitch }: {
  current: string;
  branches: { name: string }[];
  loading: boolean;
  onSwitch: (b: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = branches.filter(b => b.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: open ? '#1c2128' : '#161b22',
          border: `1px solid ${open ? '#388bfd' : '#30363d'}`,
          borderRadius: '7px', color: '#c9d1d9',
          padding: '4px 9px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '0.73rem', fontFamily: 'monospace',
          maxWidth: '130px', transition: 'all 0.12s', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!open) { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#58a6ff'; el.style.color = '#f0f6fc'; }}}
        onMouseLeave={e => { if (!open) { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#c9d1d9'; }}}
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}>
          <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{loading ? '…' : (current || 'main')}</span>
        <svg width="8" height="8" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0, opacity: 0.45, marginLeft: '1px' }}>
          <path d="M1 1l4 4 4-4"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: '210px', maxWidth: '290px',
          background: '#161b22', border: '1px solid #30363d',
          borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 2000, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px', borderBottom: '1px solid #21262d' }}>
            <input
              autoFocus value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="Filter branches…"
              style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', padding: '5px 9px', color: '#f0f6fc', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#388bfd'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#30363d'; }}
            />
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {filtered.length === 0
              ? <div style={{ padding: '12px', color: '#484f58', fontSize: '0.75rem', textAlign: 'center' }}>No branches found</div>
              : filtered.map(b => {
                  const active = b.name === current;
                  return (
                    <button key={b.name} onClick={() => { onSwitch(b.name); setOpen(false); setFilter(''); }}
                      style={{ width: '100%', background: active ? 'rgba(56,139,253,0.1)' : 'transparent', border: 'none', borderBottom: '1px solid #21262d', color: active ? '#58a6ff' : '#c9d1d9', padding: '8px 12px', fontSize: '0.75rem', fontFamily: 'monospace', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px' }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      {active
                        ? <svg width="10" height="10" viewBox="0 0 16 16" fill="#58a6ff"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
                        : <span style={{ width: 10 }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                    </button>
                  );
                })
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceHeader({
  login, avatarUrl, repoInfo, loading, hasData,
  dbSchemaDetected, onPRReview, onDbMap, activeSection, onSectionChange, onPaletteOpen, onExport, onGoHome,
  currentBranch, branches, branchLoading, onBranchSwitch,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();

  function handleSignOut() {
    window.location.href = `${API}/auth/logout`;
  }

  return (
    <header style={{
      position: 'fixed',
      top: '10px', left: '10px', right: '10px',
      height: '46px',
      background: 'rgba(13,17,23,0.97)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid #21262d',
      borderRadius: '14px',
      zIndex: 1000,
      boxSizing: 'border-box',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '0 10px',
      overflow: 'visible',
    }}>

      {/* Logo — click goes back to repo select */}
      <button
        onClick={onGoHome || (() => navigate('/select-repo'))}
        title="Back to repo select"
        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 6px', borderRadius: '8px', flexShrink: 0, transition: 'background 0.12s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
      >
        <div style={{
          width: '24px', height: '24px',
          background: 'linear-gradient(135deg, #238636, #2ea043)',
          borderRadius: '6px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 6px rgba(35,134,54,0.4)',
          flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="white">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
        </div>
        <span style={{ color: '#f0f6fc', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '-0.02em', flexShrink: 0 }}>CodeFlow</span>
      </button>

      {/* Repo identity pill */}
      {repoInfo && (
        <>
          <div style={{ width: '1px', height: '18px', background: '#21262d', flexShrink: 0 }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: '8px', padding: '3px 10px', flexShrink: 0,
            maxWidth: '200px',
          }}>
            <span style={{ color: '#8b949e', fontSize: '0.73rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'monospace' }}>
              <span style={{ color: '#6e7681' }}>{repoInfo.owner}/</span>
              <span style={{ color: '#e6edf3', fontWeight: 600 }}>{repoInfo.repo}</span>
            </span>
            {loading && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#8b949e', fontSize: '0.68rem', flexShrink: 0 }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#388bfd', animation: 'hdr-pulse 1.2s ease-in-out infinite' }} />
              </span>
            )}
          </div>
        </>
      )}

      {loading && !repoInfo && (
        <>
          <div style={{ width: '1px', height: '18px', background: '#21262d', flexShrink: 0 }} />
          <span style={{ color: '#8b949e', fontSize: '0.73rem', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#388bfd', animation: 'hdr-pulse 1.2s ease-in-out infinite' }} />
            Analyzing…
          </span>
        </>
      )}

      <div style={{ width: '1px', height: '18px', background: '#21262d', flexShrink: 0 }} />

      {/* Nav tabs — fills remaining space, scrollable */}
      <nav style={{
        display: 'flex', alignItems: 'stretch',
        flex: 1, minWidth: 0,
        overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',
        height: '100%',
      }}>
        {NAV_TABS.map(tab => {
          const active = activeSection === tab.id;
          const disabled = REQUIRES_DATA.has(tab.id) && !hasData;
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && onSectionChange(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #388bfd' : '2px solid transparent',
                color: active ? '#f0f6fc' : disabled ? '#2d333b' : '#6e7681',
                padding: '0 8px',
                fontSize: '0.73rem',
                fontWeight: active ? 600 : 400,
                cursor: disabled ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '4px',
                flexShrink: 0,
                transition: 'color 0.12s',
                marginBottom: '-1px',
              }}
              onMouseEnter={e => { if (!disabled && !active) (e.currentTarget as HTMLElement).style.color = '#e6edf3'; }}
              onMouseLeave={e => { if (!disabled && !active) (e.currentTarget as HTMLElement).style.color = '#6e7681'; }}
            >
              <TabIcon d={tab.icon} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div style={{ width: '1px', height: '18px', background: '#21262d', flexShrink: 0 }} />

      {/* Branch picker */}
      {hasData && onBranchSwitch && (
        <BranchPicker
          current={currentBranch || 'main'}
          branches={branches || []}
          loading={!!branchLoading}
          onSwitch={onBranchSwitch}
        />
      )}

      {/* ⌘K */}
      <button
        onClick={onPaletteOpen}
        title="Command palette (Ctrl+K)"
        style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '7px', color: '#6e7681', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', flexShrink: 0, transition: 'all 0.12s' }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#58a6ff'; el.style.color = '#f0f6fc'; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#6e7681'; }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <kbd style={{ fontSize: '0.6rem', color: '#484f58', fontFamily: 'inherit' }}>⌘K</kbd>
      </button>

      {/* Action buttons */}
      {hasData && (
        <>
          <div style={{ width: '1px', height: '18px', background: '#21262d', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
            <button onClick={onPRReview}
              style={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', padding: '4px 9px', borderRadius: '7px', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.12s' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#388bfd'; el.style.color = '#f0f6fc'; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#c9d1d9'; }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              PR Review
            </button>
            <button onClick={onDbMap}
              style={{ background: dbSchemaDetected ? 'rgba(35,134,54,0.12)' : '#161b22', border: `1px solid ${dbSchemaDetected ? '#238636' : '#30363d'}`, color: dbSchemaDetected ? '#3fb950' : '#c9d1d9', padding: '4px 9px', borderRadius: '7px', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.12s' }}
              onMouseEnter={e => { if (!dbSchemaDetected) { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#238636'; el.style.color = '#3fb950'; }}}
              onMouseLeave={e => { if (!dbSchemaDetected) { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#c9d1d9'; }}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              DB Map
              {dbSchemaDetected && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3fb950', boxShadow: '0 0 5px #3fb950' }} />}
            </button>
            {onExport && (
              <button onClick={onExport}
                style={{ background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', padding: '4px 9px', borderRadius: '7px', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.12s' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#e3b341'; el.style.color = '#f0f6fc'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#c9d1d9'; }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ width: '1px', height: '18px', background: '#21262d', flexShrink: 0 }} />

      {/* User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
        {login && (
          <>
            {avatarUrl
              ? <img src={avatarUrl} alt={login} style={{ width: '22px', height: '22px', borderRadius: '50%', border: '2px solid #30363d' }} />
              : <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'linear-gradient(135deg,#238636,#388bfd)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.65rem', fontWeight: 700 }}>{login[0]?.toUpperCase()}</div>
            }
          </>
        )}
        <button onClick={handleSignOut}
          style={{ background: 'transparent', border: '1px solid #30363d', color: '#6e7681', padding: '3px 8px', borderRadius: '7px', fontSize: '0.7rem', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#f85149'; el.style.color = '#f85149'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = '#30363d'; el.style.color = '#6e7681'; }}>
          ↩
        </button>
      </div>

      <style>{`@keyframes hdr-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </header>
  );
}
