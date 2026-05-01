# Group 3 — Developer Productivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Release Notes Generator (auto-draft changelogs from tags+commits) and Tech Debt Timeline (D3 line chart of file metrics over last 10 commits).

**Architecture:** Both purely client-side. ReleaseNotesGenerator uses GitHub tags + compare API. TechDebtTimeline fetches last 10 commits and their file trees to count metrics, then renders D3 line chart.

**Tech Stack:** React 18 (// @ts-nocheck, React.createElement in WorkspaceArea), D3 (already imported), GitHub REST API.

---

## Task 1: ReleaseNotesGenerator Component

**Files:** Create `client/src/components/ReleaseNotesGenerator.tsx`

### Steps

- [ ] Create the file `client/src/components/ReleaseNotesGenerator.tsx` with the full component code below
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: ReleaseNotesGenerator component"`

### Complete Component Code

```tsx
import React, { useState, useEffect } from 'react';

interface CommitItem {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string } | null;
}

interface TagItem {
  name: string;
  commit: { sha: string };
}

type Category = 'Features' | 'Bug Fixes' | 'Documentation' | 'Other' | 'Uncategorized';

interface CategorizedCommit {
  sha7: string;
  message: string;
  author: string;
  category: Category;
}

interface ReleaseNotesGeneratorProps {
  owner: string;
  repo: string;
  token: string;
}

function categorize(message: string): Category {
  const lower = message.toLowerCase();
  if (lower.startsWith('feat')) return 'Features';
  if (lower.startsWith('fix')) return 'Bug Fixes';
  if (lower.startsWith('docs')) return 'Documentation';
  if (lower.startsWith('chore') || lower.startsWith('refactor') || lower.startsWith('perf')) return 'Other';
  return 'Uncategorized';
}

function stripScope(message: string): string {
  // Remove conventional commit prefix like "feat(scope): " or "fix: "
  return message.replace(/^[a-z]+(\([^)]*\))?:\s*/i, '').trim();
}

const CATEGORY_ORDER: Category[] = ['Features', 'Bug Fixes', 'Documentation', 'Other', 'Uncategorized'];

export default function ReleaseNotesGenerator({ owner, repo, token }: ReleaseNotesGeneratorProps) {
  const [commits, setCommits] = useState<CategorizedCommit[]>([]);
  const [tagFrom, setTagFrom] = useState<string>('');
  const [tagTo, setTagTo] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<Category, boolean>>({} as any);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

        // Fetch tags
        const tagsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/tags?per_page=10`,
          { headers }
        );
        if (!tagsRes.ok) throw new Error(`GitHub API error fetching tags: ${tagsRes.status}`);
        const tags: TagItem[] = await tagsRes.json();

        let rawCommits: CommitItem[] = [];

        if (tags.length >= 2) {
          const base = tags[1].name;
          const head = tags[0].name;

          const compareRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
            { headers }
          );
          if (!compareRes.ok) throw new Error(`GitHub API error comparing tags: ${compareRes.status}`);
          const compareData = await compareRes.json();
          rawCommits = compareData.commits || [];

          if (!cancelled) {
            setTagFrom(base);
            setTagTo(head);
          }
        } else {
          // Fewer than 2 tags — fall back to last 30 commits
          const commitsRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`,
            { headers }
          );
          if (!commitsRes.ok) throw new Error(`GitHub API error fetching commits: ${commitsRes.status}`);
          rawCommits = await commitsRes.json();

          if (!cancelled && tags.length === 1) {
            setTagFrom('(start)');
            setTagTo(tags[0].name);
          }
        }

        if (!cancelled) {
          const categorized: CategorizedCommit[] = rawCommits.map((c) => ({
            sha7: c.sha.slice(0, 7),
            message: stripScope(c.commit.message.split('\n')[0]),
            author: c.author?.login || c.commit.author.name,
            category: categorize(c.commit.message),
          }));

          const firstDate = rawCommits[0]?.commit?.author?.date;
          if (firstDate) setToDate(new Date(firstDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));

          setCommits(categorized);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to generate release notes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token]);

  function buildMarkdown(): string {
    const header = `## ${tagTo || 'Latest'} — ${toDate}\n\n`;
    const sections = CATEGORY_ORDER.map((cat) => {
      const items = commits.filter((c) => c.category === cat);
      if (!items.length) return '';
      return `### ${cat}\n${items.map((c) => `- ${c.message} (${c.sha7})`).join('\n')}\n`;
    }).filter(Boolean);
    return header + sections.join('\n');
  }

  function buildJson(): string {
    const grouped: Record<string, any[]> = {};
    for (const cat of CATEGORY_ORDER) {
      grouped[cat] = commits.filter((c) => c.category === cat).map((c) => ({
        sha: c.sha7,
        message: c.message,
        author: c.author,
      }));
    }
    return JSON.stringify({ version: tagTo || 'latest', date: toDate, changes: grouped }, null, 2);
  }

  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  const containerStyle: React.CSSProperties = {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 24,
    color: '#f0f6fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    maxWidth: 860,
  };

  if (loading) return <div style={containerStyle}><p style={{ color: '#8b949e' }}>Generating release notes...</p></div>;
  if (error) return <div style={containerStyle}><p style={{ color: '#f85149' }}>Error: {error}</p></div>;

  const groupedCommits: Record<Category, CategorizedCommit[]> = {} as any;
  for (const cat of CATEGORY_ORDER) {
    groupedCommits[cat] = commits.filter((c) => c.category === cat);
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: '#f0f6fc' }}>
            Release Notes Generator
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#8b949e' }}>
            {tagFrom && tagTo
              ? `From ${tagFrom} → ${tagTo}`
              : 'Last 30 commits'}
            {toDate && ` · ${toDate}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => copyText(buildMarkdown(), 'md')}
            style={{
              padding: '6px 14px',
              background: copied === 'md' ? '#238636' : '#21262d',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#f0f6fc',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied === 'md' ? 'Copied!' : 'Copy Markdown'}
          </button>
          <button
            onClick={() => copyText(buildJson(), 'json')}
            style={{
              padding: '6px 14px',
              background: copied === 'json' ? '#238636' : '#21262d',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#f0f6fc',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {copied === 'json' ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {/* Categories */}
      {CATEGORY_ORDER.map((cat) => {
        const items = groupedCommits[cat];
        if (!items.length) return null;
        const isCollapsed = collapsed[cat];
        return (
          <div key={cat} style={{ marginBottom: 16 }}>
            <button
              onClick={() => setCollapsed((prev) => ({ ...prev, [cat]: !isCollapsed }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #30363d',
                padding: '8px 0',
                cursor: 'pointer',
                color: '#f0f6fc',
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 11, color: '#8b949e', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.15s' }}>▼</span>
              {cat}
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8b949e', fontWeight: 400 }}>
                {items.length} commit{items.length !== 1 ? 's' : ''}
              </span>
            </button>
            {!isCollapsed && (
              <ul style={{ margin: '8px 0 0', padding: '0 0 0 20px', listStyle: 'disc' }}>
                {items.map((c) => (
                  <li key={c.sha7} style={{ marginBottom: 6, fontSize: 13, color: '#e6edf3', lineHeight: 1.5 }}>
                    {c.message}
                    <span style={{ marginLeft: 8, color: '#8b949e', fontSize: 12 }}>
                      <code style={{ fontSize: 11, background: '#21262d', padding: '1px 5px', borderRadius: 3, color: '#79c0ff' }}>{c.sha7}</code>
                      {' '}{c.author}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {commits.length === 0 && (
        <p style={{ color: '#8b949e' }}>No commits found for this range.</p>
      )}
    </div>
  );
}
```

### Exact Git Command

```bash
git add client/src/components/ReleaseNotesGenerator.tsx
git commit -m "feat: ReleaseNotesGenerator component"
```

---

## Task 2: TechDebtTimeline Component

**Files:** Create `client/src/components/TechDebtTimeline.tsx`

### Steps

- [ ] Create the file `client/src/components/TechDebtTimeline.tsx` with the full component code below
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: TechDebtTimeline component with D3 line chart"`

### Complete Component Code

```tsx
import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  index: number;
  sha7: string;
  totalFiles: number;
  testFiles: number;
  debtFiles: number;
  isCurrent: boolean;
}

interface TechDebtTimelineProps {
  owner: string;
  repo: string;
  token: string;
  currentData: any;
}

export default function TechDebtTimeline({ owner, repo, token, currentData }: TechDebtTimelineProps) {
  const [points, setPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

        // Fetch last 10 commits
        const commitsRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`,
          { headers }
        );
        if (!commitsRes.ok) throw new Error(`GitHub API error: ${commitsRes.status}`);
        const commits: any[] = await commitsRes.json();
        if (!Array.isArray(commits) || commits.length === 0) throw new Error('No commits found');

        // Reversed so oldest is index 0
        const chronological = [...commits].reverse();

        const dataPoints: DataPoint[] = [];

        for (let i = 0; i < chronological.length; i++) {
          if (cancelled) break;
          const commit = chronological[i];
          const sha = commit.sha;
          const isCurrent = i === chronological.length - 1;

          let totalFiles = 0;
          let testFiles = 0;
          let debtFiles = 0;

          if (isCurrent && currentData?.stats) {
            // Use already-analyzed data for current commit
            totalFiles = currentData.stats.files || 0;
            testFiles = (currentData.files || []).filter((f: any) => {
              const p = f.path || f.name || '';
              return p.includes('.test.') || p.includes('.spec.');
            }).length;
            debtFiles = (currentData.files || []).filter((f: any) => {
              const p = f.path || f.name || '';
              return /legacy|old_|temp_|hack|todo/i.test(p);
            }).length;
          } else {
            // Fetch tree for historical commits
            try {
              const treeRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
                { headers }
              );
              if (treeRes.ok) {
                const treeData = await treeRes.json();
                const blobs = (treeData.tree || []).filter((item: any) => item.type === 'blob');
                totalFiles = blobs.length;
                testFiles = blobs.filter((item: any) => item.path.includes('.test.') || item.path.includes('.spec.')).length;
                debtFiles = blobs.filter((item: any) => /legacy|old_|temp_|hack|todo/i.test(item.path)).length;
              }
            } catch {
              // Use 0 counts if tree fetch fails
            }
          }

          dataPoints.push({
            index: i,
            sha7: sha.slice(0, 7),
            totalFiles,
            testFiles,
            debtFiles,
            isCurrent,
          });
        }

        if (!cancelled) setPoints(dataPoints);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to build tech debt timeline');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token]);

  // D3 chart rendering
  useEffect(() => {
    if (!points.length || !svgRef.current) return;

    const W = 500, H = 200;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', W).attr('height', H);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain([0, points.length - 1])
      .range([0, innerW]);

    const allValues = points.flatMap((p) => [p.totalFiles, p.testFiles, p.debtFiles]);
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allValues) || 1])
      .nice()
      .range([innerH, 0]);

    // Grid lines
    g.append('g')
      .attr('stroke', '#21262d')
      .attr('stroke-dasharray', '4,4')
      .call(d3.axisLeft(yScale).ticks(4).tickSize(-innerW).tickFormat(() => ''))
      .call((a) => a.select('.domain').remove());

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(points.length - 1).tickFormat((d) => {
        const pt = points[d as number];
        return pt ? pt.sha7 : '';
      }))
      .call((a) => {
        a.select('.domain').attr('stroke', '#30363d');
        a.selectAll('text').attr('fill', '#8b949e').attr('font-size', 10).attr('transform', 'rotate(-35)').attr('text-anchor', 'end');
        a.selectAll('.tick line').attr('stroke', '#30363d');
      });

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(4))
      .call((a) => {
        a.select('.domain').attr('stroke', '#30363d');
        a.selectAll('text').attr('fill', '#8b949e').attr('font-size', 10);
        a.selectAll('.tick line').attr('stroke', '#30363d');
      });

    // Line factory
    const lineGen = (key: keyof DataPoint) =>
      d3.line<DataPoint>()
        .x((d) => xScale(d.index))
        .y((d) => yScale(d[key] as number))
        .curve(d3.curveMonotoneX);

    const lines: { key: keyof DataPoint; color: string; label: string }[] = [
      { key: 'totalFiles', color: '#58a6ff', label: 'Total Files' },
      { key: 'testFiles',  color: '#3fb950', label: 'Test Files' },
      { key: 'debtFiles',  color: '#f0883e', label: 'Debt Files' },
    ];

    for (const { key, color } of lines) {
      g.append('path')
        .datum(points)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('d', lineGen(key) as any);

      // Circles
      g.selectAll(`.dot-${key}`)
        .data(points)
        .join('circle')
        .attr('class', `dot-${key}`)
        .attr('cx', (d) => xScale(d.index))
        .attr('cy', (d) => yScale(d[key] as number))
        .attr('r', (d) => d.isCurrent ? 6 : 3)
        .attr('fill', (d) => d.isCurrent ? '#fff' : color)
        .attr('stroke', color)
        .attr('stroke-width', (d) => d.isCurrent ? 2.5 : 1);
    }
  }, [points]);

  const containerStyle: React.CSSProperties = {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: 24,
    color: '#f0f6fc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  if (loading) return <div style={containerStyle}><p style={{ color: '#8b949e' }}>Building tech debt timeline...</p></div>;
  if (error) return <div style={containerStyle}><p style={{ color: '#f85149' }}>Error: {error}</p></div>;
  if (!points.length) return <div style={containerStyle}><p style={{ color: '#8b949e' }}>No data available.</p></div>;

  const stats = currentData?.stats || {};
  const summaryRows = [
    { label: 'Dead Functions',  value: stats.dead       ?? 0, color: '#f85149' },
    { label: 'Issues',          value: (currentData?.issues?.length) ?? 0, color: '#d29922' },
    { label: 'Duplicates',      value: stats.duplicates ?? 0, color: '#f0883e' },
    { label: 'Security (High)', value: stats.security   ?? 0, color: '#cf222e' },
  ];

  return (
    <div style={containerStyle}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: '#f0f6fc' }}>
        Tech Debt Timeline
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#8b949e' }}>
        File counts over last {points.length} commits. Current commit marked with white dot.
      </p>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
        {[
          { color: '#58a6ff', label: 'Total Files' },
          { color: '#3fb950', label: 'Test Files' },
          { color: '#f0883e', label: 'Debt Files' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8b949e' }}>
            <div style={{ width: 24, height: 3, background: color, borderRadius: 2 }} />
            {label}
          </div>
        ))}
      </div>

      {/* D3 chart */}
      <div style={{ overflowX: 'auto', marginBottom: 28 }}>
        <svg ref={svgRef} style={{ display: 'block' }} />
      </div>

      {/* Current snapshot summary table */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Current Snapshot
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {summaryRows.map(({ label, value, color }) => (
          <div key={label} style={{
            padding: '12px 16px',
            background: '#21262d',
            border: `1px solid ${color}44`,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, color: '#8b949e' }}>{label}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Exact Git Command

```bash
git add client/src/components/TechDebtTimeline.tsx
git commit -m "feat: TechDebtTimeline component with D3 line chart"
```

---

## Task 3: Wire Both into WorkspaceArea and WorkspaceHeader

**Files:**
- Modify `client/src/components/WorkspaceHeader.tsx`
- Modify `client/src/pages/WorkspaceArea.tsx`

### Steps

- [ ] Edit `WorkspaceHeader.tsx`: add `{ id: 'releases', label: 'Releases' }` and `{ id: 'debt', label: 'Tech Debt' }` to NAV_TABS after the `security` entry (before `settings`)
- [ ] Edit `WorkspaceHeader.tsx`: add `'releases'` and `'debt'` to the `requiresData` includes array
- [ ] Edit `WorkspaceArea.tsx`: add import lines for both new components
- [ ] Edit `WorkspaceArea.tsx`: add section renders using React.createElement style
- [ ] Verify TypeScript compiles without errors (`cd client && npx tsc --noEmit`)
- [ ] Commit: `git commit -m "feat: wire Releases and Tech Debt sections into workspace"`

### WorkspaceHeader.tsx — NAV_TABS change

Find the existing NAV_TABS array and insert two entries after `security`, before `settings`:

```tsx
  { id: 'releases', label: 'Releases' },
  { id: 'debt',     label: 'Tech Debt' },
```

Result after insertion:

```tsx
const NAV_TABS = [
  { id: 'explorer',     label: 'Explorer' },
  { id: 'branches',     label: 'Branches' },
  { id: 'pullrequests', label: 'Pull Requests' },
  { id: 'database',     label: 'Database' },
  { id: 'migrations',   label: 'Migrations' },
  { id: 'security',     label: 'Security' },
  { id: 'releases',     label: 'Releases' },
  { id: 'debt',         label: 'Tech Debt' },
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
const requiresData = ['branches','pullrequests','database','migrations','security','releases','debt'].includes(tab.id);
```

### WorkspaceArea.tsx — Import additions

After the existing component import lines (after `import CommandPalette from '../components/CommandPalette';`), add:

```typescript
import ReleaseNotesGenerator from '../components/ReleaseNotesGenerator';
import TechDebtTimeline from '../components/TechDebtTimeline';
```

### WorkspaceArea.tsx — Section renders

In the return statement, alongside other `activeSection===` conditional renders, add:

```typescript
activeSection==='releases' && repoInfo && React.createElement(ReleaseNotesGenerator, {
  owner: repoInfo.owner,
  repo: repoInfo.repo,
  token: token
}),

activeSection==='debt' && React.createElement(TechDebtTimeline, {
  owner: repoInfo ? repoInfo.owner : '',
  repo: repoInfo ? repoInfo.repo : '',
  token: token,
  currentData: data
}),
```

> **Note on `debt` section:** Unlike most sections, Tech Debt can render even without `repoInfo` for the local stats summary table. Only the D3 chart and historical fetch require a repo. The component handles missing owner/repo gracefully (shows error only if GitHub fetch fails).

### Exact Git Command

```bash
git add client/src/components/WorkspaceHeader.tsx client/src/pages/WorkspaceArea.tsx
git commit -m "feat: wire Releases and Tech Debt sections into workspace"
```
