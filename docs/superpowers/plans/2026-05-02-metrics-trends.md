# Metrics Trend Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Trends tab that re-analyses the last 5 commits and plots quality metrics (health, security, files, functions, test ratio) over time, alongside activity sparklines derived from commit history.

**Architecture:** `trends.ts` fetches the last 5 commit SHAs, re-analyses each using the existing `Parser` + `calcHealth`, and returns `TrendSnapshot[]`; `buildActivityPoints()` groups existing commits by week for sparklines; `MetricsTrendChart.tsx` renders both a D3 multi-line quality chart and inline-SVG activity bars; `WorkspaceArea.tsx` triggers the background fetch after analysis and renders the chart in a new Trends tab.

**Tech Stack:** React, TypeScript, D3 v7 (already installed), GitHub API (`/git/trees/{sha}?recursive=1`), existing `Parser` and `calcHealth` from codebase.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `client/src/lib/trends.ts` | Create | `fetchTrendData()`, `buildActivityPoints()`, `TrendSnapshot`, `ActivityPoint` types |
| `client/src/components/MetricsTrendChart.tsx` | Create | D3 quality line chart + inline-SVG activity sparklines |
| `client/src/components/WorkspaceHeader.tsx` | Modify | Add `{ id: 'trends', label: 'Trends' }` to `NAV_TABS` |
| `client/src/pages/WorkspaceArea.tsx` | Modify | State, background fetch trigger, render MetricsTrendChart |

---

## Task 1: Create `trends.ts`

**Files:**
- Create: `client/src/lib/trends.ts`

- [ ] **Step 1: Create the file**

Create `client/src/lib/trends.ts`:

```typescript
import { GitHub, calcHealth } from './github';
import { Parser } from './parser';

export interface TrendSnapshot {
  sha: string;
  shortSha: string;
  date: string;
  author: string;
  message: string;
  healthScore: number;
  healthGrade: string;
  securityCount: number;
  fileCount: number;
  functionCount: number;
  testRatio: number; // 0–100 percent
}

export interface ActivityPoint {
  weekLabel: string;
  commitCount: number;
  authorCount: number;
}

const CODE_EXTS = new Set([
  'ts','tsx','js','jsx','py','go','rb','java','cs','cpp','c','rs','swift','kt','php',
]);

function isCodeFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CODE_EXTS.has(ext);
}

function isTestFile(name: string): boolean {
  return /test|spec|__tests__/i.test(name);
}

async function analyseCommit(
  sha: string,
  owner: string,
  repo: string,
  gh: typeof GitHub,
): Promise<Omit<TrendSnapshot, 'sha' | 'shortSha' | 'date' | 'author' | 'message'> | null> {
  try {
    // 1. Fetch file tree at this commit SHA
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`;
    const treeData = await gh.fetch(treeUrl);
    const allPaths: string[] = (treeData.tree ?? [])
      .filter((n: any) => n.type === 'blob' && isCodeFile(n.path))
      .map((n: any) => n.path as string);

    // 2. Cap at 50 files — prefer shallower paths (closer to root = more important)
    const paths = allPaths
      .sort((a, b) => a.split('/').length - b.split('/').length)
      .slice(0, 50);

    // 3. Fetch file contents in parallel (using SHA as the branch ref)
    const fileObjs = await Promise.all(
      paths.map(async (p) => {
        try {
          const content = await gh.getFile(owner, repo, p, sha);
          if (!content) return null;
          const analyzed = Parser.analyzeFile(content, p.split('/').pop() ?? p, p);
          return analyzed;
        } catch {
          return null;
        }
      })
    );

    const analyzed = fileObjs.filter(Boolean) as any[];
    if (analyzed.length === 0) return null;

    const allFns = analyzed.flatMap((f: any) => f.functions ?? []);
    const securityIssues = Parser.detectSecurity(analyzed);
    const testFiles = analyzed.filter((f: any) => isTestFile(f.name ?? f.path ?? ''));

    // 4. Build minimal data object to feed into calcHealth
    const mini = {
      files: analyzed,
      functions: allFns,
      connections: [],
      issues: [],
      securityIssues,
      stats: {
        files: analyzed.length,
        functions: allFns.length,
        connections: 0,
        dead: 0,
      },
    };

    const health = calcHealth(mini);

    return {
      healthScore: health.score,
      healthGrade: health.grade,
      securityCount: securityIssues.filter((i: any) => i.severity === 'high').length,
      fileCount: analyzed.length,
      functionCount: allFns.length,
      testRatio: analyzed.length > 0
        ? Math.round((testFiles.length / analyzed.length) * 100)
        : 0,
    };
  } catch {
    return null;
  }
}

