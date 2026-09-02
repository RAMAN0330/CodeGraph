# Grouped Explore Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Explore Cosmos file cloud with a deterministic Sigma.js graph that places readable file nodes inside separated folder containers.

**Architecture:** A pure `groupedGraph` service validates and aggregates repository data, calculates stable folder ranks and node positions, and derives focus state independently of rendering. A lazy `GroupedSigmaGraph` component renders that model with Sigma.js while an aligned overlay draws folder containers and controls. The legacy workspace remains the state owner and connects existing search, filters, inspector, and toolbar actions through a small imperative handle.

**Tech Stack:** React 19, TypeScript, Sigma.js, Graphology, WebGL, HTML/SVG overlays, Node test runner, Vite, Docker.

## Global Constraints

- Change only the Explore Code Graph; leave System Architecture unchanged.
- Render one node per repository file; never render function nodes on the canvas.
- Use deterministic positions and stop continuous simulation after layout.
- Keep filenames readable through collision-aware priority and zoom reveal.
- Keep every hidden filename reachable through search, hover, folder expansion, or zoom.
- Preserve existing file inspector, search, filtering, selection, fit, reset, and stage-clear behavior.
- Reject dangling links and aggregate duplicate source-target edges.
- Show disconnected files separately from the dependency flow.
- Show an explicit compatibility state when WebGL is unavailable; never show a white screen.

---

### Task 1: Deterministic Grouped Graph Model

**Files:**
- Create: `client/src/features/workspace/services/groupedGraph.ts`
- Create: `tests/grouped-graph.test.mjs`

**Interfaces:**
- Consumes: raw workspace file nodes and dependency links.
- Produces: `buildGroupedGraph(nodes, links, options): GroupedGraphModel`, `deriveFocusedGraph(model, selectedId): FocusedGraphState`, and `searchGroupedGraph(model, query): GroupedFileNode[]`.

- [ ] **Step 1: Write the failing model tests**

Create the Vite SSR harness used by `tests/sigma-graph.test.mjs` and test the public contract:

```js
const model = buildGroupedGraph([
  { id: 'client/src/App.tsx', name: 'App.tsx', folder: 'client/src' },
  { id: 'client/src/api.ts', name: 'api.ts', folder: 'client/src' },
  { id: 'server/routes.ts', name: 'routes.ts', folder: 'server' },
  { id: 'README.md', name: 'README.md', folder: '' },
  { id: 'LICENSE', name: 'LICENSE', folder: '' },
], [
  { source: 'client/src/App.tsx', target: 'client/src/api.ts' },
  { source: 'client/src/api.ts', target: 'server/routes.ts' },
  { source: 'client/src/api.ts', target: 'server/routes.ts' },
  { source: 'README.md', target: 'client/src/App.tsx' },
  { source: 'missing.ts', target: 'server/routes.ts' },
]);

assert.deepEqual(model.groups.map(group => group.id), ['client/src', 'server', 'root', 'unconnected']);
assert.equal(model.edges.length, 2);
assert.equal(model.edges.find(edge => edge.source === 'client/src/api.ts').count, 2);
assert.ok(model.groups.find(group => group.id === 'server').rank > model.groups.find(group => group.id === 'client/src').rank);
assert.deepEqual(buildGroupedGraph(inputNodes, inputLinks), buildGroupedGraph(inputNodes, inputLinks));
```

Add focused-neighborhood, case-insensitive filename/path search, root-file handling, dense-folder budget, expansion, and unconnected-file assertions. Use a default visible budget of `40` files per folder.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/grouped-graph.test.mjs`

Expected: FAIL because `groupedGraph.ts` does not exist.

- [ ] **Step 3: Implement the model types and validation**

Define these exact public types:

```ts
export interface GroupedFileNode {
  id: string;
  label: string;
  path: string;
  folderId: string;
  extension: string;
  incoming: number;
  outgoing: number;
  degree: number;
  x: number;
  y: number;
  hiddenByBudget: boolean;
  source: unknown;
}

export interface FolderGroup {
  id: string;
  label: string;
  rank: number;
  x: number;
  y: number;
  width: number;
  height: number;
  totalFiles: number;
  visibleFiles: number;
  expanded: boolean;
  unconnected: boolean;
}

export interface GroupedEdge {
  id: string;
  source: string;
  target: string;
  count: number;
  crossFolder: boolean;
  sourceData: unknown;
}

