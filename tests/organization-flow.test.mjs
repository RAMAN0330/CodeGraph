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

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test('organization store persists a repository-owned project', async () => {
  const { createOrganizationStore } = await vite.ssrLoadModule('/src/features/organization/services/organizationStore.ts');
  const store = createOrganizationStore(memoryStorage());

  const workspace = store.createWorkspace('Platform');
  const project = store.createProject({
    workspaceId: workspace.id,
    name: 'API',
    instructions: 'Keep APIs healthy',
    repositoryFullName: 'acme/api',
  });

  assert.equal(project.repositoryFullName, 'acme/api');
  assert.deepEqual(store.load().projects, [project]);
  assert.throws(() => store.createProject({ ...project, repositoryFullName: 'not-a-repository' }), /owner\/repository/);
});

test('primary routes use workspaces and projects, not global repository selection', async () => {
  const app = await readFile(resolve('client/src/App.tsx'), 'utf8');
  assert.match(app, /path="\/workspaces"/);
  assert.match(app, /path="\/workspaces\/:workspaceId\/projects"/);
  const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
  assert.match(projects, /\/api\/github\/repos/);
  assert.match(projects, /Verify repository/);
  assert.match(projects, /\/workspace\?repo=/);
});

test('github auth redirects to workspaces', async () => {
  const server = await readFile(resolve('server/src/index.ts'), 'utf8');
  const landing = await readFile(resolve('client/src/features/landing/pages/LandingPage.tsx'), 'utf8');
  assert.match(server, /res\.redirect\(`\$\{env\.clientOrigin\}\/workspaces`\)/);
  assert.match(landing, /navigate\('\/workspaces'/);
});

test('landing uses the imported workspace-preview entry experience', async () => {
  const landing = await readFile(resolve('client/src/features/landing/pages/LandingPage.tsx'), 'utf8');
  assert.match(landing, /landing-workspace-preview/);
  assert.match(landing, /GraphKeep turns repositories into a <em>navigable map/);
});

test('organization pages use the Light platform layout contract', async () => {
  const workspaces = await readFile(resolve('client/src/features/organization/pages/WorkspacesPage.tsx'), 'utf8');
  const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
  const css = await readFile(resolve('client/src/features/organization/pages/OrganizationPages.css'), 'utf8');
  assert.match(workspaces, /workspace-catalog/);
  assert.match(projects, /project-picker-page/);
  assert.match(css, /workspace-card-panel/);
});

test('organization create dialogs are centered in the viewport', async () => {
  const css = await readFile(resolve('client/src/features/organization/pages/OrganizationPages.css'), 'utf8');
  assert.match(css, /\.organization-dialog\{position:fixed;inset:0;margin:auto/);
});

test('organization search is a typewriter control in each top bar', async () => {
  const workspaces = await readFile(resolve('client/src/features/organization/pages/WorkspacesPage.tsx'), 'utf8');
  const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
  assert.match(workspaces, /TopbarSearch/);
  assert.match(projects, /TopbarSearch/);
  assert.doesNotMatch(workspaces, /workspace-list-search/);
  assert.doesNotMatch(projects, /organization-search/);
});

test('organization top bars omit redundant home and new-project actions', async () => {
  const workspaces = await readFile(resolve('client/src/features/organization/pages/WorkspacesPage.tsx'), 'utf8');
  const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
  assert.doesNotMatch(workspaces, /workspace-account-button/);
  assert.doesNotMatch(projects, /className="organization-create"/);
});

test('organization top bars provide an account menu with sign out', async () => {
  const workspaces = await readFile(resolve('client/src/features/organization/pages/WorkspacesPage.tsx'), 'utf8');
  const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
  const accountMenu = await readFile(resolve('client/src/features/organization/components/TopbarAccount.tsx'), 'utf8');
  assert.match(workspaces, /TopbarAccount/);
  assert.match(projects, /TopbarAccount/);
  assert.match(accountMenu, /auth\/logout/);
  assert.match(accountMenu, /Sign out/);
});

test('organization top bars keep search immediately left of the account icon', async () => {
  const workspaces = await readFile(resolve('client/src/features/organization/pages/WorkspacesPage.tsx'), 'utf8');
  const projects = await readFile(resolve('client/src/features/organization/pages/ProjectsPage.tsx'), 'utf8');
  assert.match(workspaces, /topbar-actions"><TopbarSearch[\s\S]*<TopbarAccount/);
  assert.match(projects, /topbar-actions"><TopbarSearch[\s\S]*<TopbarAccount/);
});

test('insight surfaces inherit the One Dark Pro theme tokens', async () => {
  const css = await readFile(resolve('client/src/index.css'), 'utf8');
  assert.match(css, /--bg-canvas:\s*#282c34/);
  assert.match(css, /--surface-card:\s*#21252b/);
  assert.match(css, /--surface-subtle:\s*#1e2127/);
  assert.match(css, /--text-primary:\s*#abb2bf/);
  assert.match(css, /--text-secondary:\s*#7f848e/);
  assert.match(css, /--text-muted:\s*#5c6370/);
  assert.match(css, /--teal-500:\s*#61afef/);
  assert.match(css, /--color-danger:\s*#e06c75/);
  assert.match(css, /--accent-orange:\s*#d19a66/);
  assert.match(css, /font-family:\s*'Manrope'/);
  assert.doesNotMatch(css, /font-family:\s*'Montserrat'/);

  const featureFiles = [
    'client/src/features/git-insights/components/BlameHeatmap.tsx',
    'client/src/features/git-insights/components/BranchDiff.tsx',
    'client/src/features/git-insights/components/CodeOwnershipMap.tsx',
    'client/src/features/git-insights/components/CommitTimeline.tsx',
    'client/src/features/git-insights/components/ContributorInsights.tsx',
    'client/src/features/git-insights/components/ReleaseNotesGenerator.tsx',
    'client/src/features/security/components/VulnerabilityScanner.tsx',
    'client/src/features/analysis/components/MetricsTrendChart.tsx',
    'client/src/features/analysis/components/StaleCodeRadar.tsx',
    'client/src/features/analysis/components/TechDebtTimeline.tsx',
  ];

  for (const path of featureFiles) {
    const source = await readFile(resolve(path), 'utf8');
    assert.doesNotMatch(source, /#(?:0d1117|161b22|21262d|30363d|8b949e|c9d1d9|f0f6fc|58a6ff|3fb950|f85149|d29922|39d3f7|cf222e)/i, path);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}/i, path);
    assert.match(source, /var\(--(?:bg-canvas|surface-card|surface-subtle|text-(?:primary|secondary|muted)|border-(?:subtle|medium)|teal-[56]00|color-(?:success|warning|danger|info))\)/, path);
  }
});

test('legacy workspace utilities inherit platform color tokens', async () => {
  const files = [
    'client/src/features/export/components/ExportModal.tsx',
    'client/src/features/workspace/legacy/LegacyWorkspaceEngine.tsx',
    'client/src/features/database/pages/DatabaseVisualizer.tsx',
    'client/src/features/workspace/components/FileDrillDown.tsx',
    'client/src/features/workspace/components/CommandPalette.tsx',
    'client/src/features/workspace/components/WorkspaceSidebar.tsx',
    'client/src/features/workspace/components/BookmarkDropdown.tsx',
  ];
  for (const path of files) {
    const source = await readFile(resolve(path), 'utf8');
    assert.doesNotMatch(source, /#(?:0d1117|161b22|21262d|30363d|8b949e|f0f6fc|3fb950|58a6ff|f85149|d29922)/i, path);
  }
});
