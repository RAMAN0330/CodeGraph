import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const hotspots = tsRequire(resolve('server/src/analysis/hotspots.ts'), import.meta.url);

const file = (path, score, extra = {}) => ({ path, isCode: true, complexity: { score }, ...extra });
const files = [file('src/engine.ts', 90), file('src/routes.ts', 60), file('src/util.ts', 10), file('src/flat.ts', 0),
  file('src/engine.test.ts', 99), file('README.md', 50, { isCode: false })];

test('hotspots: candidates are the most complex code files, never tests or docs', () => {
  assert.deepEqual(hotspots.hotspotCandidates(files), ['src/engine.ts', 'src/routes.ts', 'src/util.ts']);
  assert.deepEqual(hotspots.hotspotCandidates(files, 2), ['src/engine.ts', 'src/routes.ts']);
});

test('hotspots: score is relative complexity × relative churn; untouched files drop out', () => {
  const history = new Map([
    ['src/engine.ts', { commits: 10, authors: 2, lastChanged: '2026-09-01T00:00:00Z' }],
    ['src/routes.ts', { commits: 20, authors: 4, lastChanged: '2026-09-20T00:00:00Z' }],
    ['src/util.ts', { commits: 0, authors: 0, lastChanged: null }],
  ]);
  const ranked = hotspots.rankHotspots(files, history);
  assert.deepEqual(ranked.map(h => [h.path, h.score]), [['src/routes.ts', 67], ['src/engine.ts', 50]]);
  assert.equal(ranked[0].authors, 4);
  assert.deepEqual(hotspots.rankHotspots(files, new Map()), []);
});
