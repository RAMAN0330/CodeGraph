import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

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

test('Code graph sidebar exposes only Explorer navigation', async () => {
  const { default: WorkspaceExplorerSidebar } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceExplorerSidebar.tsx');
  const tree = WorkspaceExplorerSidebar({ folderFilter: null, onClearFilter() {}, children: 'TREE' });
  const text = textOf(tree);
  assert.match(text, /Explorer/);
  assert.match(text, /TREE/);
  assert.doesNotMatch(text, /Health Score|Color By|Functions|Unused|Lines of Code/);
});

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

test('Account menu interactions dismiss outside click and Escape, and select settings', async () => {
  const {
    accountMenuDismissHandlers,
    selectAccountSettings,
  } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceHeader.tsx');
  const trigger = {};
  const accountRef = { current: { contains: target => target === trigger } };
  const openStates = [];
  const dismiss = accountMenuDismissHandlers(accountRef, open => openStates.push(open));

  dismiss.onMouseDown({ target: {} });
  dismiss.onMouseDown({ target: trigger });
  dismiss.onKeyDown({ key: 'Escape' });
  dismiss.onKeyDown({ key: 'Enter' });

  const sections = [];
  selectAccountSettings(section => sections.push(section), open => openStates.push(open));

  assert.deepEqual(openStates, [false, false, false]);
  assert.deepEqual(sections, ['settings']);
});

test('Visualization selector excludes Treemap and Matrix while keeping remaining views', async () => {
  const source = await readFile(resolve('client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx'), 'utf8');
  assert.doesNotMatch(source, /vizType:'treemap'|vizType:'matrix'|treemapRef|matrixRef/);
  for (const view of ['dendro', 'sankey', 'disjoint', 'bundle']) assert.match(source, new RegExp(`vizType:'${view}'`));
});

test('Explore integrates the grouped Sigma graph without removing alternate views', async () => {
  const source = await readFile(resolve('client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx'), 'utf8');
  const styles = await readFile(resolve('client/src/index.css'), 'utf8');
  const groupedModelSource = source.slice(source.indexOf('var groupedGraphModel'), source.indexOf('var selectedGraphId'));

  assert.match(source, /React\.lazy\(\(\) => import\('\.\.\/components\/GroupedSigmaGraph'\)\)/);
  assert.doesNotMatch(source, /CosmosGraphCanvas/);
  assert.match(source, /buildGroupedGraph/);
  assert.match(source, /expandedGraphFolders/);
  assert.match(source, /onOpenFile/);
  assert.match(source, /focusNode/);
  assert.match(source, /openAndFocusGraphFile\(fn\.file\)/);
  assert.doesNotMatch(groupedModelSource, /graphifyGraph/);
  assert.match(source, /},'All files'\)/);
  assert.match(source, /},'Focus selected'\)/);
  assert.match(source, /useState<string\|null>\(null\)/);
  assert.match(source, /setPendingGraphFocus\(path\)/);
  assert.match(source, /advanceGroupedGraphFocus/);
  assert.match(source, /selectedGroupedNodeId/);
  assert.doesNotMatch(source, /pendingGraphFocusRef|Graph settings|Call Flow/);
  assert.doesNotMatch(source, /vizType:'treemap'|vizType:'matrix'|treemapRef|matrixRef/);
  assert.match(styles, /\.canvas-toolbar:has\(\.graph-focus-toggle\)\{[^}]*flex-wrap:wrap/);
  for (const view of ['graph', 'dendro', 'sankey', 'disjoint', 'bundle']) {
    assert.match(source, new RegExp(`vizType:'${view}'`));
  }
});

test('Settings omits graph controls ignored by the grouped renderer', async () => {
  const source = await readFile(resolve('client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx'), 'utf8');
  assert.doesNotMatch(source, /Graph Configuration|Show Labels|Curved Links|View Mode:/);
  for (const view of ['graph', 'dendro', 'sankey', 'disjoint', 'bundle']) {
    assert.match(source, new RegExp(`vizType:'${view}'`));
  }
});
