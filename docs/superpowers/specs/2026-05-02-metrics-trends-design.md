# Metrics Trend Charts — Design Spec

**Date:** 2026-05-02  
**Status:** Approved

---

## Context

CodeFlow's current analysis is a single point-in-time snapshot. This feature adds a **Trends** tab that answers "is this codebase getting better or worse?" by re-analyzing the last 5 commits and plotting key quality metrics over time, alongside activity trends derived for free from the commit history already fetched.

---

## Goals

1. Fetch and re-analyze the last 5 commit snapshots in the background after the main analysis completes.
2. Plot quality metrics per commit: Health Score (A=100→F=0), Security Issue Count, File Count, Function Count, Test File Ratio (%).
3. Show activity trends from existing commit data: commit frequency per week, unique active authors.
4. D3 multi-line chart, dark GitHub theme, toggle per-metric lines on/off.
5. Hover tooltip on each data point: commit SHA (short), date, author, commit message, exact metric value.
6. Clicking a data point navigates to that commit in the Commits tab.
7. Runs in background — main graph renders immediately, trends populate asynchronously.

---

## Out of Scope

- More than 5 past commits (too many API calls)
- Storing trend history between sessions
- Trend alerts or notifications
- Comparing branches

---

## Data Model

```typescript
interface TrendSnapshot {
  sha: string;          // full commit SHA
  shortSha: string;     // first 7 chars
  date: string;         // ISO date string
  author: string;       // commit author name
  message: string;      // first line of commit message
  healthScore: number;  // 0–100 (A=90+, B=75+, C=60+, D=45+, F<45)
  securityCount: number;
  fileCount: number;
  functionCount: number;
  testRatio: number;    // 0–100 percent of files that are test files
}

interface ActivityPoint {
  weekLabel: string;    // e.g. "Apr 21"
  commitCount: number;
  authorCount: number;
}
```

---

## Architecture

### New Files

**`client/src/lib/trends.ts`**
- Exports `fetchTrendData(commits, owner, repo, token): Promise<TrendSnapshot[]>`
- Takes the commit list already fetched (from `data` object), picks last 5 SHAs
- For each SHA in parallel (Promise.all):
  - Fetches file tree via `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`
  - Filters to code files only (`.ts`, `.tsx`, `.js`, `.py`, `.go`, `.rb`, etc.), caps at 100 files (sorted by size desc)
  - Fetches file contents (up to 50 files, skipping >50KB)
  - Runs `Parser.analyzeFiles(files)` — existing function in `parser.ts`
  - Extracts metrics into `TrendSnapshot`
- Returns array sorted oldest → newest

Also exports `buildActivityPoints(commits): ActivityPoint[]` — pure function, groups commits by ISO week, counts unique authors per week.

**`client/src/components/MetricsTrendChart.tsx`**
- Props: `{ snapshots: TrendSnapshot[], activityPoints: ActivityPoint[], loading: boolean, onCommitClick: (sha: string) => void }`
- Two sections:
  1. **Activity** — small sparkline bar charts (commit count + author count per week), built with inline SVG (no D3 needed, simple bars)
  2. **Quality Trends** — D3 multi-line chart
     - Toggle chips: `Health Score` | `Security Issues` | `File Count` | `Functions` | `Test Ratio`
     - X axis: commit index (0–4), labeled with shortSha + date
     - Y axis: scaled per selected metric (dual-axis if mixing health score with counts)
     - Hover tooltip: floating div showing all values + commit message
     - Click on dot → calls `onCommitClick(sha)`
- Loading state: skeleton placeholder (pulsing gray bars)
- Empty state: "Not enough commit history to show trends" if < 2 snapshots

### Modified Files

**`client/src/pages/WorkspaceArea.tsx`**
- Add state: `trendSnapshots`, `activityPoints`, `trendLoading`
- After `setData(dataObj)`, fire background trend fetch using `repoInfo` + existing `token`
- `NAV_TABS` already has a `trends` slot — wire `activeSection === 'trends'` to render `MetricsTrendChart`
- `onCommitClick` handler: sets `activeSection('commits')` and optionally highlights the commit

---

## Data Flow

```
analyze() completes → setData(dataObj)
  └── fetchTrendData(data.commits[0..4], owner, repo, token)   [trends.ts]
        ├── for each SHA: fetchTree → fetchFiles → Parser.analyzeFiles
        └── setTrendSnapshots(snapshots)
  └── buildActivityPoints(data.commits)                        [trends.ts, sync]
        └── setActivityPoints(points)

activeSection === 'trends'
  └── MetricsTrendChart renders:
        ├── Activity sparklines (activityPoints)
        └── D3 quality line chart (trendSnapshots)
```

---

## UI Specification

```
Trends tab
├── Activity (last 12 weeks)
│     ├── Commits/week:  █▃▅▇▅▃▆█▅▃▅▇
│     └── Authors/week:  ▂▂▃▃▂▃▄▅▄▃▃▄
│
└── Quality (last 5 commits)
      [Health Score] [Security Issues] [File Count] [Functions] [Test Ratio]
      
      100 ┤ •———•
       80 ┤         •
       60 ┤             •———•
       40 ┤
          └──────────────────────────────────
          abc1234  def5678  aaa9999  bbb0001  ccc1234
          Apr 28   Apr 29   Apr 30   May 1    May 2
          
      [Hover tooltip: commit abc1234 · Apr 28 · Jane Doe
       "feat: add auth middleware"
       Health: 92  Security: 0  Files: 124]
```

---

## GitHub API Calls Per Trend Fetch

- 5 × `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1` — fast, returns full tree
- Up to 5 × 50 = 250 file content fetches (raw.githubusercontent.com, no rate limit)
- Total: ~5–10 seconds with parallel fetching

---

## Error Handling

- Per-commit fetch failure → skip that snapshot, include successful ones
- `< 2` valid snapshots → show "Not enough data" message
- Network error on all 5 → show error banner, trends tab shows empty state
- Repos with no commits list in `data` → skip entirely, show "Commit history unavailable"

---

## Verification

1. Analyze a GitHub repo with ≥ 5 commits (e.g., `expressjs/express`)
2. Navigate to **Trends** tab
3. Activity sparklines render immediately (derived from existing data)
4. Quality chart shows loading skeleton, then populates within ~10 seconds
5. Toggle chips hide/show individual metric lines
6. Hover a dot — tooltip shows commit details
7. Click a dot — navigates to Commits tab
