# Remove Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove only the broken Graph visualization while retaining Tree, Flow, Cluster, Bundle, repository browsing, and file details.

**Architecture:** Delete the grouped-Sigma integration boundary from the legacy workspace and change the initial visualization to Tree. Keep the remaining D3 visualization paths and analysis model unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, Docker Compose/Nginx

## Global Constraints

- Remove only Graph.
- Keep Tree, Flow, Cluster, and Bundle.
- Do not alter repository analysis or file browsing.

---

### Task 1: Remove Graph from the workspace runtime

**Files:**
- Modify: `tests/workspace-ui.test.mjs`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`

**Interfaces:**
- Consumes: existing `graphConfig.vizType` visualization selection
- Produces: a selector and renderer limited to `dendro`, `sankey`, `disjoint`, and `bundle`

- [ ] **Step 1: Write the failing test**

Update the workspace visualization assertions to require no `GroupedSigmaGraph`, no `GroupedGraphFocusController`, no `buildGroupedGraph`, no `vizType:'graph'`, and no Graph selector label; require `dendro`, `sankey`, `disjoint`, and `bundle`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspace-ui.test.mjs`
Expected: FAIL because the workspace still imports and renders Graph.

- [ ] **Step 3: Write minimal implementation**

In `LegacyWorkspaceEngine.tsx`, remove Graph-only imports, state, refs, memos, effects, handlers, selector button, renderer, toolbar, status copy, and tooltip branch. Initialize `graphConfig.vizType` to `dendro`; preserve remaining visualization branches.

- [ ] **Step 4: Run focused and full verification**

Run: `node --test tests/workspace-ui.test.mjs`
Expected: PASS.

Run: `node --test tests/*.test.mjs && npm run build --prefix client`
Expected: all tests pass and Vite builds successfully.

- [ ] **Step 5: Persist the rebuilt frontend**

Run: `docker compose --env-file server/.env -f docker-compose.production.yml build client`

Run: `docker compose --env-file server/.env -f docker-compose.production.yml up -d --no-deps --force-recreate client`

Verify the served `WorkspaceArea` chunk from ports 8080 and 5001 no longer contains the Graph integration.