export interface GroupedGraphModel {
  nodes: GroupedFileNode[];
  visibleNodes: GroupedFileNode[];
  groups: FolderGroup[];
  edges: GroupedEdge[];
}

export interface GroupedGraphOptions {
  expandedFolders?: ReadonlySet<string>;
  visibleBudget?: number;
}
```

Normalize IDs from `node.id || node.path || node.sourceFile`; reject empty and duplicate IDs. Normalize link endpoints from string IDs or `{ id }` values, reject self/dangling links, and aggregate duplicates by `source→target`.

- [ ] **Step 4: Implement deterministic ranking and placement**

Build folder-to-folder edges, calculate dependency ranks using a cycle-safe longest-path pass over strongly connected groups, and use lexical folder order as every tie-breaker. Place groups with constants:

```ts
const GROUP_GAP_X = 180;
const GROUP_GAP_Y = 90;
const GROUP_PADDING = 32;
const GROUP_HEADER = 38;
const NODE_GAP_X = 150;
const NODE_GAP_Y = 42;
const DEFAULT_VISIBLE_BUDGET = 40;
```

Sort files by descending degree and then path. Put budget-hidden nodes after visible nodes without adding them to `visibleNodes`. Place degree-zero files in the `unconnected` group. Return newly allocated arrays so callers cannot mutate cached input.

- [ ] **Step 5: Implement focus and search helpers**

```ts
export function deriveFocusedGraph(model: GroupedGraphModel, selectedId: string | null) {
  const relatedNodeIds = new Set<string>();
  const relatedEdgeIds = new Set<string>();
  if (selectedId) relatedNodeIds.add(selectedId);
  for (const edge of model.edges) {
    if (edge.source === selectedId || edge.target === selectedId) {
      relatedNodeIds.add(edge.source);
      relatedNodeIds.add(edge.target);
      relatedEdgeIds.add(edge.id);
    }
  }
  return { selectedId, relatedNodeIds, relatedEdgeIds };
}

export function searchGroupedGraph(model: GroupedGraphModel, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return model.nodes.filter(node => node.label.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle)).slice(0, 20);
}
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `node --test tests/grouped-graph.test.mjs`

Expected: all grouped graph model tests pass.

- [ ] **Step 7: Commit the model**

```bash
git add client/src/features/workspace/services/groupedGraph.ts tests/grouped-graph.test.mjs
git commit -m "feat: add deterministic grouped graph model"
```

---

### Task 2: Sigma Renderer with Folder Containers and Labels

