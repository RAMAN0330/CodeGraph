import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const pk = tsRequire(resolve('client/src/features/analysis/services/packages.ts'), import.meta.url);

test('manifests: names and declared dependencies across ecosystems; vendored ones ignored', () => {
  assert.deepEqual(pk.parseManifest('packages/web/package.json', JSON.stringify({ name: '@acme/web', dependencies: { react: '1', '@acme/ui': 'workspace:*' }, devDependencies: { vitest: '1' } })),
    { root: 'packages/web', manifest: 'packages/web/package.json', ecosystem: 'npm', name: '@acme/web', declares: ['react', '@acme/ui', 'vitest'] });
  assert.deepEqual(pk.parseManifest('go.mod', 'module github.com/acme/svc\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.0\n)\nrequire golang.org/x/net v0.1.0\n').declares, ['github.com/gin-gonic/gin', 'golang.org/x/net']);
  assert.deepEqual(pk.parseManifest('svc/pyproject.toml', '[project]\nname = "acme-svc"\ndependencies = ["requests>=2", "acme-core"]\n\n[tool.ruff]\nline = 1\n'), { root: 'svc', manifest: 'svc/pyproject.toml', ecosystem: 'python', name: 'acme-svc', declares: ['requests', 'acme-core'] });
  assert.equal(pk.parseManifest('crates/a/Cargo.toml', '[package]\nname = "a"\n\n[dependencies]\nserde = "1"\nb = { path = "../b" }\n').declares.join(), 'serde,b');
  assert.equal(pk.parseManifest('node_modules/x/package.json', '{}'), null);
  assert.equal(pk.parseManifest('apps/x/package.json', '{not json').name, null, 'a broken manifest is still a boundary');
});

const packages = [
  pk.parseManifest('package.json', JSON.stringify({ name: 'monorepo', private: true })),
  pk.parseManifest('packages/web/package.json', JSON.stringify({ name: '@acme/web', dependencies: { '@acme/ui': '*' } })),
  pk.parseManifest('packages/ui/package.json', JSON.stringify({ name: '@acme/ui' })),
  pk.parseManifest('packages/core/package.json', JSON.stringify({ name: '@acme/core' })),
];
// conn source = file defining the function, target = file calling it.
const uses = (caller, defining) => ({ source: defining, target: caller });
const data = {
  packages,
  files: ['scripts/release.ts', 'packages/web/src/app.ts', 'packages/web/src/page.ts', 'packages/ui/src/button.ts', 'packages/core/src/money.ts'].map(path => ({ path })),
  connections: [
    uses('packages/web/src/app.ts', 'packages/ui/src/button.ts'),
    uses('packages/web/src/page.ts', 'packages/ui/src/button.ts'),
    uses('packages/web/src/app.ts', 'packages/core/src/money.ts'),
    uses('packages/web/src/app.ts', 'packages/web/src/page.ts'),
    uses('scripts/release.ts', 'packages/core/src/money.ts'),
  ],
};

test('package graph: files go to their innermost package; edges roll up and flag undeclared use', () => {
  const g = pk.packageGraph(data);
  assert.deepEqual(g.nodes.map(n => [n.label, n.files]), [['@acme/web', 2], ['@acme/core', 1], ['@acme/ui', 1], ['monorepo', 1]]);
  assert.deepEqual(g.edges.map(e => [e.from, e.to, e.dependencies, e.undeclared]), [
    ['packages/web', 'packages/core', 1, true],
    ['packages/web', 'packages/ui', 2, false],
    ['', 'packages/core', 1, false],
  ]);
});
