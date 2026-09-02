# Remove Treemap and Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Treemap and Matrix workspace visualizations without affecting remaining views.

**Architecture:** Delete the two selector branches, containers, refs, and isolated D3 effects from `LegacyWorkspaceEngine`. Protect the change with the existing workspace source regression suite.

**Tech Stack:** React, TypeScript, D3, Node test runner, Vite.

## Global Constraints

- Keep Graph, Tree, Flow, Cluster, and Bundle unchanged.
- Do not alter repository analysis or backend behavior.

### Task 1: Remove Both Views

**Files:**
- Modify: `tests/workspace-ui.test.mjs`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`

**Interfaces:**
- Consumes: the existing visualization selector.
- Produces: a selector and render engine with no Treemap or Matrix paths.

- [ ] **Step 1: Add a failing source regression test**

Assert that `vizType:'treemap'`, `vizType:'matrix'`, `treemapRef`, and `matrixRef` are absent while Tree, Flow, Cluster, and Bundle remain.

- [ ] **Step 2: Run `node --test tests/workspace-ui.test.mjs`**

Expected: the new test fails because the views still exist.

- [ ] **Step 3: Delete the controls, refs, containers, and D3 effects**

Remove only code exclusively used by Treemap and Matrix.

- [ ] **Step 4: Run focused tests and build**

Run `node --test tests/workspace-ui.test.mjs` and `npm --prefix client run build`.

- [ ] **Step 5: Rebuild the client container and verify HTTP**

Run `SESSION_SECRET=unused-client-rebuild docker compose -f docker-compose.production.yml up -d --no-deps --build client` and verify `http://localhost:8080/` returns HTTP 200.
