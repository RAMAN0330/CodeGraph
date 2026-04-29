import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, GitFork, Lock, Globe, Clock, Code, LogOut } from 'lucide-react';

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

export default function RepoSelector() {
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('all');
  const [visFilter, setVisFilter] = useState<'all' | 'public' | 'private'>('all');

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

  async function handleSignOut() {
    try { await fetch(`${API}/auth/logout`, { credentials: 'include' }); } catch {}
    navigate('/');
  }

  function openRepo(repo: Repo) {
    navigate(`/workspace?repo=${repo.full_name}&run=1`);
  }

  const languages = ['all', ...Array.from(new Set(repos.map(r => r.language).filter(Boolean))) as string[]].sort((a, b) => a === 'all' ? -1 : a.localeCompare(b));

  const filtered = repos.filter(r => {
    if (visFilter !== 'all' && (visFilter === 'private') !== r.private) return false;
    if (langFilter !== 'all' && r.language !== langFilter) return false;
    if (search && !r.full_name.toLowerCase().includes(search.toLowerCase()) && !(r.description || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0f6fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Header */}
      <header style={{ background: '#161b22', borderBottom: '1px solid #30363d', padding: '0 32px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '30px', height: '30px', background: '#238636', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>CodeFlow</span>
        </div>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src={user.avatar_url} alt={user.login} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #30363d' }} />
              <span style={{ color: '#8b949e', fontSize: '0.875rem' }}>{user.login}</span>
            </div>
            <button onClick={handleSignOut} style={{ background: 'transparent', border: '1px solid #30363d', color: '#8b949e', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <LogOut size={13} /> Sign out
            </button>
          </div>
        )}
      </header>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '48px 24px' }}>
        {/* Page title */}
        <div style={{ marginBottom: '36px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 8px', color: '#f0f6fc' }}>Select a repository</h1>
          <p style={{ color: '#8b949e', margin: 0, fontSize: '0.95rem' }}>Choose a repo to analyze its architecture, dependencies, and database schema.</p>
        </div>

        {/* Search + Filters */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8b949e' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search repositories..."
              style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 12px 10px 36px', color: '#f0f6fc', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <select value={langFilter} onChange={e => setLangFilter(e.target.value)} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '10px 14px', color: '#f0f6fc', fontSize: '0.875rem', cursor: 'pointer', outline: 'none' }}>
            {languages.map(l => <option key={l} value={l}>{l === 'all' ? 'All languages' : l}</option>)}
          </select>
          <div style={{ display: 'flex', background: '#161b22', border: '1px solid #30363d', borderRadius: '8px', overflow: 'hidden' }}>
            {(['all', 'public', 'private'] as const).map(v => (
              <button key={v} onClick={() => setVisFilter(v)} style={{ padding: '10px 16px', background: visFilter === v ? '#238636' : 'transparent', border: 'none', color: visFilter === v ? 'white' : '#8b949e', fontSize: '0.875rem', cursor: 'pointer', textTransform: 'capitalize' }}>{v}</button>
            ))}
          </div>
        </div>

        {/* Repo count */}
        {!loading && (
          <p style={{ color: '#8b949e', fontSize: '0.85rem', marginBottom: '16px' }}>
            {filtered.length} {filtered.length === 1 ? 'repository' : 'repositories'}
            {search || langFilter !== 'all' || visFilter !== 'all' ? ' matching filters' : ''}
          </p>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px', height: '140px', animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.6 }} />
            ))}
          </div>
        )}

        {/* Repo grid */}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 24px', color: '#8b949e' }}>
            <Code size={40} style={{ marginBottom: '16px', opacity: 0.4 }} />
            <p style={{ fontSize: '1rem', margin: 0 }}>No repositories match your filters.</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {filtered.map(repo => (
              <div
                key={repo.id}
                onClick={() => openRepo(repo)}
                style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '24px', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s', display: 'flex', flexDirection: 'column', gap: '12px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#238636'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#30363d'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
              >
                {/* Repo name + visibility */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#58a6ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{repo.name}</span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: repo.private ? '#1f2937' : '#1a2b1a', border: `1px solid ${repo.private ? '#374151' : '#238636'}`, borderRadius: '20px', padding: '2px 10px', fontSize: '0.75rem', color: repo.private ? '#8b949e' : '#3fb950', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {repo.private ? <Lock size={11} /> : <Globe size={11} />}
                    {repo.private ? 'Private' : 'Public'}
                  </span>
                </div>

                {/* Description */}
                <p style={{ color: '#8b949e', fontSize: '0.875rem', margin: 0, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>
                  {repo.description || 'No description provided.'}
                </p>

                {/* Meta row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: 'auto' }}>
                  {repo.language && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: '#8b949e' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: LANG_COLORS[repo.language] ?? '#8b949e', flexShrink: 0 }} />
                      {repo.language}
                    </span>
                  )}
                  {repo.stargazers_count > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#8b949e' }}>
                      <Star size={13} /> {repo.stargazers_count}
                    </span>
                  )}
                  {repo.forks_count > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#8b949e' }}>
                      <GitFork size={13} /> {repo.forks_count}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#8b949e', marginLeft: 'auto' }}>
                    <Clock size={12} /> {timeAgo(repo.updated_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
