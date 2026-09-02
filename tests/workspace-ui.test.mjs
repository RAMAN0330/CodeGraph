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

test('Route fallback renders the branded page transition loader', async () => {
  const React = clientRequire('react');
  const { renderToStaticMarkup } = clientRequire('react-dom/server');
  const { RouteFallback } = await vite.ssrLoadModule('/src/App.tsx');
  const html = renderToStaticMarkup(React.createElement(RouteFallback));
  assert.match(html, /route-loading-mark/);
  assert.match(html, /route-loading-progress/);
  assert.match(html, /Loading workspace/);
  assert.match(html, /aria-live="polite"/);
});

test('selected public repositories can auto-run after an anonymous auth check', async () => {
  const { canAutoRunSelectedRepo } = await vite.ssrLoadModule('/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx');

  assert.equal(canAutoRunSelectedRepo(false, 'openai/codex'), false);
  assert.equal(canAutoRunSelectedRepo(true, 'openai/codex'), true);
  assert.equal(canAutoRunSelectedRepo(true, ''), false);
});

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
  assert.doesNotMatch(text, /01|02|03/);
  assert.match(elements(tree).map(node => node.props?.className).filter(Boolean).join(' '), /overview-summary-shell/);
});

test('Summary sections use the full available workspace width', async () => {
  const css = await readFile(resolve('client/src/index.css'), 'utf8');
  const dashboardRevamp = css.slice(css.indexOf('/* Workspace dashboard revamp */'));

  assert.match(
    dashboardRevamp,
    /\.overview-heading,\.overview-health-card,\.overview-metrics,\.overview-grid\{max-width:none\}/,
  );
});

test('Platform typography uses Montserrat at weight 700', async () => {
  const css = await readFile(resolve('client/src/index.css'), 'utf8');
  const loginCss = await readFile(resolve('client/src/features/auth/pages/LoginPage.css'), 'utf8');

  assert.match(css, /family=Montserrat:wght@700/);
  assert.match(css, /body\{font-family:'Montserrat',sans-serif;font-weight:700/);
  assert.doesNotMatch(css, /family=Inter|family=Outfit|font-family:\s*'Inter'|font-family:\s*'Outfit'/);
  assert.match(loginCss, /font-family:\s*Montserrat, ui-sans-serif, system-ui, sans-serif/);
  assert.match(loginCss, /font-weight:\s*700/);
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

test('Attention panel provides a complete, data-backed triage queue', async () => {
  const { default: WorkspaceOverview } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceOverview.tsx');
  const tree = WorkspaceOverview({
    repoInfo: { owner: 'Graphify-Labs', repo: 'graphify' },
    data: {
      ...data,
      stats: { ...data.stats, security: 2, dead: 4, violations: 3 },
    },
    health: { score: 68, grade: 'D' }, loading: false,
    onOpen() {}, onOpenUnused() {},
  });
  const text = textOf(tree);
  const classes = elements(tree).map(node => node.props?.className).filter(Boolean).join(' ');

  assert.match(text, /9 open signals across 3 checks/);
  assert.match(text, /Critical|Cleanup|Structural/);
  assert.match(classes, /overview-focus-summary/);
  assert.match(classes, /overview-focus-item/);
});

test('Code graph sidebar exposes only Explorer navigation', async () => {
  const { default: WorkspaceExplorerSidebar } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceExplorerSidebar.tsx');
  const tree = WorkspaceExplorerSidebar({ folderFilter: null, onClearFilter() {}, children: 'TREE' });
  const text = textOf(tree);
  assert.match(text, /Explorer/);
  assert.match(text, /TREE/);
  assert.doesNotMatch(text, /Health Score|Color By|Functions|Unused|Lines of Code/);
});

test('Header separates primary navigation from workspace utilities', async () => {
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
  assert.match(html, /lucide-search/);
  assert.match(html, /workspace-header-primary/);
  assert.match(html, /workspace-header-utilities/);
  assert.doesNotMatch(html, /workspace-header-divider|workspace-header-tools/);
  assert.match(html, /workspace-account-trigger/);
  assert.match(html, /lucide-user-round/);
  assert.doesNotMatch(html, /RAMAN0330/);
  assert.doesNotMatch(html, /workspace-signout/);
});

test('Workspace command center uses the full canvas without stretching sparse cards', async () => {
  const css = await readFile(resolve('client/src/index.css'), 'utf8');
  const engine = await readFile(resolve('client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx'), 'utf8');
  const commandCenter = css.slice(css.indexOf('/* Workspace navigation and overview: focused engineering console */'));

  assert.match(commandCenter, /\.workspace-header\{[^}]*position:relative[^}]*height:72px/);
  assert.match(commandCenter, /\.workspace-overview\{[^}]*width:100%/);
  assert.match(commandCenter, /\.overview-heading,\.overview-summary-shell,\.overview-grid\{width:100%;margin-left:0;margin-right:0\}/);
  assert.match(commandCenter, /\.overview-grid\{[^}]*flex:1[^}]*grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(commandCenter, /\.overview-focus-panel\{[^}]*grid-row:1\/3/);
  assert.match(commandCenter, /\.overview-next-panel\{[^}]*grid-column:2[^}]*grid-row:2/);
  assert.match(commandCenter, /\.workspace-one-dark\{min-height:100dvh;height:100dvh\}/);
  assert.match(engine, /style:\{paddingTop:0,paddingLeft:0\}/);
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

test('Explore visualization selector exposes only Tree and Bundle', async () => {
  const source = await readFile(resolve('client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx'), 'utf8');
  assert.doesNotMatch(source, /vizType:'treemap'|vizType:'matrix'|vizType:'sankey'|vizType:'disjoint'|treemapRef|matrixRef|sankeyRef|disjointRef/);
  assert.doesNotMatch(source, /iconLabel\('flow','Flow'\)|iconLabel\('cluster','Cluster'\)/);
  for (const view of ['dendro', 'bundle']) assert.match(source, new RegExp(`vizType:'${view}'`));
});

test('Explore removes Graph, Flow, and Cluster while keeping Tree and Bundle', async () => {
  const source = await readFile(resolve('client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx'), 'utf8');

  assert.doesNotMatch(source, /GroupedSigmaGraph|GroupedGraphFocusController|buildGroupedGraph|selectedGroupedNodeId/);
  assert.doesNotMatch(source, /vizType:'graph'|iconLabel\('graph','Graph'\)|All files|Focus selected/);
  assert.doesNotMatch(source, /vizType:'sankey'|vizType:'disjoint'|iconLabel\('flow','Flow'\)|iconLabel\('cluster','Cluster'\)/);
  for (const view of ['dendro', 'bundle']) assert.match(source, new RegExp(`vizType:'${view}'`));
});

test('Settings omits graph controls ignored by the grouped renderer', async () => {
  const source = await readFile(resolve('client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx'), 'utf8');
  assert.doesNotMatch(source, /Graph Configuration|Show Labels|Curved Links|View Mode:/);
  for (const view of ['dendro', 'bundle']) {
    assert.match(source, new RegExp(`vizType:'${view}'`));
  }
});
