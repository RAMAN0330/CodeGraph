import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { buildOnboardingGuide, guideToMarkdown } = tsRequire(resolve('client/src/features/analysis/services/onboardingGuide.ts'), import.meta.url);

// conn source = file defining the function, target = file calling it.
const uses = (caller, defining) => ({ source: defining, target: caller, fn: 'x', count: 1 });
const file = (path, layer = 'service', extra = {}) => ({ path, name: path.split('/').pop(), layer, isCode: true, ...extra });

// main → routes → {users, orders} → db ; cli → db ; util used by users, orders, routes
const data = {
  files: [
    file('src/main.ts', 'entry'), file('src/cli.ts', 'entry'), file('src/routes.ts', 'api'),
    file('src/users.ts'), file('src/orders.ts'), file('src/db.ts', 'data', { complexity: { level: 'critical', score: 42 } }),
    file('src/util.ts', 'util'), file('src/users.test.ts'), file('README.md', 'note', { isCode: false }),
  ],
  connections: [
    uses('src/main.ts', 'src/routes.ts'),
    uses('src/routes.ts', 'src/users.ts'), uses('src/routes.ts', 'src/orders.ts'), uses('src/routes.ts', 'src/util.ts'),
    uses('src/users.ts', 'src/db.ts'), uses('src/orders.ts', 'src/db.ts'), uses('src/cli.ts', 'src/db.ts'),
    uses('src/users.ts', 'src/util.ts'), uses('src/orders.ts', 'src/util.ts'),
    uses('src/users.test.ts', 'src/users.ts'),
  ],
  issues: [{ title: '1 Circular Dependencies', items: [{ files: ['src/users.ts', 'src/orders.ts'] }] }],
};

test('guide: entry points prefer conventional names, then reach; tests and docs are ignored', () => {
  const guide = buildOnboardingGuide(data);
  assert.equal(guide.codeFiles, 7);
  assert.deepEqual(guide.entryPoints.map(e => e.path), ['src/main.ts', 'src/cli.ts']);
  assert.equal(guide.entryPoints[0].reach, 5);
});

test('guide: reading path starts at the entry and follows the most depended-on dependency', () => {
  const path = buildOnboardingGuide(data).readingPath.map(s => s.path);
  // util (3 dependents) beats orders/users (1); db only becomes reachable once
  // something that uses it has been read, so it comes after orders.
  assert.deepEqual(path, ['src/main.ts', 'src/routes.ts', 'src/util.ts', 'src/orders.ts', 'src/db.ts', 'src/users.ts']);
  const step = buildOnboardingGuide(data).readingPath[1];
  assert.equal(step.reason, 'main.ts depends on it; used by 1 file; crosses entry → api');
});

test('guide: core modules are ranked by dependents, excluding test callers', () => {
  const core = buildOnboardingGuide(data).coreModules;
  assert.deepEqual(core.map(m => [m.path, m.dependents]), [['src/db.ts', 3], ['src/util.ts', 3]]);
});

test('guide: cautions cover cycles and complexity', () => {
  const reasons = buildOnboardingGuide(data).cautions.map(c => `${c.path}: ${c.reason}`);
  assert.ok(reasons.some(r => r.startsWith('src/users.ts: Circular dependency with orders.ts')));
  assert.ok(reasons.some(r => r.startsWith('src/db.ts: High complexity (score 42)')));
});

test('guide: a repository without detected dependencies still gets layers and areas', () => {
  const guide = buildOnboardingGuide({ files: [file('a.py'), file('lib/b.py')], connections: [] });
  assert.deepEqual(guide.readingPath, []);
  assert.deepEqual(guide.areas, [{ folder: '(root)', files: 1 }, { folder: 'lib', files: 1 }]);
  assert.deepEqual(buildOnboardingGuide(null).codeFiles, 0);
});

test('guide markdown: sections in reading order with owners when known', () => {
  const md = guideToMarkdown(buildOnboardingGuide(data), 'octo/shop', [{ folder: 'src', people: ['alice', 'bob'] }]);
  assert.ok(md.startsWith('# Onboarding: octo/shop'));
  assert.match(md, /## Reading path\n\n1\. `src\/main\.ts` \(entry\) — Entry point — reaches 5 files/);
  assert.match(md, /## Who to ask\n\n- `src\/` — alice, bob/);
  assert.ok(md.indexOf('## Start here') < md.indexOf('## Reading path'));
});
