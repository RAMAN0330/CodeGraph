# Light Platform Visual Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CodeGraph's basic organization screens with Light-derived landing, workspace, and project platform layouts.

**Architecture:** Preserve the existing routes, store, dialogs, and GitHub verification. Replace only page markup, component-level styles, icons, and motion with the corresponding Light visual patterns.

**Tech Stack:** React, TypeScript, Framer Motion, lucide-react, CSS.

## Global Constraints

- Keep CodeGraph names, local organization state, and GitHub verification.
- Do not add Supabase, collaboration, or dependencies.

---

### Task 1: Visual contract test

**Files:**
- Modify: `tests/organization-flow.test.mjs`

- [ ] **Step 1: Write failing assertions**

```js
assert.match(workspaces, /workspace-catalog/);
assert.match(projects, /project-picker-page/);
assert.match(css, /workspace-card-panel/);
```

- [ ] **Step 2: Run the test and observe failure**

Run: `node --test tests/organization-flow.test.mjs`

- [ ] **Step 3: Implement the Light-derived markup and CSS**

Update the workspace and project pages, then port the necessary Light CSS rules into `OrganizationPages.css`.

- [ ] **Step 4: Verify**

Run: `node --test tests/organization-flow.test.mjs && npm run build --prefix client`

### Task 2: Docker delivery

**Files:**
- Modify: `client/src/features/landing/pages/LandingPage.tsx`
- Modify: `client/src/features/landing/pages/LandingPage.css`

- [ ] **Step 1: Preserve the Light-derived landing structure and CodeGraph copy**

- [ ] **Step 2: Build and recreate the client container**

Run: `docker compose --env-file server/.env -f docker-compose.production.yml up -d --build --force-recreate client`
