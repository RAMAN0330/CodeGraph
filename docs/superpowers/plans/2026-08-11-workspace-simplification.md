# Workspace Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicated graph-sidebar summaries, expose unused-code details from Summary, show the real repository name, and simplify search/account controls in the top bar.

**Architecture:** Keep state ownership in `LegacyWorkspaceEngine` and pass two missing inputs into `WorkspaceOverview`: `repoInfo` and `onOpenUnused`. Reuse the existing unused-functions modal, repository tree, command palette, and logout handler. Implement the header changes inside `WorkspaceHeader` with CSS-only search expansion and one local account-menu state.

**Tech Stack:** React 19, TypeScript, Vite, native CSS, Node test runner, Vite SSR module loader.

## Global Constraints

- Do not add dependencies.
- The Code graph sidebar contains only Explorer controls, repository tree, and resize handle.
- Summary remains active while the unused-code modal is open.
- Search shows the icon and `⌘ K` at rest and reveals `Search code` on hover/focus.
- Account settings opens the existing workspace `settings` section.
- Sign out keeps the existing `/auth/logout` request and redirect.
- Preserve all unrelated dirty-worktree changes.

---

### Task 1: Summary repository identity and unused-code entry point

**Files:**
- Create: `tests/workspace-ui.test.mjs`
- Modify: `client/src/features/workspace/components/WorkspaceOverview.tsx`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx:2461-2470`

**Interfaces:**
- Consumes: existing `repoInfo`, `showUnused`, and `setShowUnused` state from `LegacyWorkspaceEngine`.
- Produces: `WorkspaceOverview` prop `onOpenUnused: () => void`; Summary heading rendered from `repoInfo.owner` and `repoInfo.repo`.

- [ ] **Step 1: Write failing Summary behavior tests**

Create `tests/workspace-ui.test.mjs` with a Vite SSR loader and direct React-element assertions:

```js
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const clientRequire = createRequire(resolve('client/package.json'));
const { pathToFileURL } = await import('node:url');
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);
let vite;

before(async () => {
  vite = await createServer({ root: resolve('client'), server: { middlewareMode: true }, appType: 'custom' });
});
after(async () => vite?.close());

function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return textOf(node.props?.children);
}

function elements(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.type) found.push(node);
  const children = node.props?.children;
  (Array.isArray(children) ? children : [children]).forEach(child => elements(child, found));
  return found;
}

const data = {
  stats: { files: 2, functions: 3, connections: 1, loc: 20, dead: 1, languages: [] },
  deadFunctions: [{ name: 'unused', file: 'src/a.ts', codeLines: 2 }],
  securityIssues: [],
  layerViolations: [],
};

test('Summary shows repository name without removed overview copy', async () => {
  const { default: WorkspaceOverview } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceOverview.tsx');
  const tree = WorkspaceOverview({
    repoInfo: { owner: 'Graphify-Labs', repo: 'graphify' }, data,
    health: { score: 90, grade: 'A' }, loading: false,
    onOpen() {}, onOpenUnused() {},
  });
  const text = textOf(tree);
  assert.match(text, /Graphify-Labs\/graphify/);
  assert.doesNotMatch(text, /Repository overview/i);
  assert.doesNotMatch(text, /A focused snapshot/i);
});

