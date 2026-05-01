# Group 1 — Git History & Visualization Design Spec

## Goal
Add three git-history features: Contributor Insights (who owns what), Commit Timeline (visual git log), and File Blame Heatmap (staleness per file).

## Architecture
All data from GitHub REST API via existing `GitHub` class in `client/src/lib/github.ts`. D3 already imported in WorkspaceArea. New tab `contributors` added to header nav. Blame heatmap shown inside existing file detail panel when a file is selected in Explorer.

## Tech Stack
React 18 + TypeScript (// @ts-nocheck), D3 (already imported), GitHub REST API, existing `GitHub.getCommits()` and `GitHub.getBlame()`.

---

## Feature 1: Contributor Insights (`contributors` tab)

### Data
- Fetch `/repos/{owner}/{repo}/contributors?per_page=30` — returns `[{login, contributions, avatar_url}]`
- Fetch `/repos/{owner}/{repo}/stats/contributors` — returns per-week additions/deletions per author
- Both fetched with authenticated token from `req.user.token` via existing `/api/github/repo` proxy pattern, or directly with token from state

### UI — 3 panels in one view
**Top contributors bar chart (D3):**
- Horizontal bars, sorted by commit count descending
- Each bar: avatar initial circle (colored by login hash), login name, commit count
- Max 10 contributors shown

**Language ownership table:**
- Group `data.files` by folder, find dominant extension per folder
- Cross-reference with contributor data to show "top author" per folder based on most recent commit (use `GitHub.getCommits(owner, repo, folderPath, 1)`)
- Table: Folder | Language | Top Author | Last Commit

**Activity heatmap:**
- 12-week contribution heatmap per contributor (GitHub-style calendar squares)
- Uses stats/contributors weekly data

### Files
- Create: `client/src/components/ContributorInsights.tsx`
- Modify: `client/src/components/WorkspaceHeader.tsx` (add `contributors` tab)
- Modify: `client/src/pages/WorkspaceArea.tsx` (add contributors section render)

---

## Feature 2: Commit Timeline (`commits` tab)

### Data
- Fetch last 50 commits: `GitHub.getCommits(owner, repo, '', 50, currentBranch)`
- Returns `[{sha, commit: {message, author: {name, date}}, author: {login, avatar_url}}]`

### UI
- Vertical list, newest first
- Each row: colored dot (by author), short SHA (7 chars), commit message (truncated 72 chars), author name, relative date
- Author dots colored consistently by hashing login to a palette of 8 colors
- Click commit → show full message + files changed count in a side panel
- Branch selector at top (reuses existing `branches` state)

### Files
- Create: `client/src/components/CommitTimeline.tsx`
- Modify: `client/src/components/WorkspaceHeader.tsx` (add `commits` tab)
- Modify: `client/src/pages/WorkspaceArea.tsx` (add commits section render, fetch commits on tab open)

---

## Feature 3: File Blame Heatmap

### Data
- When a file is selected in Explorer AND repoInfo is available: call `GitHub.getCommits(owner, repo, file.path, 30)`
- Each commit has a date — map line ranges to commit dates (approximation: commits touching the file, sorted by date)
- Color by age: <30d = `#3fb950` (green), 30-90d = `#d29922` (yellow), 90-180d = `#f0883e` (orange), >180d = `#f85149` (red)

### UI
- Thin strip (16px wide) on the left of the file preview panel in Explorer
- Each "block" represents a commit that touched this file, height proportional to recency weight
- Tooltip on hover: author, date, commit message
- Small legend below strip: green→red age scale

### Files
- Create: `client/src/components/BlameHeatmap.tsx`
- Modify: `client/src/pages/WorkspaceArea.tsx` (render BlameHeatmap in file detail panel when file selected and repoInfo exists)

---

## Error Handling
- If GitHub API returns 403/429: show "Rate limit reached — try again later"
- If no contributors data: show "No contributor data available"
- All fetches wrapped in try/catch with error state per component
- Blame heatmap hidden entirely if `repoInfo` is null (local analysis)

## Out of Scope
- Blame line-by-line (too expensive without server-side git)
- Commit graph with branch topology (complex rendering)
- Writing to GitHub (creating commits, PRs)