export async function fetchTrendData(
  commits: any[],
  owner: string,
  repo: string,
  gh: typeof GitHub,
): Promise<TrendSnapshot[]> {
  // Take last 5 commits (most recent first from GitHub API, reverse to oldest-first)
  const recent = commits.slice(0, 5).reverse();

  const snapshots = await Promise.all(
    recent.map(async (c: any): Promise<TrendSnapshot | null> => {
      const sha: string = c.sha ?? '';
      if (!sha) return null;
      const metrics = await analyseCommit(sha, owner, repo, gh);
      if (!metrics) return null;
      return {
        sha,
        shortSha: sha.slice(0, 7),
        date: c.commit?.author?.date ?? '',
        author: c.commit?.author?.name ?? '',
        message: (c.commit?.message ?? '').split('\n')[0],
        ...metrics,
      };
    })
  );

  return snapshots.filter(Boolean) as TrendSnapshot[];
}

export function buildActivityPoints(commits: any[]): ActivityPoint[] {
  const byWeek = new Map<string, { commits: number; authors: Set<string> }>();

  for (const c of commits) {
    const date = c.commit?.author?.date;
    if (!date) continue;
    const d = new Date(date);
    // ISO week start (Monday)
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    const key = monday.toISOString().slice(0, 10);
    const label = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!byWeek.has(key)) byWeek.set(key, { commits: 0, authors: new Set() });
    const w = byWeek.get(key)!;
    w.commits++;
    const author = c.commit?.author?.name;
    if (author) w.authors.add(author);
  }

  return Array.from(byWeek.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12) // last 12 weeks
    .map(([, v], i, arr) => {
      const d = new Date(Array.from(byWeek.keys()).sort()[i]);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        weekLabel: label,
        commitCount: v.commits,
        authorCount: v.authors.size,
      };
    });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i "trends"
```

Expected: no output (no errors for trends.ts).

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow"
git add client/src/lib/trends.ts
git commit -m "feat: add trends.ts library (fetchTrendData, buildActivityPoints)"
```

---

## Task 2: Create `MetricsTrendChart.tsx`

**Files:**
- Create: `client/src/components/MetricsTrendChart.tsx`

- [ ] **Step 1: Create the component**

Create `client/src/components/MetricsTrendChart.tsx`:

