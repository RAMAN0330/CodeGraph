import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Lock, Globe, Code, LogOut, List, LayoutGrid, GitBranch, Search, X, ExternalLink, Copy, ArrowRight, Check, Command } from 'lucide-react';
import { appConfig } from '../../../app/config';

const API = appConfig.apiUrl;

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

function GitGraphMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="repo-logo-gradient" x1="4" y1="3" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#61afef" />
          <stop offset="1" stopColor="#56b6c2" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#repo-logo-gradient)" />
      <path d="M18 10v4m0 0-8 5m8-5 8 5M10 19v7h16v-7" stroke="#181a1f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18" cy="9" r="3" fill="#181a1f" />
      <circle cx="10" cy="19" r="3" fill="#282c34" stroke="#d7dae0" strokeWidth="1.2" />
      <circle cx="26" cy="19" r="3" fill="#282c34" stroke="#d7dae0" strokeWidth="1.2" />
      <circle cx="18" cy="27" r="3" fill="#c678dd" stroke="#181a1f" strokeWidth="1.4" />
    </svg>
  );
}

export default function RepoSelector() {
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [visFilter, setVisFilter] = useState<'all' | 'public' | 'private'>('all');
  const [activeRepo, setActiveRepo] = useState<Repo | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchHintLength, setSearchHintLength] = useState(0);
  const [searchHintDeleting, setSearchHintDeleting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API}/auth/config`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { github: false })
      .then(async config => {
        const meResponse = await fetch(`${API}/auth/me`, { credentials: 'include' });
        const me = meResponse.ok ? await meResponse.json() : null;
        if (!me) {
          if (config.github) { navigate('/'); return; }
          setAnonymousMode(true);
          setLoading(false);
          return;
        }
        setUser(me);
        const reposResponse = await fetch(`${API}/api/github/repos`, { credentials: 'include' });
        const data = reposResponse.ok ? await reposResponse.json() : { repos: [] };
        setRepos(data.repos || []);
        setActiveRepo(data.repos?.[0] || null);
        setLoading(false);
      })
      .catch(() => { setAnonymousMode(true); setLoading(false); });
  }, [navigate]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    const prompt = 'Search repositories…';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSearchHintLength(prompt.length);
      return;
    }
    const atEnd = searchHintLength === prompt.length;
    const atStart = searchHintLength === 0;
    const delay = atEnd && !searchHintDeleting ? 1300 : atStart && searchHintDeleting ? 400 : searchHintDeleting ? 42 : 72;
    const timer = window.setTimeout(() => {
      if (atEnd && !searchHintDeleting) setSearchHintDeleting(true);
      else if (atStart && searchHintDeleting) setSearchHintDeleting(false);
      else setSearchHintLength(current => current + (searchHintDeleting ? -1 : 1));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [searchHintDeleting, searchHintLength]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      const response = await fetch(`${API}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Unable to sign out');
      window.location.replace('/');
    } catch {
      setSignOutError('Sign out failed. Please try again.');
      setSigningOut(false);
    }
  }

  function openRepo(repo: Repo) {
    navigate(`/workspace?repo=${repo.full_name}&run=1`);
  }

  function viewOnGithub(repo: Repo) {
    window.open(`https://github.com/${repo.full_name}`, '_blank', 'noopener,noreferrer');
  }

  async function copyRepoUrl(repo: Repo) {
    await navigator.clipboard.writeText(`https://github.com/${repo.full_name}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function openPublicRepo() {
    const normalized = search.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    if (/^[^/\s]+\/[^/\s]+$/.test(normalized)) {
      navigate(`/workspace?repo=${encodeURIComponent(normalized)}&run=1`);
    }
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
    bg:       '#181a1f',
    bg1:      '#282c34',
    bg2:      '#21252b',
    panel:    '#21252b',
    line:     'rgba(171,178,191,0.12)',
    lineStr:  '#3e4452',
    fg:       '#f8fafd',
    fg2:      '#d7dae0',
    fg3:      '#abb2bf',
    fg4:      '#636b78',
    accent:   '#61afef',
    info:     '#56b6c2',
    mono:     "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  };

  // ─── pill button style ────────────────────────────────────────────────────
  const pill = (active: boolean) => ({
    padding: '4px 12px',
    borderRadius: '20px',
    border: `1px solid ${active ? C.accent : C.line}`,
    background: active ? 'rgba(97,175,239,0.12)' : 'transparent',
    color: active ? C.accent : C.fg3,
    fontSize: '0.78rem',
    fontFamily: C.mono,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  });

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="repo-selector-page" style={{ minHeight: '100vh', background: C.bg, color: C.fg, fontFamily: C.mono, overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 200,
        background: 'rgba(33,37,43,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.line}`,
        padding: '0 28px',
        height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '16px',
      }}>
        {/* Left: brand + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <GitGraphMark />
          <span style={{ fontFamily: C.mono, fontSize: '0.88rem', fontWeight: 700, color: C.fg }}>
            GraphKeep <span style={{ color: C.fg4, fontSize: '0.68rem', fontWeight: 500 }}>v0.4.2</span>
          </span>
          <span style={{ color: C.fg4, fontSize: '0.82rem' }}>›</span>
          <button className="repo-breadcrumb" onClick={() => navigate('/workspace')}>workspace</button>
          <span style={{ color: C.fg4, fontSize: '0.82rem' }}>›</span>
          <button className="repo-breadcrumb is-current" onClick={() => navigate('/select-repo')} aria-current="page">select-repo</button>
        </div>

        {/* Right: search + user */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
          <div className="repo-header-search">
            <Search size={15} />
            <input
              ref={searchRef}
              value={search}
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') { setSearch(''); event.currentTarget.blur(); } }}
              placeholder={'Search repositories…'.slice(0, searchHintLength)}
              aria-label="Search repositories"
            />
            {search ? (
              <button onClick={() => setSearch('')} className="repo-search-clear" aria-label="Clear search"><X size={13} /></button>
            ) : (
              <kbd><Command size={11} strokeWidth={2.2} /><span>K</span></kbd>
            )}
          </div>
          {user && (
            <>
              <div className="repo-user-chip">
                <img src={user.avatar_url} alt={user.login} />
                <div><span>{user.login}</span><small>GitHub connected</small></div>
              </div>
              <button
                className="repo-signout"
                disabled={signingOut}
                onClick={handleSignOut}
                title="Sign out of GraphKeep"
              >
                <LogOut size={14} /> {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
              {signOutError && <span role="alert" style={{ color: '#e06c75', fontSize: '0.68rem' }}>{signOutError}</span>}
            </>
          )}
        </div>
      </header>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>

        {/* ── Left panel ── */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${C.line}` }}>

          {/* Panel header */}
          <div style={{ padding: '24px 28px', borderBottom: `1px solid ${C.line}`, background: C.panel }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
                <div style={{ width: '38px', height: '38px', display: 'grid', placeItems: 'center', color: C.accent, background: 'rgba(97,175,239,.1)', border: '1px solid rgba(97,175,239,.25)', borderRadius: '10px' }}><GitBranch size={19} /></div>
                <div>
                  <h1 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '1.22rem', fontWeight: 750, color: C.fg, letterSpacing: '-0.025em' }}>Choose a repository</h1>
                  <p style={{ margin: '5px 0 0', fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', color: C.fg4 }}>
                    {loading ? 'Loading repositories…' : `${filtered.length} shown · ${repos.length} connected to GitHub`}
                  </p>
                </div>
              </div>
              {/* List / card toggle */}
              <div style={{ display: 'flex', gap: '4px', background: C.bg, border: `1px solid ${C.lineStr}`, borderRadius: '9px', padding: '4px' }}>
                <button
                  onClick={() => setViewMode('list')}
                  title="List view"
                  style={{ background: viewMode === 'list' ? C.bg1 : 'transparent', border: `1px solid ${viewMode === 'list' ? C.lineStr : 'transparent'}`, borderRadius: '6px', padding: '6px 9px', cursor: 'pointer', color: viewMode === 'list' ? C.accent : C.fg4, display: 'flex', alignItems: 'center' }}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  title="Card view"
                  style={{ background: viewMode === 'card' ? C.bg1 : 'transparent', border: `1px solid ${viewMode === 'card' ? C.lineStr : 'transparent'}`, borderRadius: '6px', padding: '6px 9px', cursor: 'pointer', color: viewMode === 'card' ? C.accent : C.fg4, display: 'flex', alignItems: 'center' }}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Search bar */}
          {anonymousMode && <div style={{ padding: '16px 28px', borderBottom: `1px solid ${C.line}`, background: C.panel }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: C.bg1, border: `1px solid ${C.lineStr}`, borderRadius: '8px', padding: '8px 14px' }}>
              <span style={{ color: C.accent, fontFamily: C.mono, fontSize: '0.9rem', fontWeight: 700, flexShrink: 0 }}>›</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setSearch(''); else if (e.key === 'Enter' && anonymousMode) openPublicRepo(); }}
                placeholder="owner/repository or GitHub URL..."
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.fg, fontFamily: C.mono, fontSize: '0.85rem', caretColor: C.accent }}
              />
              <div style={{ display: 'flex', gap: '4px', opacity: 0.45 }}>
                {['↑','↓','↵','esc'].map(k => (
                  <kbd key={k} style={{ fontFamily: C.mono, fontSize: '0.68rem', background: C.bg2, border: `1px solid ${C.lineStr}`, borderRadius: '3px', padding: '1px 5px', color: C.fg3 }}>{k}</kbd>
                ))}
              </div>
            </div>
          </div>}

          {/* Filter row */}
          <div style={{ padding: '13px 28px', borderBottom: `1px solid ${C.line}`, background: C.bg2, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: C.fg4, font: '600 .66rem Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.08em' }}>Visibility</span>
            {/* Visibility pills */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', 'public', 'private'] as const).map(v => (
                <button key={v} onClick={() => setVisFilter(v)} style={pill(visFilter === v)}>{v}</button>
              ))}
            </div>
            <div style={{ width: '1px', height: '18px', background: C.line, margin: '0 4px' }} />
            <span style={{ color: C.fg4, font: '600 .66rem Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.08em' }}>Language</span>
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
            {(visFilter !== 'all' || langFilter !== 'all' || search) && (
              <button onClick={() => { setVisFilter('all'); setLangFilter('all'); setSearch(''); }} style={{ marginLeft: 'auto', padding: '4px 9px', color: C.fg3, background: 'transparent', border: `1px solid ${C.lineStr}`, borderRadius: '7px', cursor: 'pointer', fontSize: '.7rem' }}>Clear filters</button>
            )}
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
                <p style={{ margin: 0, fontFamily: C.mono, fontSize: '0.85rem' }}>
                  {anonymousMode ? 'enter a public GitHub repository above' : 'no repos match filters'}
                </p>
                {anonymousMode && search.trim() && (
                  <button onClick={openPublicRepo} style={{ background: C.accent, border: 'none', borderRadius: '7px', padding: '9px 18px', color: C.bg, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer' }}>
                    analyze repository ↵
                  </button>
                )}
              </div>
            )}

            {/* LIST MODE */}
            {!loading && filtered.length > 0 && viewMode === 'list' && (
              <table aria-label="GitHub repositories" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.line}` }}>
                    {['', 'name', 'description', 'language', 'branch', 'stars', 'updated'].map((h, i) => (
                      <th key={i} style={{ position: 'sticky', top: 0, zIndex: 2, padding: i === 0 ? '10px 12px 10px 20px' : '10px 12px', textAlign: 'left', fontFamily: 'Inter, sans-serif', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '.07em', color: C.fg4, fontWeight: 650, whiteSpace: 'nowrap', background: C.bg2 }}>
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
                      style={{ borderBottom: `1px solid ${C.line}`, cursor: 'pointer', transition: 'background 0.1s', background: activeRepo?.id === repo.id ? 'rgba(97,175,239,.055)' : 'transparent' }}
                      onMouseOver={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(97,175,239,0.07)'}
                      onMouseOut={e => (e.currentTarget as HTMLTableRowElement).style.background = activeRepo?.id === repo.id ? 'rgba(97,175,239,.055)' : 'transparent'}
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
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px', border: `1px solid ${repo.private ? C.line : 'rgba(97,175,239,0.3)'}`, borderRadius: '20px', padding: '1px 8px', fontSize: '0.7rem', color: repo.private ? C.fg4 : C.accent, flexShrink: 0, fontFamily: C.mono }}>
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
        <div style={{ width: '410px', flexShrink: 0, background: C.panel, borderLeft: `1px solid ${C.lineStr}`, display: 'flex', flexDirection: 'column' }}>
          {activeRepo ? (
            <div style={{ padding: '26px', display: 'flex', flexDirection: 'column', gap: '22px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
              <div style={{ color: C.fg4, font: '700 .64rem Inter, sans-serif', letterSpacing: '.1em', textTransform: 'uppercase' }}>Repository preview</div>
              {/* Repo name */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '16px' }}>
                  <img src={activeRepo.owner.avatar_url} alt="" style={{ width: '38px', height: '38px', borderRadius: '10px', border: `1px solid ${C.lineStr}` }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: C.fg3, fontSize: '.72rem' }}>{activeRepo.private ? <Lock size={12} /> : <Globe size={12} />} {activeRepo.private ? 'Private repository' : 'Public repository'}</div>
                    <div style={{ marginTop: '3px', color: C.fg4, font: `500 .68rem ${C.mono}` }}>{activeRepo.owner.login}</div>
                  </div>
                </div>
                <h2 style={{ margin: '0 0 10px', fontFamily: 'Inter, sans-serif', fontSize: '1.38rem', fontWeight: 760, color: C.fg, letterSpacing: '-.025em', wordBreak: 'break-all' }}>{activeRepo.name}</h2>
                <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', color: C.fg3, lineHeight: 1.65 }}>
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
                  <div key={label} style={{ background: C.bg, border: `1px solid ${C.lineStr}`, borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ fontFamily: C.mono, fontSize: '0.62rem', color: C.fg4, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontFamily: C.mono, fontSize: '0.82rem', color: C.fg2, fontWeight: 600 }}>
                      {dot && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dot, flexShrink: 0 }} />}
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '16px', background: 'rgba(97,175,239,.065)', border: '1px solid rgba(97,175,239,.18)', borderRadius: '11px' }}>
                <div style={{ marginBottom: '7px', color: C.fg2, font: '700 .76rem Inter, sans-serif' }}>Ready to analyze</div>
                <p style={{ margin: 0, color: C.fg4, font: '400 .72rem/1.55 Inter, sans-serif' }}>GraphKeep will index the repository and build its dependency, schema, history, and security views.</p>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
                <button
                  onClick={() => openRepo(activeRepo)}
                  style={{
                    minHeight: '46px', background: C.accent, border: 'none', borderRadius: '9px',
                    padding: '10px 18px', color: C.bg, fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 750,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.opacity = '1'}
                >
                  Analyze repository <ArrowRight size={16} />
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button onClick={() => viewOnGithub(activeRepo)} style={{ minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', background: C.bg1, border: `1px solid ${C.lineStr}`, borderRadius: '8px', color: C.fg3, fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 650, cursor: 'pointer' }}><ExternalLink size={14} /> View on GitHub</button>
                  <button onClick={() => copyRepoUrl(activeRepo)} style={{ minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', background: C.bg1, border: `1px solid ${C.lineStr}`, borderRadius: '8px', color: copied ? '#98c379' : C.fg3, fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 650, cursor: 'pointer' }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy URL'}</button>
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
        .repo-header-search {
          width: 94px;
          height: 38px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 11px;
          color: #7f848e;
          background: #181a1f;
          border: 1px solid #3e4452;
          border-radius: 9px;
          overflow: hidden;
          cursor: text;
          transition: width .24s ease, border-color .16s ease, box-shadow .16s ease;
        }
        .repo-breadcrumb {
          min-height: 30px;
          padding: 0 8px;
          color: #7f848e;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 6px;
          font: 550 .78rem 'JetBrains Mono', monospace;
          cursor: pointer;
          transition: color .15s ease, background .15s ease, border-color .15s ease;
        }
        .repo-breadcrumb:hover {
          color: #f8fafd;
          background: #282c34;
          border-color: #3e4452;
        }
        .repo-breadcrumb.is-current { color: #d7dae0; }
        .repo-breadcrumb:focus-visible { outline: 2px solid #61afef; outline-offset: 2px; }
        .repo-header-search:hover,
        .repo-header-search:focus-within {
          width: min(320px, 24vw);
        }
        .repo-header-search:focus-within {
          color: #61afef;
          border-color: #61afef;
          box-shadow: 0 0 0 3px rgba(97,175,239,.1);
        }
        .repo-header-search > svg { flex: 0 0 auto; }
        .repo-header-search input {
          width: 0;
          min-width: 0;
          flex: 1;
          opacity: 0;
          color: #d7dae0;
          background: transparent;
          border: 0;
          outline: 0;
          font: 500 .76rem 'JetBrains Mono', monospace;
          transition: opacity .12s ease .08s;
        }
        .repo-header-search:hover input,
        .repo-header-search:focus-within input { opacity: 1; }
        .repo-header-search input::placeholder { color: #636b78; }
        .repo-header-search kbd {
          opacity: 1;
          min-width: 42px;
          height: 24px;
          padding: 0 7px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: #abb2bf;
          background: #282c34;
          border: 1px solid #515a6b;
          border-bottom-color: #636b78;
          border-radius: 6px;
          box-shadow: 0 1px 0 #181a1f;
          font: 700 .64rem 'JetBrains Mono', monospace;
        }
        .repo-header-search kbd svg { flex: 0 0 auto; color: #d7dae0; }
        .repo-search-clear {
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          padding: 0;
          color: #7f848e;
          background: transparent;
          border: 0;
          border-radius: 5px;
          cursor: pointer;
        }
        .repo-search-clear:hover { color: #f8fafd; background: #2c313a; }
        .repo-user-chip {
          height: 40px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 4px 10px 4px 5px;
          background: #282c34;
          border: 1px solid #3e4452;
          border-radius: 10px;
        }
        .repo-user-chip img { width: 30px; height: 30px; border-radius: 7px; }
        .repo-user-chip div { display: flex; flex-direction: column; gap: 2px; }
        .repo-user-chip span { max-width: 120px; overflow: hidden; text-overflow: ellipsis; color: #d7dae0; font: 650 .72rem 'JetBrains Mono', monospace; }
        .repo-user-chip small { color: #98c379; font: 500 .56rem 'JetBrains Mono', monospace; }
        .repo-signout {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 13px;
          color: #e06c75;
          background: rgba(224,108,117,.08);
          border: 1px solid rgba(224,108,117,.32);
          border-radius: 9px;
          font: 650 .72rem 'JetBrains Mono', monospace;
          cursor: pointer;
          transition: background .16s ease, border-color .16s ease, transform .16s ease;
        }
        .repo-signout:hover:not(:disabled) {
          color: #f08a92;
          background: rgba(224,108,117,.14);
          border-color: rgba(224,108,117,.62);
          transform: translateY(-1px);
        }
        .repo-signout:disabled { opacity: .58; cursor: wait; }
        @media (max-width: 980px) {
          .repo-header-search:hover,
          .repo-header-search:focus-within { width: 220px; }
          .repo-user-chip div { display: none; }
          .repo-user-chip { padding-right: 5px; }
        }
      `}</style>
    </div>
  );
}
