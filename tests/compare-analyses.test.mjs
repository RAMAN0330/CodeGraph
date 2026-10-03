import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { compareAnalyses } = tsRequire(resolve('server/src/analysis/compareAnalyses.ts'), import.meta.url);

const fns = n => Array.from({ length: n }, (_, i) => ({ name: `f${i}` }));
// conn source = file defining the function, target = file calling it.
const uses = (caller, defining) => ({ source: defining, target: caller, fn: 'x', count: 1 });

function analysis({ files, connections = [], cycles = [], violations = [] }) {
  return {
    files: files.map(([path, n = 1]) => ({ path, name: path.split('/').pop(), functions: fns(n) })),
    connections,
    issues: cycles.length ? [{ title: `${cycles.length} Circular Dependencies`, items: cycles.map(files => ({ files })) }] : [],
    layerViolations: violations,
    securityIssues: [],
    stats: { files: files.length, functions: 0, connections: connections.length, dead: 0, loc: 0, security: 0, violations: violations.length, duplicates: 0, patterns: 0 },
  };
}

const base = analysis({
  files: [['src/a.ts'], ['src/b.ts'], ['src/old.ts'], ['src/big.ts', 10]],
  connections: [uses('src/a.ts', 'src/b.ts'), uses('src/old.ts', 'src/a.ts')],
  cycles: [['src/x.ts', 'src/y.ts']],
  violations: [{ from: 'src/db.ts', to: 'src/ui.ts', fromLayer: 'data', toLayer: 'ui' }],
});
const head = analysis({
  files: [['src/a.ts'], ['src/b.ts'], ['src/new.ts'], ['src/big.ts', 20]],
  connections: [uses('src/a.ts', 'src/b.ts'), uses('src/b.ts', 'src/a.ts'), uses('src/new.ts', 'src/b.ts'), uses('src/new.ts', 'src/b.ts')],
  cycles: [['src/b.ts', 'src/a.ts']],
  violations: [{ from: 'src/api.ts', to: 'src/ui.ts', fromLayer: 'api', toLayer: 'ui' }],
});

test('compare: added and removed files', () => {
  const diff = compareAnalyses(base, head, 't');
  assert.deepEqual(diff.files.added, { items: ['src/new.ts'], total: 1 });
  assert.deepEqual(diff.files.removed, { items: ['src/old.ts'], total: 1 });
});

test('compare: dependencies are file-level, directional and deduplicated', () => {
  const diff = compareAnalyses(base, head, 't');
  assert.deepEqual(diff.dependencies.added.items, [{ from: 'src/b.ts', to: 'src/a.ts' }, { from: 'src/new.ts', to: 'src/b.ts' }]);
  assert.deepEqual(diff.dependencies.removed.items, [{ from: 'src/old.ts', to: 'src/a.ts' }]);
});

test('compare: cycles and violations introduced vs resolved; pair order does not matter', () => {
  const diff = compareAnalyses(base, head, 't');
  assert.deepEqual(diff.cycles.introduced.items, [['src/a.ts', 'src/b.ts']]);
  assert.deepEqual(diff.cycles.resolved.items, [['src/x.ts', 'src/y.ts']]);
  assert.equal(diff.violations.introduced.items[0].from, 'src/api.ts');
  assert.equal(diff.violations.resolved.items[0].from, 'src/db.ts');
});

test('compare: only files that crossed the large-file threshold are flagged', () => {
  const diff = compareAnalyses(base, head, 't');
  assert.deepEqual(diff.largeFiles.introduced.items, [{ path: 'src/big.ts', functions: 20 }]);
  assert.equal(compareAnalyses(head, head, 't').largeFiles.introduced.total, 0);
});

test('compare: identical analyses produce an empty diff with equal health', () => {
  const diff = compareAnalyses(base, base, 't');
  for (const group of [diff.files, diff.dependencies]) for (const side of Object.values(group)) assert.equal(side.total, 0);
  assert.equal(diff.cycles.introduced.total + diff.cycles.resolved.total + diff.violations.introduced.total, 0);
  assert.equal(diff.base.healthScore, diff.head.healthScore);
});

test('compare: long lists are capped but report their true size', () => {
  const many = analysis({ files: Array.from({ length: 120 }, (_, i) => [`src/f${i}.ts`]) });
  const diff = compareAnalyses(analysis({ files: [] }), many, 't');
  assert.equal(diff.files.added.items.length, 50);
  assert.equal(diff.files.added.total, 120);
});