```typescript
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { TrendSnapshot, ActivityPoint } from '../lib/trends';

interface Props {
  snapshots: TrendSnapshot[];
  activityPoints: ActivityPoint[];
  loading: boolean;
  onCommitClick: (sha: string) => void;
}

type MetricKey = 'healthScore' | 'securityCount' | 'fileCount' | 'functionCount' | 'testRatio';

const METRICS: { key: MetricKey; label: string; color: string }[] = [
  { key: 'healthScore',    label: 'Health Score',    color: '#3fb950' },
  { key: 'securityCount',  label: 'Security Issues', color: '#f85149' },
  { key: 'fileCount',      label: 'File Count',      color: '#58a6ff' },
  { key: 'functionCount',  label: 'Functions',       color: '#e3b341' },
  { key: 'testRatio',      label: 'Test Ratio %',    color: '#bc8cff' },
];

function ActivitySparklines({ points }: { points: ActivityPoint[] }) {
  if (points.length === 0) return null;
  const maxC = Math.max(...points.map(p => p.commitCount), 1);
  const maxA = Math.max(...points.map(p => p.authorCount), 1);
  const barW = 20;
  const gap = 4;
  const h = 40;
  const totalW = points.length * (barW + gap);

  function Bars({ values, max, color }: { values: number[]; max: number; color: string }) {
    return (
      <svg width={totalW} height={h} style={{ display: 'block' }}>
        {values.map((v, i) => {
          const bh = Math.max(2, Math.round((v / max) * h));
          return (
            <rect
              key={i}
              x={i * (barW + gap)}
              y={h - bh}
              width={barW}
              height={bh}
              fill={color}
              opacity={0.7}
              rx={2}
            />
          );
        })}
      </svg>
    );
  }

  return (
    <div style={{ marginBottom: '28px' }}>
      <h3 style={{ color: '#f0f6fc', fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px' }}>
        Activity — Last {points.length} Weeks
      </h3>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#8b949e', fontSize: '0.75rem', marginBottom: '4px' }}>Commits / week</div>
          <Bars values={points.map(p => p.commitCount)} max={maxC} color="#58a6ff" />
          <div style={{ display: 'flex', gap: gap, marginTop: '4px' }}>
            {points.map((p, i) => (
              <div key={i} style={{ width: barW, fontSize: '0.6rem', color: '#484f58', textAlign: 'center', overflow: 'hidden' }}>
                {p.weekLabel.split(' ')[1]}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ color: '#8b949e', fontSize: '0.75rem', marginBottom: '4px' }}>Authors / week</div>
          <Bars values={points.map(p => p.authorCount)} max={maxA} color="#bc8cff" />
        </div>
      </div>
    </div>
  );
}

function QualityChart({
  snapshots,
  activeMetrics,
  onCommitClick,
}: {
  snapshots: TrendSnapshot[];
  activeMetrics: Set<MetricKey>;
  onCommitClick: (sha: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; snap: TrendSnapshot } | null>(null);

  useEffect(() => {
    if (!svgRef.current || snapshots.length < 2) return;
    const el = svgRef.current;
    d3.select(el).selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 50, left: 45 };
    const W = el.clientWidth || 600;
    const H = 260;
    const w = W - margin.left - margin.right;
    const h = H - margin.top - margin.bottom;

    const svg = d3.select(el)
      .attr('width', W)
      .attr('height', H)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, snapshots.length - 1]).range([0, w]);

    // Grid lines
    svg.append('g')
      .selectAll('line')
      .data(d3.range(0, snapshots.length))
      .join('line')
      .attr('x1', (d: number) => x(d))
      .attr('x2', (d: number) => x(d))
      .attr('y1', 0)
      .attr('y2', h)
      .attr('stroke', '#21262d')
      .attr('stroke-dasharray', '3,3');

    // X axis labels
    svg.append('g')
      .attr('transform', `translate(0,${h})`)
      .selectAll('text')
      .data(snapshots)
      .join('text')
      .attr('x', (_: any, i: number) => x(i))
      .attr('y', 16)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8b949e')
      .attr('font-size', '0.68rem')
      .text((d: TrendSnapshot) => d.shortSha);

    svg.append('g')
      .attr('transform', `translate(0,${h})`)
      .selectAll('text.date')
      .data(snapshots)
      .join('text')
      .attr('class', 'date')
      .attr('x', (_: any, i: number) => x(i))
      .attr('y', 28)
      .attr('text-anchor', 'middle')
      .attr('fill', '#484f58')
      .attr('font-size', '0.62rem')
      .text((d: TrendSnapshot) => d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

    // Draw one line per active metric
    const visibleMetrics = METRICS.filter(m => activeMetrics.has(m.key));

    for (const metric of visibleMetrics) {
      const values = snapshots.map(s => s[metric.key] as number);
      const yMin = Math.min(...values);
      const yMax = Math.max(...values);
      const yPad = yMax === yMin ? 5 : 0;
      const y = d3.scaleLinear().domain([Math.max(0, yMin - yPad), yMax + yPad]).range([h, 0]);

      const line = d3.line<TrendSnapshot>()
        .x((_: TrendSnapshot, i: number) => x(i))
        .y((d: TrendSnapshot) => y(d[metric.key] as number))
        .curve(d3.curveMonotoneX);

      svg.append('path')
        .datum(snapshots)
        .attr('fill', 'none')
        .attr('stroke', metric.color)
        .attr('stroke-width', 2)
        .attr('opacity', 0.85)
        .attr('d', line);

      // Dots
      svg.selectAll(`.dot-${metric.key}`)
        .data(snapshots)
        .join('circle')
        .attr('class', `dot-${metric.key}`)
        .attr('cx', (_: TrendSnapshot, i: number) => x(i))
        .attr('cy', (d: TrendSnapshot) => y(d[metric.key] as number))
        .attr('r', 5)
        .attr('fill', metric.color)
        .attr('stroke', '#0d1117')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseenter', function(event: MouseEvent, d: TrendSnapshot) {
          d3.select(this).attr('r', 7);
          const rect = (svgRef.current as SVGSVGElement).getBoundingClientRect();
          setTooltip({ x: event.clientX - rect.left, y: event.clientY - rect.top - 10, snap: d });
        })
        .on('mouseleave', function() {
          d3.select(this).attr('r', 5);
          setTooltip(null);
        })
        .on('click', (_: MouseEvent, d: TrendSnapshot) => onCommitClick(d.sha));
    }
  }, [snapshots, activeMetrics, onCommitClick]);

  if (snapshots.length < 2) {
    return <p style={{ color: '#8b949e', fontSize: '0.85rem' }}>Not enough commit history to show quality trends (need ≥ 2 commits).</p>;
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', overflow: 'visible' }} />
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x + 12,
          top: tooltip.y,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.78rem',
          color: '#f0f6fc',
          pointerEvents: 'none',
          zIndex: 100,
          minWidth: '200px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontFamily: 'monospace', color: '#58a6ff', marginBottom: '4px' }}>{tooltip.snap.shortSha}</div>
          <div style={{ color: '#8b949e', marginBottom: '2px', fontSize: '0.72rem' }}>
            {tooltip.snap.date ? new Date(tooltip.snap.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''} · {tooltip.snap.author}
          </div>
          <div style={{ color: '#c9d1d9', marginBottom: '8px', fontStyle: 'italic', fontSize: '0.72rem' }}>"{tooltip.snap.message}"</div>
          {METRICS.map(m => (
            <div key={m.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
              <span style={{ color: m.color }}>{m.label}</span>
              <span style={{ fontFamily: 'monospace' }}>{tooltip.snap[m.key]}{m.key === 'testRatio' ? '%' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonChart() {
  return (
    <div style={{ padding: '16px 0' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 12, background: '#21262d', borderRadius: 4, marginBottom: 10, width: `${60 + i * 10}%` }} />
      ))}
      <div style={{ height: 180, background: '#161b22', borderRadius: 8, marginTop: 12 }} />
    </div>
  );
}

export default function MetricsTrendChart({ snapshots, activityPoints, loading, onCommitClick }: Props) {
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(
    new Set(['healthScore', 'securityCount'])
  );

  function toggleMetric(key: MetricKey) {
    setActiveMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // always keep at least one
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div style={{ padding: '24px', marginTop: '8px' }}>
      <h2 style={{ color: '#f0f6fc', marginBottom: '20px' }}>Trends</h2>

      <ActivitySparklines points={activityPoints} />

      <div style={{ borderTop: '1px solid #21262d', paddingTop: '20px' }}>
        <h3 style={{ color: '#f0f6fc', fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Quality — Last {loading ? '…' : snapshots.length} Commits
          {loading && <span style={{ color: '#8b949e', fontSize: '0.78rem', fontWeight: 400 }}>analysing…</span>}
        </h3>

        {/* Toggle chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {METRICS.map(m => {
            const on = activeMetrics.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                style={{
                  background: on ? `${m.color}22` : 'transparent',
                  border: `1px solid ${on ? m.color : '#30363d'}`,
                  color: on ? m.color : '#8b949e',
                  borderRadius: '20px',
                  padding: '3px 12px',
                  fontSize: '0.78rem',
                  fontWeight: on ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {loading
          ? <SkeletonChart />
          : <QualityChart snapshots={snapshots} activeMetrics={activeMetrics} onCommitClick={onCommitClick} />
        }
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i "MetricsTrend\|trends"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow"
git add client/src/components/MetricsTrendChart.tsx
git commit -m "feat: add MetricsTrendChart component (D3 quality lines + activity sparklines)"
```

