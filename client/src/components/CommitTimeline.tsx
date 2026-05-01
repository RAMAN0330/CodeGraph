import React, { useState, useEffect } from 'react';

const AUTHOR_COLORS = ['#238636','#1f6feb','#9e6a03','#8957e5','#cf222e','#0969da','#bf8700','#6e40c9'];

function hashToColorIndex(login: string): number {
  return login.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AUTHOR_COLORS.length;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHr > 0) return `${diffHr}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

interface CommitItem {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: { login: string } | null;
}

interface CommitTimelineProps {
  owner: string;
  repo: string;
  token: string;
  branch: string;
}

export default function CommitTimeline({ owner, repo, token, branch }: CommitTimelineProps) {
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30&sha=${branch}`,
          { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } }
        );
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
        const data = await res.json();
        if (!cancelled) setCommits(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load commits');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, token, branch]);

  const containerStyle: React.CSSProperties = {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 24,
    color: '#f0f6fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  if (loading) return (
    <div style={containerStyle}>
      <p style={{ color: '#8b949e' }}>Loading commits...</p>
    </div>
  );

  if (error) return (
    <div style={containerStyle}>
      <p style={{ color: '#f85149' }}>Error: {error}</p>
    </div>
  );

  if (!commits.length) return (
    <div style={containerStyle}>
      <p style={{ color: '#8b949e' }}>No commits found on branch "{branch}".</p>
    </div>
  );

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: '#f0f6fc' }}>
        Commit Timeline — <span style={{ color: '#8b949e', fontWeight: 400 }}>{branch}</span>
      </h2>

      <div style={{ position: 'relative' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute',
          left: 15,
          top: 0,
          bottom: 0,
          width: 2,
          background: '#21262d',
          borderRadius: 1,
        }} />

        {commits.map((commit) => {
          const login = commit.author?.login || commit.commit.author.name || 'unknown';
          const colorIdx = hashToColorIndex(login);
          const color = AUTHOR_COLORS[colorIdx];
          const sha7 = commit.sha.slice(0, 7);
          const message = commit.commit.message.split('\n')[0].slice(0, 72);
          const date = commit.commit.author.date;

          return (
            <div key={commit.sha} style={{
              display: 'flex',
              gap: 16,
              marginBottom: 20,
              position: 'relative',
            }}>
              {/* Colored dot */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: color,
                border: '3px solid #161b22',
                flexShrink: 0,
                zIndex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
              }}>
                {login[0].toUpperCase()}
              </div>

              {/* Content */}
              <div style={{
                flex: 1,
                background: '#21262d',
                border: '1px solid #30363d',
                borderRadius: 6,
                padding: '10px 14px',
                minWidth: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <code style={{
                    fontSize: 12,
                    background: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: 4,
                    padding: '1px 6px',
                    color: '#79c0ff',
                    fontFamily: 'monospace',
                  }}>
                    {sha7}
                  </code>
                  <span style={{ fontSize: 12, color: '#8b949e' }}>{login}</span>
                  <span style={{ fontSize: 12, color: '#484f58', marginLeft: 'auto' }}>{timeAgo(date)}</span>
                </div>
                <p style={{ margin: 0, fontSize: 14, color: '#e6edf3', lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {message}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
