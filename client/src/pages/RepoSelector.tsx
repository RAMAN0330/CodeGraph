import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, GitFork, Lock, Globe, Clock, Code, LogOut, List, LayoutGrid, GitBranch, GitCommit } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

interface Repo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  updated_at: string;
  default_branch: string;
}

interface AuthUser {
  login: string;
  avatar_url: string;
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF',
  CSS: '#563d7c', HTML: '#e34c26', Shell: '#89e051',
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return 'unknown';
  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) return 'unknown';
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Fake commit messages for right-panel preview
const FAKE_COMMITS = [
  { hash: 'a3f2c1d', msg: 'chore: update dependencies', time: '2h ago' },
  { hash: 'b9e8f07', msg: 'fix: resolve type errors in core module', time: '1d ago' },
  { hash: 'c4d5e6a', msg: 'feat: add pagination support', time: '3d ago' },
];

export default function RepoSelector() {
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [visFilter, setVisFilter] = useState<'all' | 'public' | 'private'>('all');
  const [activeRepo, setActiveRepo] = useState<Repo | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/auth/me`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/github/repos`, { credentials: 'include' }).then(r => r.ok ? r.json() : { repos: [] }),
    ]).then(([me, data]) => {
      if (!me) { navigate('/'); return; }
      setUser(me);
      setRepos(data.repos || []);
      setLoading(false);
    }).catch(() => navigate('/'));
  }, [navigate]);

  function handleSignOut() {
    window.location.href = `${API}/auth/logout`;
  }

  function openRepo(repo: Repo) {
    navigate(`/workspace?repo=${repo.full_name}&run=1`);
  }

  const languages = useMemo(
    () => ['all', ...Array.from(new Set(repos.map(r => r.language).filter(Boolean))) as string[]].sort((a, b) => a === 'all' ? -1 : a.localeCompare(b)),
    [repos]
  );

  const filtered = useMemo(() => repos.filter(r => {
    if (visFilter !== 'all' && (visFilter === 'private') !== r.private) return false;
    if (langFilter !== 'all' && r.language !== langFilter) return false;
    if (search && !r.full_name.toLowerCase().includes(search.toLowerCase()) && !(r.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [repos, visFilter, langFilter, search]);

  // ─── colour tokens ────────────────────────────────────────────────────────
  const C = {
    bg:       '#07090c',
    bg1:      '#0b0e13',
    bg2:      '#10141b',
    panel:    '#0d1117',
    line:     'rgba(255,255,255,0.06)',
    lineStr:  'rgba(255,255,255,0.12)',
    fg:       '#e6edf3',
    fg2:      '#b1bac4',
    fg3:      '#7d8590',
    fg4:      '#4b5563',
    accent:   '#3fb950',
    info:     '#58a6ff',
    mono:     "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  };

  // ─── pill button style ────────────────────────────────────────────────────
  const pill = (active: boolean) => ({
    padding: '4px 12px',
    borderRadius: '20px',
    border: `1px solid ${active ? C.accent : C.line}`,
    background: active ? 'rgba(63,185,80,0.12)' : 'transparent',
    color: active ? C.accent : C.fg3,
    fontSize: '0.78rem',
    fontFamily: C.mono,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  });

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.fg, fontFamily: C.mono, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'rgba(7,9,12,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.line}`,
        padding: '0 24px',
        height: '52px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '16px',
      }}>
        {/* Left: brand + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          {/* Brand mark */}
          <div style={{
            width: '28px', height: '28px',
            background: 'rgba(63,185,80,0.15)',
            border: `1px solid ${C.accent}`,
            borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill={C.accent}>
              <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM4.25 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z"/>
            </svg>
          </div>
          <span style={{ fontFamily: C.mono, fontSize: '0.82rem', color: C.fg3 }}>
            gitgraph<span style={{ color: C.fg4 }}>/</span><span style={{ color: C.accent }}>0.4.2</span>
          </span>
          <span style={{ color: C.fg4, fontSize: '0.82rem' }}>›</span>
          <span style={{ fontFamily: C.mono, fontSize: '0.82rem', color: C.fg3 }}>workspace</span>
          <span style={{ color: C.fg4, fontSize: '0.82rem' }}>›</span>
          <span style={{ fontFamily: C.mono, fontSize: '0.82rem', color: C.fg2 }}>select-repo</span>
        </div>

        {/* Right: kbd hint + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.5 }}>
            <kbd style={{ fontFamily: C.mono, fontSize: '0.72rem', background: C.bg2, border: `1px solid ${C.lineStr}`, borderRadius: '4px', padding: '1px 6px', color: C.fg3 }}>⌘</kbd>
            <kbd style={{ fontFamily: C.mono, fontSize: '0.72rem', background: C.bg2, border: `1px solid ${C.lineStr}`, borderRadius: '4px', padding: '1px 6px', color: C.fg3 }}>K</kbd>
            <span style={{ fontSize: '0.75rem', color: C.fg4, marginLeft: '2px' }}>quick search</span>
          </div>
          {user && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src={user.avatar_url} alt={user.login} style={{ width: '24px', height: '24px', borderRadius: '50%', border: `1px solid ${C.lineStr}` }} />
                <span style={{ fontFamily: C.mono, fontSize: '0.8rem', color: C.fg2 }}>{user.login}</span>
              </div>
              <button
                onClick={handleSignOut}
                style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.fg3, padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: C.mono, transition: 'border-color 0.15s, color 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.lineStr; (e.currentTarget as HTMLButtonElement).style.color = C.fg2; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.line; (e.currentTarget as HTMLButtonElement).style.color = C.fg3; }}
              >
                <LogOut size={12} /> sign_out
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 52px)' }}>

        {/* ── Left panel ── */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.line}` }}>

          {/* Panel header */}
          <div style={{ padding: '28px 28px 20px', borderBottom: `1px solid ${C.line}`, background: C.panel }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
              <h1 style={{ margin: 0, fontFamily: C.mono, fontSize: '1.15rem', fontWeight: 600, color: C.fg, letterSpacing: '-0.3px' }}>
                <span style={{ color: C.accent }}>›</span> select_repository
                <span style={{
                  display: 'inline-block',
                  width: '2px', height: '1.1em',
                  background: C.accent,
                  marginLeft: '4px',
                  verticalAlign: 'text-bottom',
                  animation: 'gg-blink 1s step-end infinite',
                }} />
              </h1>
              {/* List / card toggle */}
              <div style={{ display: 'flex', gap: '4px', background: C.bg2, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '3px' }}>
                <button
                  onClick={() => setViewMode('list')}
                  title="List view"
                  style={{ background: viewMode === 'list' ? C.bg1 : 'transparent', border: `1px solid ${viewMode === 'list' ? C.lineStr : 'transparent'}`, borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: viewMode === 'list' ? C.fg2 : C.fg4, display: 'flex', alignItems: 'center' }}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  title="Card view"
                  style={{ background: viewMode === 'card' ? C.bg1 : 'transparent', border: `1px solid ${viewMode === 'card' ? C.lineStr : 'transparent'}`, borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: viewMode === 'card' ? C.fg2 : C.fg4, display: 'flex', alignItems: 'center' }}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
            <p style={{ margin: 0, fontFamily: C.mono, fontSize: '0.78rem', color: C.fg4 }}>
              {loading ? 'loading...' : `${filtered.length} of ${repos.length} repos`}
            </p>
          </div>

          {/* Search bar */}
          <div style={{ padding: '16px 28px', borderBottom: `1px solid ${C.line}`, background: C.panel }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: C.bg1, border: `1px solid ${C.lineStr}`, borderRadius: '8px', padding: '8px 14px' }}>
              <span style={{ color: C.accent, fontFamily: C.mono, fontSize: '0.9rem', fontWeight: 700, flexShrink: 0 }}>›</span>
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }}
                placeholder="filter repos..."
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.fg, fontFamily: C.mono, fontSize: '0.85rem', caretColor: C.accent }}
              />
              <div style={{ display: 'flex', gap: '4px', opacity: 0.45 }}>
                {['↑','↓','↵','esc'].map(k => (
                  <kbd key={k} style={{ fontFamily: C.mono, fontSize: '0.68rem', background: C.bg2, border: `1px solid ${C.lineStr}`, borderRadius: '3px', padding: '1px 5px', color: C.fg3 }}>{k}</kbd>
                ))}
              </div>
            </div>
          </div>

          {/* Filter row */}
          <div style={{ padding: '12px 28px', borderBottom: `1px solid ${C.line}`, background: C.panel, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Visibility pills */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', 'public', 'private'] as const).map(v => (
                <button key={v} onClick={() => setVisFilter(v)} style={pill(visFilter === v)}>{v}</button>
              ))}
            </div>
            <div style={{ width: '1px', height: '18px', background: C.line, margin: '0 4px' }} />
            {/* Language pills (show first 8 to avoid overflow) */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {languages.slice(0, 9).map(l => (
                <button key={l} onClick={() => setLangFilter(l)} style={pill(langFilter === l)}>
                  {l !== 'all' && (
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: LANG_COLORS[l] ?? C.fg4, marginRight: '5px', verticalAlign: 'middle' }} />
                  )}
                  {l === 'all' ? 'all langs' : l}
                </button>
              ))}
            </div>
          </div>

          {/* Repo list / grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'card' ? '20px 28px' : '0', background: C.bg }}>
            {/* Loading skeletons */}
            {loading && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '14px', padding: '20px 28px' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{
                    background: C.bg1, border: `1px solid ${C.line}`, borderRadius: '10px',
                    height: '130px',
                    animation: 'gg-pulse 1.6s ease-in-out infinite',
                    opacity: 0.55,
                  }} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '12px', color: C.fg4 }}>
                <Code size={38} style={{ opacity: 0.3 }} />
                <p style={{ margin: 0, fontFamily: C.mono, fontSize: '0.85rem' }}>no repos match filters</p>
              </div>
            )}

            {/* LIST MODE */}
            {!loading && filtered.length > 0 && viewMode === 'list' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                    {['', 'name', 'description', 'language', 'branch', 'stars', 'updated'].map((h, i) => (
                      <th key={i} style={{ padding: i === 0 ? '8px 12px 8px 20px' : '8px 12px', textAlign: 'left', fontFamily: C.mono, fontSize: '0.7rem', color: C.fg4, fontWeight: 400, whiteSpace: 'nowrap', background: C.panel }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(repo => (
                    <tr
                      key={repo.id}
                      onClick={() => openRepo(repo)}
                      onMouseEnter={() => setActiveRepo(repo)}
                      style={{ borderBottom: `1px solid ${C.line}`, cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseOver={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(63,185,80,0.04)'}
                      onMouseOut={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      {/* vis icon */}
                      <td style={{ padding: '10px 8px 10px 20px', width: '20px' }}>
                        {repo.private
                          ? <Lock size={12} style={{ color: C.fg4 }} />
                          : <Globe size={12} style={{ color: C.fg4, opacity: 0.5 }} />}
                      </td>
                      {/* name */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                        <span style={{ fontFamily: C.mono, fontSize: '0.83rem', color: C.info, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{repo.name}</span>
                      </td>
                      {/* description */}
                      <td style={{ padding: '10px 12px', maxWidth: '300px' }}>
                        <span style={{ fontSize: '0.8rem', color: C.fg3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                          {repo.description || '—'}
                        </span>
                      </td>
                      {/* language */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', width: '100px' }}>
                        {repo.language ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', color: C.fg3 }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: LANG_COLORS[repo.language] ?? C.fg4, flexShrink: 0 }} />
                            {repo.language}
                          </span>
                        ) : <span style={{ color: C.fg4, fontSize: '0.78rem' }}>—</span>}
                      </td>
                      {/* branch */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', width: '100px' }}>
                        <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.fg4 }}>{repo.default_branch}</span>
                      </td>
                      {/* stars */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', width: '80px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: C.fg3 }}>
                          <Star size={11} />{repo.stargazers_count}
                        </span>
                      </td>
                      {/* updated */}
                      <td style={{ padding: '10px 20px 10px 12px', whiteSpace: 'nowrap', width: '90px' }}>
                        <span style={{ fontFamily: C.mono, fontSize: '0.75rem', color: C.fg4 }}>{timeAgo(repo.updated_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* CARD MODE */}
            {!loading && filtered.length > 0 && viewMode === 'card' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '14px' }}>
                {filtered.map(repo => (
                  <div
                    key={repo.id}
                    onClick={() => openRepo(repo)}
                    onMouseEnter={() => setActiveRepo(repo)}
                    style={{
                      background: C.bg1,
                      border: `1px solid ${C.line}`,
                      borderRadius: '10px',
                      padding: '18px 20px',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', gap: '10px',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseOver={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.lineStr; (e.currentTarget as HTMLDivElement).style.background = C.bg2; }}
                    onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.line; (e.currentTarget as HTMLDivElement).style.background = C.bg1; }}
                  >
                    {/* name + badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontFamily: C.mono, fontSize: '0.88rem', fontWeight: 600, color: C.info, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repo.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', border: `1px solid ${repo.private ? C.line : 'rgba(63,185,80,0.3)'}`, borderRadius: '20px', padding: '1px 8px', fontSize: '0.7rem', color: repo.private ? C.fg4 : C.accent, flexShrink: 0, fontFamily: C.mono }}>
                        {repo.private ? <Lock size={9} /> : <Globe size={9} />}
                        {repo.private ? 'priv' : 'pub'}
                      </span>
                    </div>
                    {/* description */}
                    <p style={{ margin: 0, fontSize: '0.8rem', color: C.fg3, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                      {repo.description || 'No description.'}
                    </p>
                    {/* footer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
                      {repo.language && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: C.fg3 }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: LANG_COLORS[repo.language] ?? C.fg4 }} />
                          {repo.language}
                        </span>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: C.fg4 }}>
                        <Star size={11} />{repo.stargazers_count}
                      </span>
                      <span style={{ marginLeft: 'auto', fontFamily: C.mono, fontSize: '0.72rem', color: C.fg4 }}>{timeAgo(repo.updated_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status bar */}
          <div style={{ padding: '8px 28px', borderTop: `1px solid ${C.line}`, background: C.panel, display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.fg4 }}>
              showing <span style={{ color: C.fg3 }}>{filtered.length}</span>
            </span>
            <span style={{ color: C.line }}>·</span>
            <span style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.fg4 }}>
              <span style={{ color: C.accent }}>0</span> analyzed
            </span>
            {user && (
              <>
                <span style={{ color: C.line }}>·</span>
                <span style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.fg4 }}>
                  connected as <span style={{ color: C.info }}>{user.login}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Right panel (preview) ── */}
        <div style={{ width: '380px', flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column' }}>
          {activeRepo ? (
            <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
              {/* Repo name */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  {activeRepo.private
                    ? <Lock size={13} style={{ color: C.fg4 }} />
                    : <Globe size={13} style={{ color: C.fg3, opacity: 0.6 }} />}
                  <span style={{ fontFamily: C.mono, fontSize: '0.72rem', color: C.fg4 }}>{activeRepo.owner.login}</span>
                  <span style={{ color: C.fg4, fontSize: '0.72rem' }}>/</span>
                </div>
                <h2 style={{ margin: '0 0 8px', fontFamily: C.mono, fontSize: '1.1rem', fontWeight: 700, color: C.info, wordBreak: 'break-all' }}>{activeRepo.name}</h2>
                <p style={{ margin: 0, fontSize: '0.82rem', color: C.fg3, lineHeight: 1.6 }}>
                  {activeRepo.description || 'No description provided.'}
                </p>
              </div>

              {/* 2x2 meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'language', value: activeRepo.language ?? 'unknown', dot: activeRepo.language ? LANG_COLORS[activeRepo.language] : undefined },
                  { label: 'stars', value: String(activeRepo.stargazers_count) },
                  { label: 'branch', value: activeRepo.default_branch },
                  { label: 'updated', value: timeAgo(activeRepo.updated_at) },
                ].map(({ label, value, dot }) => (
                  <div key={label} style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '10px 14px' }}>
                    <div style={{ fontFamily: C.mono, fontSize: '0.68rem', color: C.fg4, marginBottom: '4px' }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: C.mono, fontSize: '0.82rem', color: C.fg2, fontWeight: 600 }}>
                      {dot && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, flexShrink: 0 }} />}
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Fake commits */}
              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: '16px' }}>
                <div style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.fg4, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <GitCommit size={12} /><span>recent commits</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {FAKE_COMMITS.map(c => (
                    <div key={c.hash} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.accent, flexShrink: 0, marginTop: '1px' }}>{c.hash}</span>
                      <span style={{ fontSize: '0.78rem', color: C.fg3, flex: 1, lineHeight: 1.4 }}>{c.msg}</span>
                      <span style={{ fontFamily: C.mono, fontSize: '0.7rem', color: C.fg4, flexShrink: 0 }}>{c.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
                <button
                  onClick={() => openRepo(activeRepo)}
                  style={{
                    background: C.accent, border: 'none', borderRadius: '8px',
                    padding: '10px 18px', color: '#0d1117', fontFamily: C.mono, fontSize: '0.83rem', fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
                >
                  analyze repository <span style={{ opacity: 0.7 }}>↵</span>
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {['view on github', 'copy url'].map(label => (
                    <button
                      key={label}
                      style={{
                        background: 'transparent', border: `1px solid ${C.lineStr}`, borderRadius: '7px',
                        padding: '8px 12px', color: C.fg3, fontFamily: C.mono, fontSize: '0.75rem',
                        cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.fg4; (e.currentTarget as HTMLButtonElement).style.color = C.fg2; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.lineStr; (e.currentTarget as HTMLButtonElement).style.color = C.fg3; }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Empty right panel */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.3 }}>
              <GitBranch size={36} style={{ color: C.fg3 }} />
              <span style={{ fontFamily: C.mono, fontSize: '0.78rem', color: C.fg4 }}>hover a repo to preview</span>
            </div>
          )}
        </div>
      </div>

      {/* Global keyframe styles */}
      <style>{`
        @keyframes gg-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes gg-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.25; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}</style>
    </div>
  );
}
