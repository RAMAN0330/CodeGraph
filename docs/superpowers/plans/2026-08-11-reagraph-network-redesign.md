# Reagraph Network Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreadable Sigma network with a spaced, interactive Reagraph visualization while preserving workspace behavior.

**Architecture:** Keep graph normalization independent from rendering. `LegacyWorkspaceEngine` owns data and workspace state; a focused `ReagraphCanvas` owns WebGL rendering, layout, camera actions, hover, and selection events.

**Tech Stack:** React 19, TypeScript, Reagraph WebGL, Node test runner, Vite.

## Global Constraints

- Replace only the `Graph` view renderer.
- Preserve folder filtering, colors, call-flow mode, tooltips, zoom controls, stage clearing, node selection, and the right inspector.
- Every node must remain visible; labels use collision-aware progressive disclosure.
- Do not change Treemap, Matrix, Tree, Flow, Cluster, or Bundle.

---

### Task 1: Reagraph Data Normalization

**Files:**
- Modify: `client/src/features/workspace/services/sigmaGraph.ts`
- Modify: `tests/sigma-graph.test.mjs`

**Interfaces:**
- Consumes: normalized workspace nodes and links.
- Produces: `buildReagraphData(nodes, links): { nodes, edges }` with stable IDs and bounded sizes.

- [ ] **Step 1: Write the failing normalization test**

Assert that two valid duplicate links get unique edge IDs, dangling/self edges are removed, node sizes are bounded, and node metadata is retained.

- [ ] **Step 2: Verify the test fails**

Run: `node --test tests/sigma-graph.test.mjs`

Expected: failure because `buildReagraphData` is not exported.

- [ ] **Step 3: Implement the minimal normalizer**

Map nodes to `{ id, label, size, fill, data }`; map valid links to `{ id: source:target:index, source, target, label, data }`.

- [ ] **Step 4: Verify the test passes**

Run: `node --test tests/sigma-graph.test.mjs`

Expected: all graph normalization assertions pass.

### Task 2: Replace Sigma Renderer

**Files:**
- Create: `client/src/features/workspace/components/ReagraphCanvas.tsx`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`
- Modify: `client/src/index.css`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`
- Delete: `client/src/features/workspace/components/SigmaGraphCanvas.tsx`

**Interfaces:**
- Consumes: `{ nodes, links, showLabels, onNodeClick, onStageClick, onTooltip }`.
- Produces: ref methods `zoomIn()`, `zoomOut()`, `reset()`, and `fit()`.

- [ ] **Step 1: Install Reagraph and remove Sigma-only packages**

Run: `npm --prefix client uninstall sigma graphology graphology-layout-forceatlas2 && npm --prefix client install reagraph`

- [ ] **Step 2: Implement `ReagraphCanvas`**

Use `GraphCanvas` with force-directed layout, increased node separation, bounded sizing, cluster colors, progressive labels, hover emphasis, selected-node emphasis, and stable callbacks to the existing inspector.

- [ ] **Step 3: Wire existing graph controls**

Replace `SigmaGraphCanvas` in `LegacyWorkspaceEngine`; preserve normalized inputs, call-flow behavior, tooltips, stage clear, and right-panel selection.

- [ ] **Step 4: Add empty and renderer-failure states**

Render a centered message when there are no visible nodes and an error boundary fallback if WebGL initialization fails.

- [ ] **Step 5: Build and run regressions**

Run: `npm --prefix client run build`

Run: `node --test tests/sigma-graph.test.mjs tests/graphify-adapter.test.mjs`

Run: `node --test tests/workspace-ui.test.mjs`

Expected: build succeeds and all focused tests pass.

### Task 3: Production and Visual Verification

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the supplied dense-graph screenshot and the running workspace.
- Produces: a passing visual QA report and rebuilt production client.

- [ ] **Step 1: Rebuild the client container**

Run: `SESSION_SECRET=unused-client-rebuild docker compose -f docker-compose.production.yml up -d --no-deps --build client`

- [ ] **Step 2: Verify interactions in the in-app browser**

Check Graph tab rendering, distinct nodes, progressive labels, zoom, fit, hover, node selection, no white screen, stage clearing, folder filtering, and call-flow mode.

- [ ] **Step 3: Compare screenshots and write QA**

Record viewport, interaction state, visible differences, and fixes in `design-qa.md`. Require `final result: passed` with no P0/P1/P2 issues.

- [ ] **Step 4: Run final checks**

Run: `git diff --check`

Run: `npm --prefix client run build`

Expected: clean diff check and successful production build.
