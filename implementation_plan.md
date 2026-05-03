# Comprehensive Migration of `index.html` into React/Vite

You have asked to migrate the *entire* structure and feature set of the massive 6,300-line `index.html` (which includes advanced AST parsing, D3 visualizations, security scanning, and GitHub API logic) into our modern React application, while keeping everything the same but heavily redesigned.

This is a massive and exciting task. The original `index.html` essentially contains a full IDE-level codebase parser and D3 visualization suite in a single file. We will extract, modularize, and redesign this without losing a single feature.

## User Review Required

> [!WARNING]
> **Massive Refactor:** The original `index.html` contains ~3,000 lines of `Parser` and `GitHub` utility logic, and a ~3,000 line `App` React component holding massive amounts of state. We cannot put this all into a single `.tsx` file in Vite, as it will be unmaintainable. 

> [!IMPORTANT]
> **Design Strategy:** The original app used standard flat colors. As requested, I will **redesign** the UI while porting it, infusing the components with the high-end glassmorphism, dynamic gradients, and custom scrollbars we've established in `index.css`.

## Open Questions

Before I proceed with executing this massive migration, please confirm:
1. **D3 Dependencies:** The original file uses `d3`, `d3-sankey`, `acorn`, `babel-standalone`, and `jsrsasign` via CDN links. I will install these via `npm` so Vite can bundle them efficiently. Is this acceptable?
2. **Component Breakdown:** I plan to split the massive `App` component into smaller, manageable chunks (e.g., `Sidebar.tsx`, `MainCanvas.tsx`, `RightPanel.tsx`). Are you comfortable with this modular approach instead of a single giant file?

## Proposed Changes

---

### Phase 1: Core Logic Extraction (Libraries)

We will pull the heavy-lifting logic out of the UI components and into reusable TypeScript modules.

#### [NEW] `client/src/lib/parser.ts`
- Extract the massive `Parser` object from `index.html`.
- Port all the logic for AST parsing, regex security scans, unused function detection, and file type checking.

#### [NEW] `client/src/lib/github.ts`
- Extract the `GitHub` object responsible for fetching repo trees, resolving blobs, and handling PAT (Personal Access Tokens).

---

### Phase 2: UI Component Modularization

We will break down the giant `App` component into smaller pieces and redesign them with our premium CSS.

#### [NEW] `client/src/components/ui/Icon.tsx`
- Port the SVG icon system from `index.html`.

#### [NEW] `client/src/components/ui/HealthRing.tsx` & `StatusDot.tsx`
- Port the codebase health score indicators, restyling them with glowing CSS effects.

#### [NEW] `client/src/components/visualizations/D3Canvas.tsx`
- Create generic React wrappers for the various D3 renderers (Treemap, Arc, Matrix, Force Graph) currently living inside `index.html`.

---

### Phase 3: Assembly & Redesign

We will reconstruct the main application layout in our Vite app.

#### [MODIFY] `client/src/pages/WorkspaceArea.tsx`
- Replace the current placeholder layout with the full tripartite layout from `index.html`:
  - **Left Sidebar**: Repository file tree, view toggles, health stats.
  - **Main Canvas Area**: The dynamic visualization area with the D3 graphs.
  - **Right Panel**: Contextual information, security hotspots, unused functions, and owner metrics.
- All state management (selected repo, loaded files, analysis results) will be handled here via React Hooks.

## Verification Plan

### Manual Verification
1. I will install the necessary npm packages (`d3`, `acorn`, etc.).
2. I will implement the layout and state management.
3. You will run `npm run dev` and connect a GitHub repository.
4. We will verify that the D3 graphs render, the security/AST parsing works, and the UI looks significantly more premium than the original flat design.
