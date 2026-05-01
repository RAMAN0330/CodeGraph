# Group 3 — Developer Productivity Design Spec

## Goal
Add two developer productivity features: Release Notes Generator (auto-draft changelogs from commit history between tags) and Tech Debt Timeline (track complexity/issues over recent commits).

## Architecture
Both are purely client-side. Release Notes uses GitHub tags + commits API. Tech Debt Timeline re-runs the existing `Parser.detectPatterns` and counts `issues/deadFunctions` from already-fetched file snapshots across commits — lightweight approximation using commit metadata only (no full re-analysis per commit, as that would be too expensive).

## Tech Stack
React 18 + TypeScript (// @ts-nocheck), D3 (already imported for line chart), GitHub REST API via existing `GitHub` class.

---

## Feature 1: Release Notes Generator (`releases` tab)

### Data
1. Fetch tags: `GET /repos/{owner}/{repo}/tags?per_page=10` → `[{name, commit: {sha}}]`
2. Fetch commits between last two tags: `GitHub.getCompare(owner, repo, tags[1].name, tags[0].name)` → `{commits: [...]}`
3. If fewer than 2 tags: fetch last 30 commits from default branch instead
4. Parse commit messages by conventional commit prefix:
   - `feat:` / `feat(scope):` → Features
   - `fix:` / `fix(scope):` → Bug Fixes
   - `docs:` → Documentation
   - `chore:` / `refactor:` / `perf:` → Other
   - No prefix → Uncategorized

### UI
- Tag selector dropdown at top: "From [tag] to [tag]" (defaults to last two tags)
- Four sections: Features, Bug Fixes, Documentation, Other — each collapsible
- Each entry: bullet with commit message (scope stripped), author, short SHA linked to GitHub
- "Copy Markdown" button → copies formatted markdown changelog to clipboard
- "Copy JSON" button → copies structured JSON
- If no tags: shows commits since beginning grouped by week

### Generated markdown format:
```markdown
## v1.2.0 — 2026-05-01

### Features
- Add command palette with Ctrl+K shortcut (abc1234)
- Wire bookmark save after analyze (def5678)

### Bug Fixes
- Fix null safety in DatabaseVisualizer (ghi9012)

### Other
- Refactor proxy to FastAPI (jkl3456)
```

### Files
- Create: `client/src/components/ReleaseNotesGenerator.tsx`
- Modify: `client/src/components/WorkspaceHeader.tsx` (add `releases` tab)
- Modify: `client/src/pages/WorkspaceArea.tsx` (add releases section render)

---

## Feature 2: Tech Debt Timeline (`debt` tab)

### Data — lightweight approximation (no full re-analysis per commit)
1. Fetch last 10 commits on default branch: `GitHub.getCommits(owner, repo, '', 10)`
2. For each commit, fetch the file tree: `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`
3. Count: total files, `.test.` files (test coverage proxy), files with common debt indicators in filename (`legacy`, `old`, `temp`, `hack`, `todo`)
4. Use existing analysis data for current commit: `data.stats` provides baseline (issues, dead, duplicates, violations)
5. Plot these 5 metrics over time: Total Files, Test Files, Debt Filenames, Dead Functions (current only), Issues (current only)

Note: Dead functions and issues are only available for the current commit (from the live analysis). Historical commits only get file-count metrics. The chart shows full metrics for current commit + file-count trend for past 9.

### UI
- D3 line chart: x-axis = commit date, y-axis = count
- 3 lines: Total Files (blue), Test Files (green), Debt-named Files (orange/red)
- Current commit marked with a dot + tooltip showing full stats (issues, dead, duplicates)
- X-axis: last 10 commit dates
- Below chart: "Debt indicators" table for current snapshot — same as existing Issues panel but grouped as: Dead Code, Duplicates, Architecture Violations, Security Issues
- Hover tooltip on each data point: commit SHA, message, date, values

### Files
- Create: `client/src/components/TechDebtTimeline.tsx`
- Modify: `client/src/components/WorkspaceHeader.tsx` (add `debt` tab)
- Modify: `client/src/pages/WorkspaceArea.tsx` (add debt section render)

---

## Error Handling
- No tags: fall back to recent commits grouped by week
- GitHub API rate limit: show partial data with warning banner
- D3 chart: if fewer than 2 data points, show "Not enough commit history to chart"
- Clipboard copy: fallback to `prompt()` if `navigator.clipboard` unavailable

## Out of Scope
- Full AST re-analysis per historical commit (too expensive client-side)
- Writing release notes back to GitHub Releases API
- Automatic versioning / semver bumping
