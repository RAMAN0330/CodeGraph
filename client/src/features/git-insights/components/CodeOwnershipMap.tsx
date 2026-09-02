import React, { useState, useEffect } from 'react';

const AUTHOR_COLORS = ['var(--color-success)','var(--teal-600)','var(--color-warning)','var(--chart-purple)','var(--color-danger)','var(--teal-500)','var(--color-warning)','var(--chart-purple)'];
const AUTHOR_BG    = ['var(--surface-subtle)','var(--surface-subtle)','var(--surface-subtle)','var(--surface-subtle)','var(--surface-subtle)','var(--surface-subtle)','var(--surface-subtle)','var(--surface-subtle)'];

function hashToColorIndex(login: string): number {
  return login.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AUTHOR_COLORS.length;
}

const OWNERSHIP_STYLE = `
@keyframes shimmer {
  0% { background-position: -600px 0; }
  100% { background-position: 600px 0; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.co-card:hover {
  border-color: var(--teal-500) !important;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--teal-500) 13%, transparent), 0 6px 20px rgba(0,0,0,.27) !important;
  transform: translateY(-2px) scale(1.01) !important;
}
`;

let omStyleInjected = false;
function ensureOMStyle() {
  if (omStyleInjected) return;
  omStyleInjected = true;
  const el = document.createElement('style');
  el.textContent = OWNERSHIP_STYLE;
  document.head.appendChild(el);
}

interface FolderOwnership {
  folder: string;
  fileCount: number;
  owner: string;
}

interface CodeOwnershipMapProps {
  owner: string;
  repo: string;
  token: string;
  files: any[];
}

function ShimmerBlock({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'linear-gradient(90deg, var(--surface-card) 25%, var(--surface-subtle) 50%, var(--surface-card) 75%)',
      backgroundSize: '600px 100%',
      animation: 'shimmer 1.4s infinite linear',
      borderRadius: 8,
      ...style,
    }} />
  );
}

export default function CodeOwnershipMap({ owner, repo, token, files }: CodeOwnershipMapProps) {
  const [ownership, setOwnership] = useState<FolderOwnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  ensureOMStyle();

  useEffect(() => {
    if (!files.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Extract unique top-level folders
        const folderCount: Record<string, number> = {};
        for (const file of files) {
          const filePath = file.path || file.name || '';
          const parts = filePath.split('/');
          const topFolder = parts.length > 1 ? parts[0] : '(root)';
          folderCount[topFolder] = (folderCount[topFolder] || 0) + 1;
        }

        // Sort by file count descending, take top 8
        const topFolders = Object.entries(folderCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([folder, count]) => ({ folder, count }));

        // For each folder, fetch 1 commit to determine owner
        const results: FolderOwnership[] = [];
        for (const { folder, count } of topFolders) {
          if (cancelled) break;
          let ownerLogin = 'unknown';

          try {
            const pathQuery = folder === '(root)' ? '' : `&path=${encodeURIComponent(folder)}`;
            const res = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1${pathQuery}`,
              { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } }
            );
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                ownerLogin = data[0].author?.login || data[0].commit?.author?.name || 'unknown';
              }
            }
          } catch {
            // skip, keep 'unknown'
          }

          results.push({ folder, fileCount: count, owner: ownerLogin });
        }

        if (!cancelled) setOwnership(results);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to compute ownership map');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token, files]);

  const containerStyle: React.CSSProperties = {
    background: 'var(--bg-canvas)',
    borderRadius: 12,
    padding: '28px 28px 32px',
    color: 'var(--text-primary)',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    minHeight: 260,
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <ShimmerBlock style={{ width: 200, height: 28 }} />
        <ShimmerBlock style={{ width: 70, height: 22, borderRadius: 20 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {[0,1,2,3,4,5].map(i => (
          <ShimmerBlock key={i} style={{ height: 120, borderRadius: 10 }} />
        ))}
      </div>
    </div>
  );

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ ...containerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: 36 }}>⚠️</div>
      <div style={{ fontSize: 15, color: 'var(--color-danger)', fontWeight: 600 }}>Failed to build ownership map</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 360, textAlign: 'center' }}>{error}</div>
    </div>
  );

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (!ownership.length) return (
    <div style={{ ...containerStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <div style={{ fontSize: 36 }}>📂</div>
      <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>No folder ownership data available.</div>
    </div>
  );

  // ── Computed ─────────────────────────────────────────────────────────────────
  const maxFiles = Math.max(...ownership.map(o => o.fileCount));
  const totalFiles = ownership.reduce((s, o) => s + o.fileCount, 0);

  // Author legend aggregates
  const authorTotals: Record<string, number> = {};
  for (const { owner: ownerLogin, fileCount } of ownership) {
    authorTotals[ownerLogin] = (authorTotals[ownerLogin] || 0) + fileCount;
  }
  const legendAuthors = Object.entries(authorTotals).sort((a, b) => b[1] - a[1]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
          Code Ownership
        </h2>
        <span style={{
          fontSize: 12, fontWeight: 600,
          background: 'var(--surface-subtle)', color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 20, padding: '3px 10px',
        }}>
          {files.length} files
        </span>
      </div>
      <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Top author per folder based on most recent commit. Card width scales with file count.
      </p>

      {/* Treemap-style ownership grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        marginBottom: 28,
      }}>
        {ownership.map(({ folder, fileCount, owner: ownerLogin }, idx) => {
          const colorIdx = ownerLogin !== 'unknown' ? hashToColorIndex(ownerLogin) : 4;
          const color = AUTHOR_COLORS[colorIdx];
          const bg = AUTHOR_BG[colorIdx];
          const pct = Math.round((fileCount / totalFiles) * 100);
          const span = Math.max(1, Math.round((fileCount / maxFiles) * 4));
          const initials = ownerLogin.slice(0, 2).toUpperCase();

          return (
            <div
              key={folder}
              className="co-card"
              style={{
                gridColumn: `span ${span}`,
                background: bg,
                border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
                borderRadius: 10,
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
                animation: `fadeInUp 0.3s ease both`,
                animationDelay: `${Math.min(idx * 40, 320)}ms`,
                minWidth: 0,
              }}
            >
              {/* Folder name */}
              <div style={{
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-info)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {folder}/
              </div>

              {/* Owner row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0,
                  boxShadow: `0 0 6px ${color}66`,
                }}>
                  {initials}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ownerLogin}
                </span>
                <span style={{
                  marginLeft: 'auto', flexShrink: 0,
                  fontSize: 11, fontWeight: 600,
                  background: `${color}22`, color: color,
                  border: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
                  borderRadius: 12, padding: '1px 8px',
                }}>
                  {fileCount}
                </span>
              </div>

              {/* Ownership % bar */}
              <div>
                <div style={{
                  height: 4, borderRadius: 4,
                  background: 'var(--surface-subtle)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}cc, ${color})`,
                    borderRadius: 4,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {pct}% of tracked files
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Author legend */}
      <div style={{
        borderTop: '1px solid var(--surface-subtle)',
        paddingTop: 18,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', marginRight: 4 }}>
          Authors
        </span>
        {legendAuthors.map(([login, count]) => {
          const colorIdx = login !== 'unknown' ? hashToColorIndex(login) : 4;
          const color = AUTHOR_COLORS[colorIdx];
          return (
            <div key={login} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 20,
              padding: '4px 10px 4px 6px',
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: color, flexShrink: 0,
                boxShadow: `0 0 5px ${color}88`,
              }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{login}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{count} files</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
