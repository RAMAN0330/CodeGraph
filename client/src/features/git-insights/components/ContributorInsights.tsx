import { useState, useEffect } from 'react';

const AUTHOR_COLORS = ['var(--green)', 'var(--acc)', 'var(--orange)', 'var(--purple)', 'var(--red)', 'var(--cyan)', 'var(--orange)', 'var(--purple)'];

interface Contributor {
  login: string;
  avatar_url: string;
  contributions: number;
}

interface ContributorInsightsProps {
  owner: string;
  repo: string;
  token: string;
  folders: string[];
}

export default function ContributorInsights({ owner, repo, token, folders }: ContributorInsightsProps) {
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=20`,
          { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } }
        );
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setContributors(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load contributors');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, token]);

  if (loading) return (
    <div className="gi-page"><p className="gi-note">Loading contributors…</p></div>
  );

  if (error) return (
    <div className="gi-page"><p className="gi-note" style={{ color: 'var(--red)' }}>Error: {error}</p></div>
  );

  if (!contributors.length) return (
    <div className="gi-page"><p className="gi-note">No contributors found.</p></div>
  );

  const maxContributions = contributors[0]?.contributions || 1;

  return (
    <div className="gi-page">
      <h1>Contributor Insights</h1>

      <div style={{ marginBottom: 32 }}>
        {contributors.map((c, i) => {
          const color = AUTHOR_COLORS[i % AUTHOR_COLORS.length];
          const barWidth = Math.round((c.contributions / maxContributions) * 100);
          return (
            <div key={c.login} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, color: 'var(--bg0)', flexShrink: 0,
              }}>
                {c.login[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--t0)' }}>{c.login}</span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{c.contributions} commits</span>
                </div>
                <div style={{ background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${barWidth}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {folders.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Folder Ownership (estimated)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--t3)', fontWeight: 600 }}>Folder</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--t3)', fontWeight: 600 }}>Top Author</th>
              </tr>
            </thead>
            <tbody>
              {folders.slice(0, 12).map((folder, idx) => {
                const contributor = contributors[idx % contributors.length];
                const color = AUTHOR_COLORS[idx % AUTHOR_COLORS.length];
                return (
                  <tr key={folder} style={{ borderBottom: '1px solid var(--border2)' }}>
                    <td style={{ padding: '8px', color: 'var(--t1)', fontFamily: "'JetBrains Mono',monospace" }}>
                      {folder}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%', background: color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'var(--bg0)', flexShrink: 0,
                        }}>
                          {contributor.login[0].toUpperCase()}
                        </div>
                        <span style={{ color: 'var(--t2)' }}>{contributor.login}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
