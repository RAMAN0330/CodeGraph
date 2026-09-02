# Remove Flow and Cluster Explore Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave only Tree and Bundle in the repository Explore visualization selector.

**Architecture:** Delete the two selector entries, their container branches, refs, and now-unreachable D3 effects from the legacy workspace component. Protect the UI surface with source-level regression assertions and leave database Flow behavior untouched.

**Tech Stack:** React, TypeScript, D3, Node test runner, Vite, Docker Compose

## Global Constraints

- Tree remains the default.
- Bundle remains available and unchanged.
- Database-schema Flow and unrelated internal flow logic remain unchanged.
- Add no replacement view or compatibility abstraction.

---

### Task 1: Enforce Tree/Bundle-only Explore views

**Files:**
- Modify: `tests/workspace-ui.test.mjs`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx`

**Interfaces:**
- Consumes: `graphConfig.vizType` and the existing Explore visualization selector.
- Produces: an Explore UI whose only selectable visualization values are `dendro` and `bundle`.

- [ ] **Step 1: Write the failing test**

Update the visualization assertions to reject the exact Explore entries `vizType:'sankey'`, `vizType:'disjoint'`, `iconLabel('flow','Flow')`, `iconLabel('cluster','Cluster')`, `sankeyRef`, and `disjointRef`, while requiring `vizType:'dendro'` and `vizType:'bundle'`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --test tests/workspace-ui.test.mjs`

Expected: FAIL because Flow and Cluster still occur in the Explore implementation.

- [ ] **Step 3: Write the minimal implementation**

Delete the Explore Flow and Cluster buttons, renderer containers, refs, and their two D3 visualization effects. Do not alter database Flow controls or the remaining Tree and Bundle code.

- [ ] **Step 4: Run focused and full verification**

Run: `node --test tests/workspace-ui.test.mjs`

Expected: all focused tests pass.

Run: `node --test tests/*.test.mjs`

Expected: all tests pass with zero failures.

Run: `npm run build --prefix client`

Expected: production build exits successfully.

### Task 2: Deploy and inspect the rebuilt client

**Files:**
- Modify: none; deployment rebuild only.

**Interfaces:**
- Consumes: the production client Docker service in `docker-compose.production.yml`.
- Produces: rebuilt running client assets containing Tree and Bundle but no Explore Flow or Cluster selectors.

- [ ] **Step 1: Rebuild and restart the client service**

Run: `docker compose --env-file server/.env -f docker-compose.production.yml build client`

Run: `docker compose --env-file server/.env -f docker-compose.production.yml up -d --no-deps --force-recreate client`

- [ ] **Step 2: Verify the running service and served assets**

Run: `docker compose --env-file server/.env -f docker-compose.production.yml ps client`

Expected: client service is running.

Fetch the served entry and workspace chunks on ports 8080 and 5001 and confirm the Explore selector contains Tree and Bundle without the removed Flow and Cluster selector signatures.
