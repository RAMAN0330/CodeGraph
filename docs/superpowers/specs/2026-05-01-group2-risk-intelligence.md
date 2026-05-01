# Group 2 — Risk & Intelligence Design Spec

## Goal
Add three risk/intelligence features: Stale Code Radar (files that are old + heavily depended on), Code Ownership Map (auto-inferred from git history), and Extended PR Risk (revert history per file).

## Architecture
All purely client-side. Stale Code Radar and Code Ownership Map cross-reference already-analyzed `data` (files, connections) with GitHub API commit dates. PR Risk extension adds revert detection to existing PR section. No new server endpoints.

## Tech Stack
React 18 + TypeScript (// @ts-nocheck), GitHub REST API via existing `GitHub` class, existing `data.files` and `data.connections` from WorkspaceArea analysis.

---

## Feature 1: Stale Code Radar (`radar` tab)

### Logic
1. From `data.files`: get each file's `path`
2. From `data.connections`: count how many other files import each file (in-degree = dependency count)
3. Fetch last commit date per file via `GitHub.getCommits(owner, repo, file.path, 1)` — only for top 20 most-connected files (to stay within rate limits)
4. Compute staleness score: `daysSinceLastCommit * Math.log(1 + inDegree)`
5. Sort descending — top results = highest risk

### UI
- Header: "Stale Code Radar — files that are old AND heavily depended on"
- Table with columns: File | Dependencies (in-degree) | Last Modified | Days Stale | Risk Score (color bar)
- Risk score bar: green→red gradient
- Clicking a file selects it in Explorer
- Loading state while fetching commit dates
- If `!repoInfo`: show "Connect a GitHub repository to use Stale Code Radar"

### Files
- Create: `client/src/components/StaleCodeRadar.tsx`
- Modify: `client/src/components/WorkspaceHeader.tsx` (add `radar` tab)
- Modify: `client/src/pages/WorkspaceArea.tsx` (add radar section render)

---

## Feature 2: Code Ownership Map (`ownership` tab)

### Logic
1. Get unique top-level folders from `data.files` (e.g., `src/components`, `src/lib`)
2. For each folder (max 10), fetch last commit: `GitHub.getCommits(owner, repo, folder, 1)`
3. Extract `author.login` from that commit → this is the "owner" of the folder
4. Build ownership tree: folder → owner login → file count in folder

### UI
- Tree view: each row = folder path, owner avatar initial + login, file count
- Color-coded by owner (same hashing as CommitTimeline)
- If multiple folders have same owner, group them visually
- Export hint: "Add a CODEOWNERS file to enforce ownership"
- If `!repoInfo`: "Connect a GitHub repository to use Code Ownership"

### Files
- Create: `client/src/components/CodeOwnershipMap.tsx`
- Modify: `client/src/components/WorkspaceHeader.tsx` (add `ownership` tab)
- Modify: `client/src/pages/WorkspaceArea.tsx` (add ownership section render)

---

## Feature 3: Extended PR Risk (revert detection)

### Logic
Extension of existing PR section. When a PR is loaded and files are shown:
1. For each changed file in the PR, fetch last 20 commits touching that file: `GitHub.getCommits(owner, repo, file.path, 20)`
2. Count commits whose message starts with "revert" (case-insensitive)
3. Show revert count badge next to each file in the PR diff list

### UI
- In the existing PR review panel, add a "Revert History" column to the changed files list
- Each file row: existing info + orange badge "X reverts" if count > 0
- Tooltip: "This file has been reverted X times in recent history"
- Only shown when PR files are loaded (not on initial PR URL input)

### Files
- Modify: `client/src/pages/WorkspaceArea.tsx` (add revert-count fetch logic in PR section, render badge)

---

## Error Handling
- GitHub API rate limit (403/429): show partial results with "Rate limit reached" notice
- Empty state for all three: clear "no data" messages when repoInfo is null
- Revert detection: if commits fetch fails for a file, show "-" instead of badge

## Out of Scope
- Writing CODEOWNERS file to GitHub
- Historical trend of ownership changes
- Full revert chain analysis