test('Summary unused-code button opens the unused panel without section navigation', async () => {
  const { default: WorkspaceOverview } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceOverview.tsx');
  const opened = [];
  const sections = [];
  const tree = WorkspaceOverview({
    repoInfo: { owner: 'Graphify-Labs', repo: 'graphify' }, data,
    health: { score: 90, grade: 'A' }, loading: false,
    onOpen: section => sections.push(section), onOpenUnused: () => opened.push(true),
  });
  const button = elements(tree).find(node => node.type === 'button' && /Unused code/.test(textOf(node)));
  assert.ok(button);
  button.props.onClick();
  assert.deepEqual(opened, [true]);
  assert.deepEqual(sections, []);
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/workspace-ui.test.mjs`

Expected: FAIL because `onOpenUnused` is not defined and the removed Summary copy is still rendered.

- [ ] **Step 3: Implement the minimal Summary changes**

In `WorkspaceOverview.tsx`, add the callback to `Props`:

```tsx
onOpenUnused: () => void;
```

Add it to the existing parameter destructuring:

```tsx
export default function WorkspaceOverview({ repoInfo, data, health, loading, progress, error, onOpen, onOpenUnused }: Props) {
```

Replace the heading's inner copy block with:

```tsx
<div className="overview-title-row">
  <h1>{repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'Repository'}</h1>
  <span><i /> Analysis complete</span>
</div>
```

Change only the existing Unused code focus button opening tag to:

```tsx
<button onClick={() => deadCount > 0 && onOpenUnused()} disabled={deadCount === 0}>
```

In the `WorkspaceOverview` call inside `LegacyWorkspaceEngine.tsx`, add:

```ts
repoInfo: repoInfo,
loading: loading,
onOpenUnused: function(){ if(data && (data as any).deadFunctions?.length) setShowUnused(true); },
```

In the existing unused modal, replace the clickable file selector with a plain label so it cannot change sections:

```ts
React.createElement('span',{className:'unused-fn-file'},fn.file.split('/').pop())
```

- [ ] **Step 4: Run the Summary tests and client build**

Run: `node --test tests/workspace-ui.test.mjs && npm run build --prefix client`

Expected: both tests PASS and Vite production build succeeds.

- [ ] **Step 5: Commit Task 1 files only**

```bash
git add tests/workspace-ui.test.mjs client/src/features/workspace/components/WorkspaceOverview.tsx client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx
git commit -m "feat: move unused-code details to summary"
```

---

### Task 2: Explorer-only Code graph sidebar

**Files:**
- Create: `client/src/features/workspace/components/WorkspaceExplorerSidebar.tsx`
- Modify: `client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx:2590-2656`
- Modify: `client/src/index.css:1065-1072`

**Interfaces:**
- Consumes: existing `data.tree`, selection, expanded paths, folder filter, and resize state.
- Produces: `WorkspaceExplorerSidebar({ folderFilter, onClearFilter, children })` with only `.explorer-sidebar-heading`, optional clear-filter action, and `.sidebar-scroll`.

- [ ] **Step 1: Add a failing rendered-structure test**

Append a component behavior test to `tests/workspace-ui.test.mjs`:

```js
test('Code graph sidebar exposes only Explorer navigation', async () => {
  const { default: WorkspaceExplorerSidebar } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceExplorerSidebar.tsx');
  const tree = WorkspaceExplorerSidebar({ folderFilter: null, onClearFilter() {}, children: 'TREE' });
  const text = textOf(tree);
  assert.match(text, /Explorer/);
  assert.match(text, /TREE/);
  assert.doesNotMatch(text, /Health Score|Color By|Functions|Unused|Lines of Code/);
});
```

- [ ] **Step 2: Run the new test to verify RED**

Run: `node --test tests/workspace-ui.test.mjs`

Expected: FAIL because `WorkspaceExplorerSidebar.tsx` does not exist.

- [ ] **Step 3: Remove duplicated sidebar blocks**

Create `WorkspaceExplorerSidebar.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Icon } from '../../../shared/components/Icon';

interface Props {
  folderFilter: string | null;
  onClearFilter: () => void;
  children: ReactNode;
}

export default function WorkspaceExplorerSidebar({ folderFilter, onClearFilter, children }: Props) {
  return (
    <>
      <div className="explorer-sidebar-heading">
        <div className="sidebar-title">Explorer</div>
        {folderFilter && (
          <button className="top-btn" onClick={onClearFilter}>
            <Icon name="close" size="s" /> Clear {folderFilter}
          </button>
        )}
      </div>
      <div className="sidebar-scroll">{children}</div>
    </>
  );
}
```

Import it in `LegacyWorkspaceEngine.tsx`. In the `activeSection === 'explorer'` sidebar render, delete the `tool-sidebar-heading` and all three summary `sidebar-section` blocks. Replace them with:

```ts
React.createElement(WorkspaceExplorerSidebar,{
  folderFilter:folderFilter,
  onClearFilter:function(){setFolderFilter(null);}
},
  React.createElement(VirtualizedRepoTree,{tree:(data as any).tree,selected:selected,onSelect:selectFile,expanded:expandedPaths,toggle:togglePath,filterFolder:filterByFolder,activeFilter:folderFilter})
)
```

Add focused CSS and leave legacy shared styles untouched because other sections may still consume them:

```css
.explorer-sidebar-heading{min-height:52px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px;border-bottom:1px solid #343a44}
.explorer-sidebar-heading .sidebar-title{margin:0}
.explorer-sidebar-heading .top-btn{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/workspace-ui.test.mjs && npm run build --prefix client`

Expected: all tests PASS and the production build succeeds.

- [ ] **Step 5: Commit Task 2 files only**

```bash
git add tests/workspace-ui.test.mjs client/src/features/workspace/components/WorkspaceExplorerSidebar.tsx client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx client/src/index.css
git commit -m "refactor: keep graph sidebar focused on explorer"
```

---

### Task 3: Compact search and account dropdown

**Files:**
- Modify: `tests/workspace-ui.test.mjs`
- Modify: `client/src/features/workspace/components/WorkspaceHeader.tsx`
- Modify: `client/src/index.css:910-950`

**Interfaces:**
- Consumes: existing `login`, `avatarUrl`, `onPaletteOpen`, `onSectionChange`, and logout endpoint.
- Produces: `.workspace-account` menu, `.workspace-account-trigger`, `.workspace-account-menu`, and compact `.workspace-command-button` states.

- [ ] **Step 1: Add failing closed-header markup test**

Append:

```js
test('Header uses compact search and account trigger without standalone sign out', async () => {
  const React = clientRequire('react');
  const { renderToStaticMarkup } = clientRequire('react-dom/server');
  const { MemoryRouter } = clientRequire('react-router-dom');
  const { default: WorkspaceHeader } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceHeader.tsx');
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null,
    React.createElement(WorkspaceHeader, {
      login: 'RAMAN0330', avatarUrl: '', hasData: true,
      onPaletteOpen() {}, activeSection: 'overview', onSectionChange() {},
    })
  ));
  assert.match(html, /workspace-command-label/);
  assert.match(html, /workspace-account-trigger/);
  assert.doesNotMatch(html, /workspace-signout/);
});
```

- [ ] **Step 2: Run the header test to verify RED**

Run: `node --test tests/workspace-ui.test.mjs`

Expected: FAIL because the command label and account trigger classes do not exist and the standalone Sign out button remains.

- [ ] **Step 3: Implement compact search and account menu**

In `WorkspaceHeader.tsx`:

- Add `accountOpen` state and an `accountRef`.
- Extend the existing document listener pattern to close on outside `mousedown` and `Escape`.
- Wrap the existing search label in `<span className="workspace-command-label">Search code</span>`.
- Replace `.workspace-user` and `.workspace-signout` siblings with:

```tsx
<div className="workspace-account" ref={accountRef}>
  <button
    className="workspace-account-trigger"
    onClick={() => setAccountOpen(open => !open)}
    aria-expanded={accountOpen}
    aria-haspopup="menu"
  >
    {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{login?.[0]?.toUpperCase() || 'U'}</span>}
    <strong>{login || 'GitHub user'}</strong>
    <svg className="chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor"><path d="m1 1 4 4 4-4" /></svg>
  </button>
  {accountOpen && (
    <div className="workspace-account-menu" role="menu" aria-label="Account menu">
      <div className="workspace-account-summary">
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{login?.[0]?.toUpperCase() || 'U'}</span>}
        <div><strong>{login || 'GitHub user'}</strong><small>Connected</small></div>
      </div>
      <button role="menuitem" onClick={() => { onSectionChange('settings'); setAccountOpen(false); }}>Account settings</button>
      <button role="menuitem" className="danger" onClick={handleSignOut} disabled={signingOut}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )}
</div>
```

Add CSS-only search expansion and menu styling:

```css
.workspace-command-button{width:72px;min-width:72px;overflow:hidden;transition:width .18s ease,border-color .16s ease,background .16s ease}
.workspace-command-label{max-width:0;overflow:hidden;opacity:0;white-space:nowrap;transition:max-width .18s ease,opacity .14s ease}
.workspace-command-button:hover,.workspace-command-button:focus-visible{width:166px}
.workspace-command-button:hover .workspace-command-label,.workspace-command-button:focus-visible .workspace-command-label{max-width:80px;opacity:1}
.workspace-account{position:relative}
.workspace-account-trigger{height:38px;display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid #3e4451;border-radius:9px;background:#282c34;color:#d7dae0;cursor:pointer}
.workspace-account-trigger img,.workspace-account-trigger>span{width:26px;height:26px;border-radius:7px;object-fit:cover;display:grid;place-items:center;background:#c678dd;color:#181a1f;font-weight:700}
.workspace-account-menu{position:absolute;top:46px;right:0;width:230px;padding:7px;border:1px solid #3e4451;border-radius:10px;background:#21252b;box-shadow:0 16px 36px rgba(0,0,0,.5)}
.workspace-account-menu>button{width:100%;height:36px;padding:0 10px;border:0;border-radius:7px;background:transparent;color:#abb2bf;text-align:left;cursor:pointer}
.workspace-account-menu>button:hover{background:#2c313a;color:#f2f3f5}
.workspace-account-menu>button.danger{color:#e06c75}
```

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/workspace-ui.test.mjs && npm run build --prefix client`

Expected: all tests PASS and the production build succeeds.

- [ ] **Step 5: Commit Task 3 files only**

```bash
git add tests/workspace-ui.test.mjs client/src/features/workspace/components/WorkspaceHeader.tsx client/src/index.css
git commit -m "feat: simplify workspace header controls"
```

---

### Task 4: Production verification and deployment

**Files:**
- Modify only if verification exposes a defect in Tasks 1-3.

**Interfaces:**
- Consumes: completed client bundle and existing Docker Compose production configuration.
- Produces: rebuilt `codegraph-client-1` serving the verified workspace bundle.

- [ ] **Step 1: Run complete local verification**

Run:

```bash
node --test tests/workspace-ui.test.mjs
npm run build --prefix client
git diff --check
```

Expected: tests PASS, client build succeeds, and diff check prints no errors.

- [ ] **Step 2: Rebuild the production client**

Run:

```bash
docker compose --env-file server/.env -f docker-compose.production.yml up -d --build --no-deps --force-recreate client
```

Expected: `codegraph-client-1` is rebuilt and starts successfully.

- [ ] **Step 3: Verify the served bundle**

Run:

```bash
curl -fsS http://localhost:8080/workspace >/dev/null
docker inspect -f '{{.State.Status}}' codegraph-client-1
```

Expected: HTTP request succeeds and container status is `running`.

- [ ] **Step 4: Manual interaction checkpoint**

Verify in the existing authenticated browser session:

1. Summary starts with `owner/repository`, status badge, and no removed overview copy.
2. Summary Unused code opens the modal and remains on Summary.
3. Code graph sidebar contains only Explorer and the tree.
4. Search expands on hover and focus; clicking opens the palette.
5. Account menu opens, Account settings selects Settings, outside click/Escape closes it, and Sign out is present only inside the menu.

- [ ] **Step 5: Record verification result**

If any verification fix was required, commit only the affected files with:

```bash
git add tests/workspace-ui.test.mjs client/src/features/workspace/components/WorkspaceOverview.tsx client/src/features/workspace/components/WorkspaceExplorerSidebar.tsx client/src/features/workspace/components/WorkspaceHeader.tsx client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx client/src/index.css
git commit -m "fix: complete workspace simplification verification"
```
