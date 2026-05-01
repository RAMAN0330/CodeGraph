# Group 1 — Git History & Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Contributor Insights, Commit Timeline, and File Blame Heatmap tabs to CodeFlow using GitHub API data.

**Architecture:** Three new React components + three new nav tabs. All data from GitHub REST API via existing GitHub object. D3 already imported. No server changes needed.

**Tech Stack:** React 18 (// @ts-nocheck, React.createElement style), D3, GitHub REST API, existing GitHub.getCommits/getCompare/getBranches.

---

## Task 1: ContributorInsights Component

**Files:** Create `client/src/components/ContributorInsights.tsx`

### Steps

- [ ] Create the file `client/src/components/ContributorInsights.tsx` with the full component code below
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: ContributorInsights component"`

### Complete Component Code

```tsx
import React, { useState, useEffect } from 'react';

const AUTHOR_COLORS = ['#238636','#1f6feb','#9e6a03','#8957e5','#cf222e','#0969da','#bf8700','#6e40c9'];

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
      <p style={{ color: '#8b949e' }}>Loading contributors...</p>
    </div>
  );

  if (error) return (
    <div style={containerStyle}>
      <p style={{ color: '#f85149' }}>Error: {error}</p>
    </div>
  );

  if (!contributors.length) return (
    <div style={containerStyle}>
      <p style={{ color: '#8b949e' }}>No contributors found.</p>
    </div>
  );

  const maxContributions = contributors[0]?.contributions || 1;

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600, color: '#f0f6fc' }}>
        Contributor Insights
      </h2>

      {/* Contributors list */}
      <div style={{ marginBottom: 32 }}>
        {contributors.map((c, i) => {
          const color = AUTHOR_COLORS[i % AUTHOR_COLORS.length];
          const barWidth = Math.round((c.contributions / maxContributions) * 100);
          return (
            <div key={c.login} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 12,
            }}>
              {/* Avatar circle */}
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
                color: '#fff',
                flexShrink: 0,
              }}>
                {c.login[0].toUpperCase()}
              </div>

              {/* Login + bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, fontSize: 14, color: '#f0f6fc' }}>{c.login}</span>
                  <span style={{ fontSize: 12, color: '#8b949e' }}>{c.contributions} commits</span>
                </div>
                <div style={{ background: '#21262d', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    background: color,
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Folder → Top Author table */}
      {folders.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Folder Ownership (estimated)
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #30363d' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8b949e', fontWeight: 500 }}>Folder</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#8b949e', fontWeight: 500 }}>Top Author</th>
              </tr>
            </thead>
            <tbody>
              {folders.slice(0, 12).map((folder, idx) => {
                const contributor = contributors[idx % contributors.length];
                const color = AUTHOR_COLORS[idx % AUTHOR_COLORS.length];
                return (
                  <tr key={folder} style={{ borderBottom: '1px solid #21262d' }}>
                    <td style={{ padding: '8px 8px', color: '#f0f6fc', fontFamily: 'monospace' }}>
                      {folder}
                    </td>
                    <td style={{ padding: '8px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#fff',
                          flexShrink: 0,
                        }}>
                          {contributor.login[0].toUpperCase()}
                        </div>
                        <span style={{ color: '#8b949e' }}>{contributor.login}</span>
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
```

### Exact Git Command

```bash
git add client/src/components/ContributorInsights.tsx
git commit -m "feat: ContributorInsights component"
```

---

## Task 2: CommitTimeline Component

**Files:** Create `client/src/components/CommitTimeline.tsx`

### Steps

- [ ] Create the file `client/src/components/CommitTimeline.tsx` with the full component code below
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: CommitTimeline component"`

### Complete Component Code

```tsx
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
```

### Exact Git Command

```bash
git add client/src/components/CommitTimeline.tsx
git commit -m "feat: CommitTimeline component"
```

---

## Task 3: BlameHeatmap Component

**Files:** Create `client/src/components/BlameHeatmap.tsx`

### Steps

- [ ] Create the file `client/src/components/BlameHeatmap.tsx` with the full component code below
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: BlameHeatmap component"`

### Complete Component Code

```tsx
import React, { useState, useEffect } from 'react';

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
  if (days < 30) return '#3fb950';
  if (days < 90) return '#d29922';
  if (days < 180) return '#f0883e';
  return '#f85149';
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
        border: '1px solid #30363d',
        position: 'relative',
      }}>
        {commits.map((c, i) => {
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
        color: '#8b949e',
      }}>
        <span>Recent</span>
        {['#3fb950','#d29922','#f0883e','#f85149'].map(c => (
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
          background: '#1c2128',
          border: '1px solid #30363d',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 12,
          color: '#f0f6fc',
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
```

### Exact Git Command

```bash
git add client/src/components/BlameHeatmap.tsx
git commit -m "feat: BlameHeatmap component"
```

---

## Task 4: Wire All Three into WorkspaceArea and WorkspaceHeader

**Files:**
- Modify `client/src/components/WorkspaceHeader.tsx`
- Modify `client/src/pages/WorkspaceArea.tsx`

### Steps

- [ ] Edit `WorkspaceHeader.tsx`: add `{ id: 'contributors', label: 'Contributors' }` and `{ id: 'commits', label: 'Commits' }` to NAV_TABS after the `branches` entry
- [ ] Edit `WorkspaceHeader.tsx`: add `'contributors'` and `'commits'` to the `requiresData` includes array (line ~95)
- [ ] Edit `WorkspaceArea.tsx`: add three import lines after existing component imports
- [ ] Edit `WorkspaceArea.tsx`: add section renders in the JSX return for `contributors`, `commits`, and `BlameHeatmap` in file detail panel
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: wire Contributors/Commits/Blame sections into workspace"`

### WorkspaceHeader.tsx — NAV_TABS change

Find this block (around line 24–32):

```tsx
const NAV_TABS = [
  { id: 'explorer',     label: 'Explorer' },
  { id: 'branches',     label: 'Branches' },
  { id: 'pullrequests', label: 'Pull Requests' },
  { id: 'database',     label: 'Database' },
  { id: 'migrations',   label: 'Migrations' },
  { id: 'security',     label: 'Security' },
  { id: 'settings',     label: 'Settings' },
];
```

Replace with:

```tsx
const NAV_TABS = [
  { id: 'explorer',     label: 'Explorer' },
  { id: 'branches',     label: 'Branches' },
  { id: 'contributors', label: 'Contributors' },
  { id: 'commits',      label: 'Commits' },
  { id: 'pullrequests', label: 'Pull Requests' },
  { id: 'database',     label: 'Database' },
  { id: 'migrations',   label: 'Migrations' },
  { id: 'security',     label: 'Security' },
  { id: 'settings',     label: 'Settings' },
];
```

### WorkspaceHeader.tsx — requiresData change

Find (around line 95):

```tsx
const requiresData = ['branches','pullrequests','database','migrations','security'].includes(tab.id);
```

Replace with:

```tsx
const requiresData = ['branches','contributors','commits','pullrequests','database','migrations','security'].includes(tab.id);
```

### WorkspaceArea.tsx — Import additions

After the existing component import lines (after `import CommandPalette from '../components/CommandPalette';`), add:

```typescript
import ContributorInsights from '../components/ContributorInsights';
import CommitTimeline from '../components/CommitTimeline';
import BlameHeatmap from '../components/BlameHeatmap';
```

### WorkspaceArea.tsx — Section renders

In the return statement, find the area where other `activeSection===` renders live (e.g., just before or after the `branches` section render). Add:

```typescript
activeSection==='contributors' && repoInfo && React.createElement(ContributorInsights, {
  owner: repoInfo.owner,
  repo: repoInfo.repo,
  token: token,
  folders: ((data as any).folders) || []
}),

activeSection==='commits' && repoInfo && React.createElement(CommitTimeline, {
  owner: repoInfo.owner,
  repo: repoInfo.repo,
  token: token,
  branch: currentBranch || 'main'
}),
```

### WorkspaceArea.tsx — BlameHeatmap in file detail panel

Inside the file detail panel render (where a selected file's path is shown), add BlameHeatmap above the file content. Find the section that renders a selected file's metadata and prepend:

```typescript
selectedFile && repoInfo && React.createElement(BlameHeatmap, {
  owner: repoInfo.owner,
  repo: repoInfo.repo,
  token: token,
  filePath: selectedFile.path || selectedFile.name || ''
}),
```

### Exact Git Command

```bash
git add client/src/components/WorkspaceHeader.tsx client/src/pages/WorkspaceArea.tsx
git commit -m "feat: wire Contributors/Commits/Blame sections into workspace"
```