---

## Task 3: Add Trends tab to `WorkspaceHeader.tsx`

**Files:**
- Modify: `client/src/components/WorkspaceHeader.tsx`

- [ ] **Step 1: Add `trends` to `NAV_TABS`**

Find in `client/src/components/WorkspaceHeader.tsx`:
```typescript
  { id: 'debt',         label: 'Tech Debt' },
  { id: 'settings',     label: 'Settings' },
```

Replace with:
```typescript
  { id: 'debt',         label: 'Tech Debt' },
  { id: 'trends',       label: 'Trends' },
  { id: 'settings',     label: 'Settings' },
```

Also add `'trends'` to the `requiresData` array in the same file. Find:
```typescript
          const requiresData = ['branches','contributors','commits','pullrequests','database','migrations','security','radar','ownership','releases','debt'].includes(tab.id);
```

Replace with:
```typescript
          const requiresData = ['branches','contributors','commits','pullrequests','database','migrations','security','radar','ownership','releases','debt','trends'].includes(tab.id);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i "WorkspaceHeader"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow"
git add client/src/components/WorkspaceHeader.tsx
git commit -m "feat: add Trends tab to workspace navigation"
```

---

## Task 4: Wire into `WorkspaceArea.tsx`

**Files:**
- Modify: `client/src/pages/WorkspaceArea.tsx`

