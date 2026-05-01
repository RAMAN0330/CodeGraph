import React, { useState, useEffect } from 'react';

const AUTHOR_COLORS = ['#238636','#1f6feb','#9e6a03','#8957e5','#cf222e','#0969da','#bf8700','#6e40c9'];

function hashToColorIndex(login: string): number {
  return login.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AUTHOR_COLORS.length;
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

export default function CodeOwnershipMap({ owner, repo, token, files }: CodeOwnershipMapProps) {
  const [ownership, setOwnership] = useState<FolderOwnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 24,
    color: '#f0f6fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  if (loading) return (
    <div style={containerStyle}>
      <p style={{ color: '#8b949e' }}>Building ownership map...</p>
    </div>
  );

  if (error) return (
    <div style={containerStyle}>
      <p style={{ color: '#f85149' }}>Error: {error}</p>
    </div>
  );

  if (!ownership.length) return (
    <div style={containerStyle}>
      <p style={{ color: '#8b949e' }}>No folder data available.</p>
    </div>
  );

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: '#f0f6fc' }}>
        Code Ownership Map
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#8b949e' }}>
        Top author per folder based on most recent commit.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ownership.map(({ folder, fileCount, owner: ownerLogin }) => {
          const colorIdx = ownerLogin !== 'unknown' ? hashToColorIndex(ownerLogin) : 4;
          const color = AUTHOR_COLORS[colorIdx];
          return (
            <div key={folder} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              background: '#21262d',
              border: '1px solid #30363d',
              borderRadius: 6,
            }}>
              {/* Owner avatar circle */}
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 15,
                color: '#fff',
                flexShrink: 0,
              }}>
                {ownerLogin[0].toUpperCase()}
              </div>

              {/* Folder info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: 14,
                  color: '#79c0ff',
                  marginBottom: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {folder}/
                </div>
                <div style={{ fontSize: 12, color: '#8b949e' }}>
                  {fileCount} file{fileCount !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Owner login */}
              <div style={{
                fontSize: 13,
                color: '#8b949e',
                flexShrink: 0,
              }}>
                {ownerLogin}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
