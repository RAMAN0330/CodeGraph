# Group 2 — Risk & Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stale Code Radar, Code Ownership Map, and Extended PR Risk (revert detection) to CodeFlow.

**Architecture:** All client-side. StaleCodeRadar and CodeOwnershipMap cross-reference existing analyzed data with GitHub API commit dates. PR risk extension adds revert badge to existing PR file list. No server changes.

**Tech Stack:** React 18 (// @ts-nocheck, React.createElement style in WorkspaceArea), GitHub REST API, existing data.files and data.connections.

---

## Task 1: StaleCodeRadar Component

**Files:** Create `client/src/components/StaleCodeRadar.tsx`

### Steps

- [ ] Create the file `client/src/components/StaleCodeRadar.tsx` with the full component code below
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: StaleCodeRadar component"`

### Complete Component Code

```tsx
import React, { useState, useEffect } from 'react';

interface StaleFile {
  path: string;
  basename: string;
  inDegree: number;
  daysSince: number;
  riskScore: number;
  lastModified: string;
}

interface StaleCodeRadarProps {
  owner: string;
  repo: string;
  token: string;
  files: any[];
  connections: any[];
}

function timeAgoFromDays(days: number): string {
  if (days < 1) return 'today';
  if (days < 30) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function riskColor(days: number): string {
  if (days < 30) return '#3fb950';
  if (days < 90) return '#d29922';
  return '#f85149';
}

export default function StaleCodeRadar({ owner, repo, token, files, connections }: StaleCodeRadarProps) {
  const [rows, setRows] = useState<StaleFile[]>([]);
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

        // Build in-degree map from connections
        const inDegreeMap: Record<string, number> = {};
        for (const conn of connections) {
          const target = conn.to || conn.target || '';
          if (target) {
            inDegreeMap[target] = (inDegreeMap[target] || 0) + 1;
          }
        }

        // Take top 15 files by in-degree
        const sorted = [...files]
          .sort((a, b) => {
            const aPath = a.path || a.name || '';
            const bPath = b.path || b.name || '';
            return (inDegreeMap[bPath] || 0) - (inDegreeMap[aPath] || 0);
          })
          .slice(0, 15);

        // Fetch last commit date for each
        const results: StaleFile[] = [];
        for (const file of sorted) {
          if (cancelled) break;
          const filePath = file.path || file.name || '';
          if (!filePath) continue;

          let daysSince = 0;
          let lastModified = 'unknown';

          try {
            const res = await fetch(
              `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1&path=${encodeURIComponent(filePath)}`,
              { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } }
            );
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) {
                const dateStr = data[0].commit?.author?.date || data[0].commit?.committer?.date;
                if (dateStr) {
                  const ms = Date.now() - new Date(dateStr).getTime();
                  daysSince = ms / 86400000;
                  lastModified = dateStr;
                }
              }
            }
          } catch {
            // skip fetch error for this file
          }

          const inDegree = inDegreeMap[filePath] || 0;
          const riskScore = Math.round(daysSince * Math.log(1 + inDegree) * 10) / 10;
          const basename = filePath.split('/').pop() || filePath;

          results.push({ path: filePath, basename, inDegree, daysSince, riskScore, lastModified });
        }

        if (!cancelled) {
          results.sort((a, b) => b.riskScore - a.riskScore);
          setRows(results);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to compute stale radar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token, files, connections]);

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
      <p style={{ color: '#8b949e' }}>Analyzing stale code... (fetching commit dates)</p>
    </div>
  );

  if (error) return (
    <div style={containerStyle}>
      <p style={{ color: '#f85149' }}>Error: {error}</p>
    </div>
  );

  if (!rows.length) return (
    <div style={containerStyle}>
      <p style={{ color: '#8b949e' }}>No file data available for stale analysis.</p>
    </div>
  );

  const maxRisk = rows[0]?.riskScore || 1;

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: '#f0f6fc' }}>
        Stale Code Radar
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#8b949e' }}>
        Risk = Days Stale × log(1 + Dependents). Higher = more critical to update.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #30363d' }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#8b949e', fontWeight: 500 }}>File</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: '#8b949e', fontWeight: 500 }}>Deps (in)</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#8b949e', fontWeight: 500 }}>Last Modified</th>
              <th style={{ textAlign: 'right', padding: '8px 10px', color: '#8b949e', fontWeight: 500 }}>Days Stale</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', color: '#8b949e', fontWeight: 500, minWidth: 160 }}>Risk Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const barPct = maxRisk > 0 ? Math.round((row.riskScore / maxRisk) * 100) : 0;
              const color = riskColor(row.daysSince);
              const dayRounded = Math.round(row.daysSince);
              return (
                <tr key={row.path} style={{ borderBottom: '1px solid #21262d' }}>
                  <td style={{ padding: '10px 10px', fontFamily: 'monospace', color: '#79c0ff', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={row.path}>
                    {row.basename}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: row.inDegree > 5 ? '#f85149' : '#f0f6fc' }}>
                    {row.inDegree}
                  </td>
                  <td style={{ padding: '10px 10px', color: '#8b949e', whiteSpace: 'nowrap' }}>
                    {row.lastModified === 'unknown' ? '—' : timeAgoFromDays(row.daysSince)}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right', color: color }}>
                    {dayRounded}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, background: '#21262d', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{
                          width: `${barPct}%`,
                          height: '100%',
                          background: color,
                          borderRadius: 4,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#8b949e', minWidth: 32, textAlign: 'right' }}>
                        {row.riskScore.toFixed(1)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Exact Git Command

```bash
git add client/src/components/StaleCodeRadar.tsx
git commit -m "feat: StaleCodeRadar component"
```

---

## Task 2: CodeOwnershipMap Component

**Files:** Create `client/src/components/CodeOwnershipMap.tsx`

### Steps

- [ ] Create the file `client/src/components/CodeOwnershipMap.tsx` with the full component code below
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: CodeOwnershipMap component"`

### Complete Component Code

```tsx
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
```

### Exact Git Command

```bash
git add client/src/components/CodeOwnershipMap.tsx
git commit -m "feat: CodeOwnershipMap component"
```

---

## Task 3: Wire StaleCodeRadar and CodeOwnershipMap into WorkspaceArea/Header

**Files:**
- Modify `client/src/components/WorkspaceHeader.tsx`
- Modify `client/src/pages/WorkspaceArea.tsx`

### Steps

- [ ] Edit `WorkspaceHeader.tsx`: add `{ id: 'radar', label: 'Stale Radar' }` and `{ id: 'ownership', label: 'Ownership' }` to NAV_TABS (after `security` entry, before `settings`)
- [ ] Edit `WorkspaceHeader.tsx`: add `'radar'` and `'ownership'` to the `requiresData` includes array
- [ ] Edit `WorkspaceArea.tsx`: add import lines for both new components
- [ ] Edit `WorkspaceArea.tsx`: add section renders using React.createElement style
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: wire Stale Radar and Ownership sections into workspace"`

### WorkspaceHeader.tsx — NAV_TABS change

Find the existing NAV_TABS array and insert two entries after `security`, before `settings`:

```tsx
  { id: 'radar',     label: 'Stale Radar' },
  { id: 'ownership', label: 'Ownership' },
```

Result:

```tsx
const NAV_TABS = [
  { id: 'explorer',     label: 'Explorer' },
  { id: 'branches',     label: 'Branches' },
  { id: 'pullrequests', label: 'Pull Requests' },
  { id: 'database',     label: 'Database' },
  { id: 'migrations',   label: 'Migrations' },
  { id: 'security',     label: 'Security' },
  { id: 'radar',        label: 'Stale Radar' },
  { id: 'ownership',    label: 'Ownership' },
  { id: 'settings',     label: 'Settings' },
];
```

### WorkspaceHeader.tsx — requiresData change

Find:

```tsx
const requiresData = ['branches','pullrequests','database','migrations','security'].includes(tab.id);
```

Replace with:

```tsx
const requiresData = ['branches','pullrequests','database','migrations','security','radar','ownership'].includes(tab.id);
```

### WorkspaceArea.tsx — Import additions

After existing component imports, add:

```typescript
import StaleCodeRadar from '../components/StaleCodeRadar';
import CodeOwnershipMap from '../components/CodeOwnershipMap';
```

### WorkspaceArea.tsx — Section renders

In the return, in the section render area alongside other `activeSection===` conditionals, add:

```typescript
activeSection==='radar' && repoInfo && React.createElement(StaleCodeRadar, {
  owner: repoInfo.owner,
  repo: repoInfo.repo,
  token: token,
  files: ((data as any).files) || [],
  connections: ((data as any).connections) || []
}),

activeSection==='ownership' && repoInfo && React.createElement(CodeOwnershipMap, {
  owner: repoInfo.owner,
  repo: repoInfo.repo,
  token: token,
  files: ((data as any).files) || []
}),
```

### Exact Git Command

```bash
git add client/src/components/WorkspaceHeader.tsx client/src/pages/WorkspaceArea.tsx
git commit -m "feat: wire Stale Radar and Ownership sections into workspace"
```

---

## Task 4: Extended PR Risk — Revert Detection

**Files:** Modify `client/src/pages/WorkspaceArea.tsx` only

### Steps

- [ ] Locate the `pullrequests` section render in `WorkspaceArea.tsx` — search for `activeSection==='pullrequests'` or the PR files list render
- [ ] Add `revertCounts` state variable using the existing `var _x=useState<any>` pattern
- [ ] Add a `useEffect` (or inline fetch after PR files load) that fetches per-file commit histories and counts revert messages
- [ ] Add an orange "N reverts" badge next to each file in the PR changed-files list where revert count > 0
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: revert history badges in PR risk section"`

### WorkspaceArea.tsx — State addition

In the state declarations block (where `var _x=useState<any>(...)` patterns live), add:

```typescript
var _rc=useState<any>({}),revertCounts=_rc[0],setRevertCounts=_rc[1];
```

### WorkspaceArea.tsx — Revert count fetch logic

Add a `useEffect` that watches `prFiles` (or whatever state holds the PR changed files list). Find where PR files are loaded (look for `prFiles` state or the fetch that populates changed files). After files are set, trigger a secondary fetch. The pattern to add, **after** prFiles state is set, either inline or in a sibling effect:

```typescript
// After prFiles are loaded, fetch revert counts for each file
useEffect(function() {
  if (!prFiles || !prFiles.length || !repoInfo) return;
  var cancelled = false;
  (async function() {
    var counts: Record<string,number> = {};
    for (var i = 0; i < prFiles.length && !cancelled; i++) {
      var f = prFiles[i];
      var fp = f.filename || f.path || '';
      if (!fp) continue;
      try {
        GitHub.token = token;
        var res = await fetch(
          'https://api.github.com/repos/'+repoInfo.owner+'/'+repoInfo.repo+'/commits?per_page=20&path='+encodeURIComponent(fp),
          { headers: { 'Authorization': 'token '+token, 'Accept': 'application/vnd.github.v3+json' } }
        );
        if (res.ok) {
          var commits = await res.json();
          if (Array.isArray(commits)) {
            var reverts = commits.filter(function(c: any) {
              return (c.commit?.message || '').toLowerCase().startsWith('revert');
            }).length;
            if (reverts > 0) counts[fp] = reverts;
          }
        }
      } catch {}
    }
    if (!cancelled) setRevertCounts(counts);
  })();
  return function() { cancelled = true; };
}, [prFiles, repoInfo, token]);
```

> **Note:** `prFiles` must be the exact state variable name used in WorkspaceArea for the PR changed-files array. Verify by searching for `prFiles` or `changedFiles` in the file and use whichever is present.

### WorkspaceArea.tsx — Badge in PR file list render

Find the PR changed files list render (where each file item is rendered in the pullrequests section). In the render for each file `f`, add the badge **after** the filename text:

```typescript
// Inside the per-file render, after the filename span:
revertCounts[f.filename || f.path || ''] && React.createElement('span', {
  style: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
    padding: '1px 7px',
    borderRadius: 12,
    background: '#9e6a0344',
    border: '1px solid #9e6a03',
    color: '#d29922',
    fontSize: 11,
    fontWeight: 600,
    verticalAlign: 'middle',
  }
}, revertCounts[f.filename || f.path || ''] + ' revert' + (revertCounts[f.filename || f.path || ''] > 1 ? 's' : '')),
```

### Exact Git Command

```bash
git add client/src/pages/WorkspaceArea.tsx
git commit -m "feat: revert history badges in PR risk section"
```