`WorkspaceArea.tsx` uses `@ts-nocheck` and `var _x = useState()` patterns throughout.

### Step 4a — Imports

- [ ] **Step 1: Add imports after the existing osv/VulnerabilityScanner imports**

Find:
```typescript
import { scanDependencies } from '../lib/osv';
```

Add after it:
```typescript
import MetricsTrendChart from '../components/MetricsTrendChart';
import { fetchTrendData, buildActivityPoints } from '../lib/trends';
```

### Step 4b — Add state

- [ ] **Step 2: Add trend state after `vulnError` state**

Find:
```typescript
    var _vulnErr=useState<any>(null),vulnError=_vulnErr[0],setVulnError=_vulnErr[1];
    // DB Schema state
```

Add after it:
```typescript
    var _tsnap=useState<any>([]),trendSnapshots=_tsnap[0],setTrendSnapshots=_tsnap[1];
    var _tactv=useState<any>([]),activityPoints=_tactv[0],setActivityPoints=_tactv[1];
    var _tload=useState<any>(false),trendLoading=_tload[0],setTrendLoading=_tload[1];
```

### Step 4c — Trigger fetch after both analysis paths

There are two `setData(dataObj)` calls. Both already have the vuln scan trigger added. Add the trend fetch right after the vuln block in each.

- [ ] **Step 3: Add trend fetch after first vuln block (GitHub path, ~line 668)**

Find the first vuln block (after `setData(dataObj)` in GitHub path):
```typescript
                else{setVulnError('No supported manifest files found (package.json, requirements.txt, go.mod, Gemfile.lock)');}
                // Save to bookmarks
```

Add after `else{setVulnError(...)}`:
```typescript
                setTrendSnapshots([]);setActivityPoints(buildActivityPoints(commits||[]));
                if(p&&p.owner&&p.repo){setTrendLoading(true);fetchTrendData(commits||[],p.owner,p.repo,gh).then(function(snaps: any){setTrendSnapshots(snaps);setTrendLoading(false);}).catch(function(){setTrendLoading(false);});}
```