**Files:**
- Create: `client/src/features/workspace/components/GroupedSigmaGraph.tsx`
- Create: `tests/grouped-sigma-ui.test.mjs`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`

**Interfaces:**
- Consumes: `GroupedGraphModel`, selected node ID, focus mode, and existing workspace callbacks.
- Produces: `GroupedSigmaGraphHandle` with `zoomIn`, `zoomOut`, `fit`, `reset`, `focusNode`, and `refresh` methods.

- [ ] **Step 1: Write failing renderer contract tests**

Use source-level UI tests consistent with `tests/workspace-ui.test.mjs` to assert:

```js
assert.match(source, /new Sigma/);
assert.match(source, /renderLabels/);
assert.match(source, /folder-group-overlay/);
assert.match(source, /onOpenFile\?\./);
assert.match(source, /WebGL is unavailable/);
assert.doesNotMatch(source, /new Graph\(/); // Cosmos renderer is not reused
```

Also assert the imperative handle exposes `focusNode` and folder expansion calls `onToggleFolder`.

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `node --test tests/grouped-sigma-ui.test.mjs`

Expected: FAIL because `GroupedSigmaGraph.tsx` does not exist.

- [ ] **Step 3: Install the minimal renderer dependencies**

Run:

```bash
npm --prefix client install sigma graphology
```

Do not install React Sigma wrappers or ForceAtlas packages. The model already owns stable positions, and a direct Sigma instance keeps the integration small.

- [ ] **Step 4: Build Graphology data and initialize Sigma**

Create the graph only when the model changes:

```ts
const graph = new GraphologyGraph({ multi: false, type: 'directed' });
for (const node of model.visibleNodes) graph.addNode(node.id, {
  x: node.x,
  y: node.y,
  label: node.label,
  size: Math.max(5, Math.min(12, 5 + Math.sqrt(node.degree + 1))),
  color: folderColor(node.folderId),
  path: node.path,
});
for (const edge of model.edges) {
  if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
    size: Math.min(3, .7 + Math.log2(edge.count + 1)),
    color: edge.crossFolder ? '#596675' : '#3f4854',
    type: 'arrow',
  });
}
```

Instantiate Sigma with a transparent stage, label density, label grid, minimum camera ratio, edge arrows, and `renderLabels: true`. Destroy both Sigma and Graphology instances in the effect cleanup.

- [ ] **Step 5: Add synchronized folder overlays**

Render one absolutely positioned `.folder-group-overlay` per group behind the Sigma canvas. On Sigma `afterRender` and camera `updated`, convert each group's model corners using `renderer.graphToViewport` and update overlay transforms without React state.

Each overlay contains the group title, visible/total count, and an `Expand` or `Collapse` button when `totalFiles > 40`. Pointer events remain disabled on the boundary and enabled only on the button.

- [ ] **Step 6: Add label priority and interactions**

Use Sigma node reducers to keep selected/hovered labels visible, fade unrelated nodes in focus state, and hide nodes only when `focusMode === 'selected-only'`. Use an edge reducer to emphasize related edges and add direction arrows.

Wire events:

```ts
renderer.on('clickNode', ({ node }) => {
  onSelectNode(node);
  onOpenFile?.(String(graph.getNodeAttribute(node, 'path')));
});
renderer.on('enterNode', ({ node }) => onTooltip?.(tooltipFor(node)));
renderer.on('leaveNode', () => onTooltip?.(null));
renderer.on('clickStage', () => onStageClick());
```

Implement `focusNode(id)` with `renderer.getCamera().animate(renderer.getNodeDisplayData(id), { duration: 300 })` after validating that the visible graph contains the node.

- [ ] **Step 7: Add WebGL and empty fallbacks**

Before initialization, create a canvas and verify `webgl2 || webgl`. Catch Sigma construction errors. Render these explicit states:

```tsx
if (!model.nodes.length) return <div className="graph-empty-state">No dependency nodes match this filter.</div>;
if (webglError) return <div className="graph-empty-state">WebGL is unavailable. Enable hardware acceleration to view the code graph.</div>;
```

- [ ] **Step 8: Run tests and the client build**

Run:

```bash
node --test tests/grouped-sigma-ui.test.mjs tests/grouped-graph.test.mjs
npm --prefix client run build
```

Expected: tests pass and Vite produces a lazy `GroupedSigmaGraph` chunk.

- [ ] **Step 9: Commit the renderer**

```bash
git add client/package.json client/package-lock.json client/src/features/workspace/components/GroupedSigmaGraph.tsx tests/grouped-sigma-ui.test.mjs
git commit -m "feat: render separated folder graph with sigma"
```

---

### Task 3: Workspace Integration, Search, and Styling

**Files:**
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`
- Modify: `client/src/index.css`
- Modify: `tests/workspace-ui.test.mjs`
- Delete: `client/src/features/workspace/components/CosmosGraphCanvas.tsx`
- Modify: `client/src/features/workspace/services/sigmaGraph.ts` only if no remaining caller uses `buildCosmosGraphData`; otherwise delete it.

**Interfaces:**
- Consumes: `buildGroupedGraph`, `searchGroupedGraph`, `GroupedSigmaGraph`, and existing workspace graph state.
- Produces: the complete grouped Explore experience without changing other sections.

- [ ] **Step 1: Extend failing workspace tests**

Assert that the legacy engine lazy-loads `GroupedSigmaGraph`, no longer imports `CosmosGraphCanvas`, passes `onOpenFile`, stores `expandedGraphFolders`, and renders `All files` / `Focus selected` controls. Assert the existing Graph, Tree, Flow, Cluster, and Bundle selector modes remain present.

- [ ] **Step 2: Run the workspace test and verify RED**

Run: `node --test tests/workspace-ui.test.mjs`

Expected: new grouped renderer assertions fail.

- [ ] **Step 3: Replace the Explore renderer only**

In `LegacyWorkspaceEngine.tsx`:

```ts
const GroupedSigmaGraph = React.lazy(() => import('../components/GroupedSigmaGraph'));
const [expandedGraphFolders, setExpandedGraphFolders] = useState<Set<string>>(new Set());
const [graphFocusMode, setGraphFocusMode] = useState<'all' | 'selected-only'>('all');
```

