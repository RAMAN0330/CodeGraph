import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const clientRequire = createRequire(resolve('client/package.json'));
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href);
let vite;
before(async () => { vite = await createServer({ root: resolve('client'), server: { middlewareMode: true }, appType: 'custom' }); });
after(async () => vite?.close());

test('landing repository field accepts owner/repo, github.com paths and URLs only', async () => {
  const { parseRepositoryInput } = await vite.ssrLoadModule('/src/features/organization/services/pendingRepository.ts');
  assert.equal(parseRepositoryInput('facebook/react'), 'facebook/react');
  assert.equal(parseRepositoryInput('  github.com/acme/api  '), 'acme/api');
  assert.equal(parseRepositoryInput('https://github.com/acme/api.git/'), 'acme/api');
  assert.equal(parseRepositoryInput('https://www.github.com/acme/api'), 'acme/api');
  for (const bad of ['', 'acme', 'acme/api/tree/main', '../etc', 'acme/..', 'a b/c', 'https://gitlab.com/acme/api/x', 'gitlab.com/acme']) {
    assert.equal(parseRepositoryInput(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('analysis failures are explained with a recovery step instead of a raw status', async () => {
  const { describeAnalysisError } = await vite.ssrLoadModule('/src/features/workspace/services/analysisErrors.ts');
  const rateLimited = describeAnalysisError('Analysis failed: GitHub API error: 403');
  assert.match(rateLimited.message, /rate limit|access/i);
  assert.match(rateLimited.hint, /Connect GitHub/);
  assert.match(describeAnalysisError('GitHub API error: 404 Not Found').message, /not found/i);
  assert.match(describeAnalysisError('GitHub API error: 401').hint, /Reconnect/);
  assert.match(describeAnalysisError('TypeError: Failed to fetch').message, /could not reach/i);
  assert.deepEqual(describeAnalysisError('Parser crashed on foo.ts'), { message: 'Parser crashed on foo.ts' });
});

test('opening the workspace with no repository shows a real empty state, not a stuck analysis', async () => {
  const React = clientRequire('react');
  const { renderToStaticMarkup } = clientRequire('react-dom/server');
  const { default: WorkspaceOverview } = await vite.ssrLoadModule('/src/features/workspace/components/WorkspaceOverview.tsx');
  const idle = renderToStaticMarkup(React.createElement(WorkspaceOverview, {
    repoInfo: null, data: null, health: { score: 0, grade: '' }, loading: false, error: null, onOpen() {}, onOpenUnused() {},
  }));
  assert.match(idle, /No repository selected/);
  assert.doesNotMatch(idle, /elapsed|Analysis running/);

  const failed = renderToStaticMarkup(React.createElement(WorkspaceOverview, {
    repoInfo: { owner: 'octocat', repo: 'Hello-World' }, data: null, health: { score: 0, grade: '' },
    loading: false, error: 'Analysis failed: GitHub API error: 403', onOpen() {}, onOpenUnused() {},
  }));
  assert.match(failed, /Analysis stopped on/);
  assert.match(failed, /Back to projects/);
  assert.match(failed, /Connect GitHub/);
  assert.match(failed, /octocat\/Hello-World/, 'breadcrumb names the repository instead of a generic "Project"');
});