Note: `commits` and `p` and `gh` are variables already in scope in that closure (the GitHub analysis path uses `gh` as the GitHub instance and `p` as the `{owner, repo}` object, and `commits` is the fetched commit array).

To confirm they are in scope, check what variables are used around line 668 in the file. If `commits` is not available (the main analysis path may not have fetched commits yet), fetch them inline:

Replace the trend trigger with:
```typescript
                setTrendSnapshots([]);
                if(p&&p.owner&&p.repo){
                    setTrendLoading(true);
                    gh.getCommits(p.owner,p.repo,undefined,5).then(function(recentCommits: any){
                        setActivityPoints(buildActivityPoints(recentCommits||[]));
                        return fetchTrendData(recentCommits||[],p.owner,p.repo,gh);
                    }).then(function(snaps: any){setTrendSnapshots(snaps);setTrendLoading(false);}).catch(function(){setTrendLoading(false);});
                }
```

- [ ] **Step 4: Add trend fetch after second `setData` (local files path, ~line 1014)**

Find in the local files path (after the second vuln block):
```typescript
            else{setVulnError('No supported manifest files found (package.json, requirements.txt, go.mod, Gemfile.lock)');}
            setExpandedPaths(new Set(['']));
```

Add between those two lines:
```typescript
            setTrendSnapshots([]);setActivityPoints([]);setTrendLoading(false);
```

(Local folders have no GitHub commits to analyse — reset silently.)

### Step 4d — Render in the Trends section

- [ ] **Step 5: Add the Trends section render**

Find in the render output where other sections like `radar` are rendered. Look for:
```typescript
        activeSection==='radar' && repoInfo && React.createElement(StaleCodeRadar, {
```

Add the Trends section **before** that line:
```typescript
        activeSection==='trends'&&React.createElement(MetricsTrendChart,{
            snapshots:trendSnapshots,
            activityPoints:activityPoints,
            loading:trendLoading,
            onCommitClick:function(sha: any){setActiveSection('commits');},
        }),
```

- [ ] **Step 6: Verify TypeScript compiles (no new errors beyond pre-existing)**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
node_modules/.bin/tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v "BlameHeatmap\|VirtualizedRepoTree\|DatabaseVisualizer\|RepoSelector\|diffWorker" | grep "error" | head -10
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow"
git add client/src/pages/WorkspaceArea.tsx
git commit -m "feat: wire MetricsTrendChart into WorkspaceArea (background fetch + trends tab)"
```

---

## Task 5: End-to-End Verification

- [ ] **Step 1: Start dev server**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow\client"
npm run dev
```

Open `http://localhost:5173`.

- [ ] **Step 2: Verify Trends tab appears after analysis**

1. Analyze `https://github.com/expressjs/express` (≥ 5 commits, small repo)
2. After analysis loads, the **Trends** tab should appear in the nav (enabled, not greyed out)

- [ ] **Step 3: Verify activity sparklines**

Click **Trends** tab immediately after analysis — activity sparklines (commits/week + authors/week bars) should render instantly.

- [ ] **Step 4: Verify quality chart loads**

Within ~10–15 seconds the loading skeleton should be replaced by 5 data points on the line chart. Default metrics **Health Score** and **Security Issues** should be visible as two colored lines.

- [ ] **Step 5: Verify toggle chips**

Click **File Count** chip — a third line appears. Click **Health Score** chip to deselect — that line disappears. (Cannot deselect the last active metric.)

- [ ] **Step 6: Verify tooltip and click**

Hover a dot — tooltip shows shortSha, date, author, message, all metric values. Click a dot — navigates to **Commits** tab.

- [ ] **Step 7: Final commit**

```bash
cd "c:\Users\RamanSharma\OneDrive - GNA-Energy\Desktop\codeflow"
git add -A
git commit -m "feat: complete Metrics Trend Charts feature"
```