Build the grouped model from the currently filtered file nodes and links. Pass the existing selected path, tooltip callbacks, stage-clear callback, and `selectFileRef.current(path)` into `GroupedSigmaGraph`. Implement immutable folder toggling:

```ts
onToggleFolder(id) {
  setExpandedGraphFolders(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}
```

Connect existing toolbar zoom, reset, and fit actions to the new imperative handle.

- [ ] **Step 4: Connect search to graph focus**

When an existing search result represents a repository file, clear any folder filter that hides it, expand its parent folder when budget-hidden, and call `groupedGraphRef.current?.focusNode(path)`. Do not create a second search box.

- [ ] **Step 5: Add grouped graph styles**

Add scoped styles for:

```css
.grouped-sigma-graph { position:absolute; inset:0; overflow:hidden; }
.grouped-sigma-stage { position:absolute; inset:0; z-index:2; }
.folder-group-overlay { position:absolute; z-index:1; border:1px solid #3e4652; border-radius:12px; background:rgba(33,37,43,.54); }
.folder-group-heading { position:absolute; top:0; left:0; right:0; height:34px; display:flex; align-items:center; justify-content:space-between; }
.folder-group-overlay.is-muted { opacity:.28; }
.graph-focus-toggle { /* match existing One Dark toolbar controls */ }
```

Add solid label backplates through Sigma label renderer settings. Keep the existing One Dark palette and responsive toolbar behavior.

- [ ] **Step 6: Remove obsolete Cosmos code and dependency**

Delete `CosmosGraphCanvas.tsx`. If `rg "buildCosmosGraphData|sigmaGraph" client/src` finds no caller, delete `sigmaGraph.ts`. Run:

```bash
npm --prefix client uninstall @cosmos.gl/graph
```

Remove the `gl-bench` Vite alias only if `rg "gl-bench" client/src client/package.json` confirms Cosmos was its only consumer.

- [ ] **Step 7: Run workspace and repository tests**

Run:

```bash
node --test tests/workspace-ui.test.mjs tests/grouped-graph.test.mjs tests/grouped-sigma-ui.test.mjs
node --test tests/*.test.mjs
npm --prefix client run build
```

Expected: all tests pass, Explore uses the grouped renderer, and System Architecture tests/build output remain unchanged.

- [ ] **Step 8: Commit the integration**

```bash
git add client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx client/src/index.css client/package.json client/package-lock.json client/vite.config.ts tests/workspace-ui.test.mjs
git add -u client/src/features/workspace/components/CosmosGraphCanvas.tsx client/src/features/workspace/services/sigmaGraph.ts
git commit -m "feat: integrate grouped explore dependency graph"
```

---

### Task 4: Production and Interaction Verification

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: completed grouped Explore implementation.
- Produces: verified production assets and a recorded visual/interaction QA result.

- [ ] **Step 1: Run complete static verification**

Run:

```bash
node --test tests/*.test.mjs
npm --prefix client run build
npm --prefix server run build
go test ./...
git diff --check
```

Run `go test ./...` from `server-go`. Expected: every command exits zero. Record Vite's `GroupedSigmaGraph` chunk size and confirm the removed Cosmos chunk is absent.

- [ ] **Step 2: Rebuild production client**

Run:

```bash
SESSION_SECRET=unused-client-rebuild docker compose -f docker-compose.production.yml up -d --no-deps --build client
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:8080/
```

Expected: Docker build exits zero and HTTP status is `200`.

- [ ] **Step 3: Verify browser interactions**

When a browser backend is available, open the production workspace and verify:

1. folder boundaries and headings remain aligned during zoom and pan;
2. filenames are readable and collision-managed at fit scale;
3. zoom reveals lower-priority filenames;
4. clicking a file opens the existing inspector;
5. focus fades unrelated nodes and emphasizes edge direction;
6. stage click clears focus;
7. search centers a hidden or visible file;
8. expanding a dense folder reveals its hidden count deterministically;
9. unconnected files appear in their separate area;
10. no console error or white screen occurs.

If no browser backend is available, record the browser checks as blocked rather than passed.

- [ ] **Step 4: Update QA evidence**

Append the test/build/container results and browser outcome to `design-qa.md`. Include any unresolved P0/P1 issue. Do not report the feature complete while a P0 issue exists.

- [ ] **Step 5: Commit QA documentation**

```bash
git add design-qa.md
git commit -m "docs: record grouped graph verification"
```
