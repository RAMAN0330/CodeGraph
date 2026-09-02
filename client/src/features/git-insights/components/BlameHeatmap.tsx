import { useState, useEffect } from 'react';

interface BlameCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
}

interface BlameHeatmapProps {
  owner: string;
  repo: string;
  token: string;
  filePath: string;
}

function ageColor(dateStr: string): string {
  const days = (Date.now() - new Date(dateStr).getTime()) / 86400000;
  if (days < 30) return 'var(--color-success)';
  if (days < 90) return 'var(--color-warning)';
  if (days < 180) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

export default function BlameHeatmap({ owner, repo, token, filePath }: BlameHeatmapProps) {
  const [commits, setCommits] = useState<BlameCommit[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20&path=${encodeURIComponent(filePath)}`,
          { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setCommits(data);
      } catch {
        // silently fail — render nothing on error
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, token, filePath]);

  if (!commits.length) return null;

  const blockWidthPct = 100 / commits.length;

  return (
    <div style={{
      marginBottom: 12,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Heatmap strip */}
      <div style={{
        display: 'flex',
        height: 12,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        position: 'relative',
      }}>
        {commits.map((c) => {
          const color = ageColor(c.commit.author.date);
          const tooltipText =
            `${c.commit.author.name} · ${new Date(c.commit.author.date).toLocaleDateString()} · ${c.commit.message.slice(0, 60)}`;
          return (
            <div
              key={c.sha}
              title={tooltipText}
              onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, content: tooltipText })}
              onMouseLeave={() => setTooltip(null)}
              style={{
                width: `${blockWidthPct}%`,
                height: '100%',
                background: color,
                cursor: 'default',
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        <span>Recent</span>
        {['var(--color-success)','var(--color-warning)','var(--color-warning)','var(--color-danger)'].map(c => (
          <div key={c} style={{ width: 16, height: 8, background: c, borderRadius: 2 }} />
        ))}
        <span>Stale</span>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 12,
          top: tooltip.y - 8,
          background: 'var(--surface-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
          color: 'var(--text-primary)',
          pointerEvents: 'none',
          zIndex: 9999,
          maxWidth: 320,
          wordBreak: 'break-word',
        }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
