# Cosmos Graph Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Reagraph with a GPU-layout Cosmos.gl repository graph.

**Architecture:** A pure normalizer produces index-aligned point/link arrays and metadata. A lazy `CosmosGraphCanvas` owns the GPU renderer and maps index-based events back to workspace nodes.

**Tech Stack:** React 19, TypeScript, `@cosmos.gl/graph`, Vite, Node test runner.

## Global Constraints

- Replace only the main Graph view.
- Preserve filtering, colors, Call Flow, selection, inspector, tooltips, and camera controls.
- Keep Tree, Flow, Cluster, and Bundle unchanged.

### Task 1: Indexed Graph Data

**Files:**
- Modify: `client/src/features/workspace/services/sigmaGraph.ts`
- Modify: `tests/sigma-graph.test.mjs`

- [ ] Add a failing test for point order, indexed links, dangling/self-edge removal, colors, sizes, and metadata.
- [ ] Run `node --test tests/sigma-graph.test.mjs` and verify failure.
- [ ] Implement `buildCosmosGraphData(nodes, links)` with typed arrays.
- [ ] Re-run the test and verify it passes.

### Task 2: GPU Renderer Swap

**Files:**
- Create: `client/src/features/workspace/components/CosmosGraphCanvas.tsx`
- Delete: `client/src/features/workspace/components/ReagraphCanvas.tsx`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`
- Modify: `client/src/index.css`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`

- [ ] Replace Reagraph with `@cosmos.gl/graph`.
- [ ] Implement renderer lifecycle, indexed hover/click mapping, HTML active label, and camera ref methods.
- [ ] Wire the lazy component into the existing workspace callbacks.
- [ ] Run the focused tests and production build.

### Task 3: Production Verification

**Files:**
- Modify: `design-qa.md`

- [ ] Run all repository tests and `git diff --check`.
- [ ] Confirm the Cosmos chunk is smaller than the prior approximately 1.3 MB Reagraph chunk.
- [ ] Rebuild the client container and verify HTTP 200.
- [ ] Record browser QA as passed or blocked based on browser availability.
