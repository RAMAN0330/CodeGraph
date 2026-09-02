# Project-owned Repository Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace global repository selection with browser-local workspaces and projects that own verified GitHub repositories before opening CodeGraph analysis.

**Architecture:** Add a small local-storage domain module for workspace and project records, and focused picker pages that use it. The existing GitHub session and `/api/github/repos` endpoint remain the source of repository access; the existing `/workspace?repo=owner/repo&run=1` flow remains the analysis destination.

**Tech Stack:** React 19, TypeScript, React Router, lucide-react, browser `localStorage`, Node test runner with Vite SSR.

## Global Constraints

- Do not add dependencies, Supabase, backend tables, collaboration, or PAT storage.
- Preserve existing GitHub OAuth and `/api/github/repos` contracts.
- Keep `/select-repo` functional as a direct compatibility route, but remove it from the primary journey.
- Validate repository names as `owner/repository` before project creation.

---

### Task 1: Local organization state

**Files:**
- Create: `client/src/features/organization/services/organizationStore.ts`
- Test: `tests/organization-flow.test.mjs`

**Interfaces:**
- Produces `Workspace`, `Project`, `loadOrganizationState()`, `createWorkspace(name)`, `createProject(input)`, and `organizationStorageKey`.
- `Project` includes `repositoryFullName`; consumers use it to navigate to CodeGraph analysis.

- [ ] **Step 1: Write the failing test**

```js
const store = await vite.ssrLoadModule('/src/features/organization/services/organizationStore.ts');
assert.deepEqual(store.loadOrganizationState(), { workspaces: [], projects: [] });
const workspace = store.createWorkspace('Platform');
const project = store.createProject({ workspaceId: workspace.id, name: 'API', repositoryFullName: 'acme/api' });
assert.equal(project.repositoryFullName, 'acme/api');
assert.equal(store.loadOrganizationState().projects[0].workspaceId, workspace.id);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/organization-flow.test.mjs`

Expected: FAIL because the organization store module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export const organizationStorageKey = 'codegraph.organization.v1';
export type Workspace = { id: string; name: string; createdAt: string };
export type Project = { id: string; workspaceId: string; name: string; instructions: string; repositoryFullName: string; createdAt: string };
```

Use `crypto.randomUUID()` when available, a timestamp fallback otherwise. Read and write one JSON record under `organizationStorageKey`; malformed or unavailable storage returns an empty in-memory state.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/organization-flow.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/organization/services/organizationStore.ts tests/organization-flow.test.mjs
git commit -m "feat: store local workspaces and projects"
```

### Task 2: Workspace and project picker pages

**Files:**
- Create: `client/src/features/organization/pages/WorkspacesPage.tsx`
- Create: `client/src/features/organization/pages/ProjectsPage.tsx`
- Create: `client/src/features/organization/pages/OrganizationPages.css`
- Modify: `client/src/App.tsx`
- Test: `tests/organization-flow.test.mjs`

**Interfaces:**
- Consumes `Workspace`, `Project`, and store functions from Task 1.
- Produces routes `/workspaces` and `/workspaces/:workspaceId/projects`.
- `ProjectsPage` navigates to `/workspace?repo=${encodeURIComponent(project.repositoryFullName)}&run=1` for an attached project.

- [ ] **Step 1: Write the failing test**

```js
const app = await readFile(resolve('client/src/App.tsx'), 'utf8');
assert.match(app, /path="\/workspaces"/);
assert.match(app, /path="\/workspaces\/:workspaceId\/projects"/);
const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
assert.match(projects, /repositoryFullName/);
assert.match(projects, /\/workspace\?repo=/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/organization-flow.test.mjs`

Expected: FAIL because organization routes and pages do not exist.

- [ ] **Step 3: Write minimal implementation**

Create compact, accessible pages with empty states and native form dialogs. `WorkspacesPage` creates/selects a workspace; `ProjectsPage` lists that workspace's projects, creates a project, and offers a back button. Keep state local to each page and re-read the store after mutation.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/organization-flow.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/App.tsx client/src/features/organization/pages tests/organization-flow.test.mjs
git commit -m "feat: add workspace and project pickers"
```

### Task 3: Repository attachment and verification

**Files:**
- Modify: `client/src/features/organization/pages/ProjectsPage.tsx`
- Modify: `client/src/features/organization/pages/OrganizationPages.css`
- Test: `tests/organization-flow.test.mjs`

**Interfaces:**
- Consumes the existing authenticated `GET /api/github/repos` endpoint.
- Produces a project only after its `repositoryFullName` is a valid `owner/repository` value and exists in the logged-in user’s repository list; public `owner/repository` entries can be launched through existing workspace behavior when GitHub OAuth is unavailable.

- [ ] **Step 1: Write the failing test**

```js
const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
assert.match(projects, /\/api\/github\/repos/);
assert.match(projects, /\^\[\^\/\\s\]\+\/\[\^\/\\s\]\+\$/);
assert.match(projects, /Verify repository/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/organization-flow.test.mjs`

Expected: FAIL because project creation does not verify an attached repository.

- [ ] **Step 3: Write minimal implementation**

Fetch available repositories with credentials when the dialog opens. Present a searchable select plus an editable `owner/repository` input. Verification accepts an exact authenticated repository match; when auth is disabled, it accepts only the validated public-format input and lets the existing workspace route report inaccessible repositories. Disable Create until verification succeeds and show server/network failures inline.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/organization-flow.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/organization/pages/ProjectsPage.tsx client/src/features/organization/pages/OrganizationPages.css tests/organization-flow.test.mjs
git commit -m "feat: attach verified repository to projects"
```

### Task 4: Redirects, landing integration, and verification

**Files:**
- Modify: `client/src/features/landing/pages/LandingPage.tsx`
- Modify: `client/src/features/auth/pages/LoginPage.tsx`
- Modify: `server/src/index.ts`
- Modify: `tests/organization-flow.test.mjs`
- Test: `tests/workspace-ui.test.mjs`

**Interfaces:**
- GitHub callback redirects to `/workspaces`.
- Existing signed-in landing and login checks redirect to `/workspaces`.
- Direct `/select-repo` route remains unchanged.

- [ ] **Step 1: Write the failing test**

```js
const server = await readFile(resolve('server/src/index.ts'), 'utf8');
assert.match(server, /res\.redirect\(`\$\{env\.clientOrigin\}\/workspaces`\)/);
const landing = await readFile(resolve('client/src/features/landing/pages/LandingPage.tsx'), 'utf8');
assert.match(landing, /navigate\('\/workspaces'/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/organization-flow.test.mjs`

Expected: FAIL because the authenticated journey still redirects to `/select-repo`.

- [ ] **Step 3: Write minimal implementation**

Change only post-auth redirects to `/workspaces`; preserve the explicit `select-repo` route and its current behavior. Add the test cases for route strings and project-opening URL construction.

- [ ] **Step 4: Run focused and regression tests**

Run: `node --test tests/organization-flow.test.mjs tests/workspace-ui.test.mjs && npm run build --prefix client && npm run build --prefix server`

Expected: all tests and both builds PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/landing/pages/LandingPage.tsx client/src/features/auth/pages/LoginPage.tsx server/src/index.ts tests/organization-flow.test.mjs
git commit -m "feat: route github users through projects"
```
