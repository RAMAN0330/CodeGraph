# UX Polish — Group 4 Design Spec

## Goal
Add three UX features that make CodeFlow feel like a complete, polished tool: persistent repo bookmarks, language-aware diff syntax highlighting, and a fast in-memory command palette search.

## Architecture
All three features are purely client-side. No new API endpoints or server changes required. Data comes from already-analyzed state (`data.files`, `data.functions`) or `localStorage`. highlight.js is the only new dependency.

## Tech Stack
- React 18 + TypeScript (// @ts-nocheck style, React.createElement)
- highlight.js (browser bundle, ~50kb gzip)
- localStorage for bookmark persistence
- Existing GitHub API data already in WorkspaceArea state

---

## Feature 1: Bookmarks / Saved Repos

### Storage
- Key: `cf_bookmarks` in `localStorage`
- Value: JSON object keyed by `owner/repo` string
- Shape per entry:
  ```json
  {
    "url": "https://github.com/owner/repo",
    "lastAnalyzed": "2026-05-01T10:00:00.000Z",
    "pinned": false,
    "stats": { "files": 42, "language": "TypeScript", "functions": 310 }
  }
  ```
- Max 20 entries. On overflow, drop oldest unpinned entry.

### Behavior
- **Auto-save:** After every successful `analyze()` call, write the repo to localStorage with current timestamp and stats from `data.stats`.
- **Dropdown UI:** Clock icon button in WorkspaceHeader, right of the search bar. Opens a floating dropdown listing pinned repos first, then recent. Each row: `owner/repo` name, language badge, relative time ("3d ago"), pin toggle button.
- **Click to re-analyze:** Clicking a bookmark row sets `repoUrl` and calls `onAnalyze()`.
- **Pin toggle:** Star/pin icon on each row. Pinned repos appear at top, never auto-evicted.
- **Remove:** X button on hover removes entry from localStorage.

### Files
- Create: `client/src/components/BookmarkDropdown.tsx`
- Create: `client/src/lib/bookmarks.ts` (read/write/evict logic)
- Modify: `client/src/components/WorkspaceHeader.tsx` (add bookmark button + dropdown)
- Modify: `client/src/pages/WorkspaceArea.tsx` (call `saveBookmark()` after successful analyze)

---

## Feature 2: Diff Syntax Highlighter

### Approach
- Add `highlight.js` via npm: `npm install highlight.js`
- Import only the languages needed at runtime — detect from diff header line (`diff --git a/foo.ts b/foo.ts` → `.ts` → `typescript`)
- Apply token highlighting per line inside BranchDiff's existing line renderer
- The green/red background for added/deleted lines is preserved — syntax colors sit on top as `color` per token span
- Use GitHub Dark theme from highlight.js (`github-dark.min.css`) to match CodeFlow palette

### Language detection
Parse the `diff --git a/<path>` header line in each diff hunk. Map extension → highlight.js language name:
```
.ts/.tsx → typescript
.js/.jsx → javascript
.py      → python
.go      → go
.java    → java
.css     → css
.html    → html
.json    → json
.md      → markdown
(unknown) → plaintext (no highlighting)
```

### Files
- Modify: `client/src/components/BranchDiff.tsx` (add hljs import, language detection, token rendering)
- Modify: `client/package.json` (add highlight.js dependency)

---

## Feature 3: Command Palette Search (Ctrl+K)

### Trigger
- `Ctrl+K` (Windows/Linux) or `Cmd+K` (Mac) anywhere in the workspace
- Also a search icon button in WorkspaceHeader (right side, always visible)
- Disabled (no-op) when `!hasData`

### Modal UI
- Full-screen dark overlay (`rgba(0,0,0,0.6)`)
- Centered floating panel: `480px` wide, `border-radius:12px`, glassmorphism, GitHub dark
- Text input at top, autofocused on open
- Results list below, max 8 visible, scrollable
- `Escape` or click-outside closes
- Arrow keys navigate results, `Enter` selects

### Search scope (all in-memory, no server calls)
1. **Files** — search `data.files[].path` — result shows file path, file icon, language badge
2. **Functions** — search `data.functions[].name` + `data.functions[].file` — result shows fn name, file path
3. **Folders** — search unique folder names from `data.files[].folder`

Results grouped by type: Files → Functions → Folders. Fuzzy match: `query` chars must appear in order in the string (simple subsequence match, no external lib needed).

### On select
- **File selected:** Sets active section to `explorer`, sets `selected` state to that file object
- **Function selected:** Same as file but scrolls to that function in the detail panel
- **Folder selected:** Sets active section to `explorer`, applies folder filter

### Files
- Create: `client/src/components/CommandPalette.tsx`
- Modify: `client/src/pages/WorkspaceArea.tsx` (add `showPalette` state, Ctrl+K listener, render CommandPalette, pass `onFileSelect`/`onFolderSelect` handlers)
- Modify: `client/src/components/WorkspaceHeader.tsx` (add search icon button that triggers palette open)

---

## Error Handling
- **Bookmarks:** All localStorage calls wrapped in try/catch — fail silently, never crash the app
- **highlight.js:** If language detection fails or hljs throws, fall back to plain text rendering
- **Command palette:** If `data` is null/incomplete, palette shows empty state "Analyze a repo first"

## Out of Scope
- Server-side bookmark sync
- Full-text code search (searching inside file contents)
- Regex search
- Keyboard shortcut customization
