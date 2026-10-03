import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const cov = tsRequire(resolve('client/src/features/analysis/services/coverage.ts'), import.meta.url);

test('coverage: lcov with LF/LH, and with only DA lines', () => {
  const parsed = cov.parseCoverage('TN:\nSF:/home/runner/work/app/app/src/a.ts\nDA:1,1\nLF:10\nLH:7\nend_of_record\nSF:src/b.ts\nDA:1,0\nDA:2,3\nDA:3,0\nend_of_record\n');
  assert.equal(parsed.format, 'lcov');
  assert.deepEqual(parsed.files, { '/home/runner/work/app/app/src/a.ts': { found: 10, hit: 7 }, 'src/b.ts': { found: 3, hit: 1 } });
});

test('coverage: Cobertura XML, joined to its <source> root', () => {
  const xml = `<?xml version="1.0"?><coverage line-rate="0.5"><sources><source>/ci/repo</source></sources><packages><package><classes>
    <class name="m" filename="app/models.py"><lines><line number="1" hits="1"/><line number="2" hits="0"/></lines></class>
    <class name="v" filename="app/views.py"><lines><line number="1" hits="4"/></lines></class></classes></package></packages></coverage>`;
  assert.deepEqual(cov.parseCoverage(xml), { format: 'cobertura', files: { '/ci/repo/app/models.py': { found: 2, hit: 1 }, '/ci/repo/app/views.py': { found: 1, hit: 1 } } });
});

test('coverage: Istanbul summary; unknown formats explain what to upload', () => {
  const json = JSON.stringify({ total: { lines: { total: 9, covered: 9 } }, '/x/src/a.ts': { lines: { total: 4, covered: 1 } } });
  assert.deepEqual(cov.parseCoverage(json).files, { '/x/src/a.ts': { found: 4, hit: 1 } });
  assert.throws(() => cov.parseCoverage('hello'), /lcov\.info/);
  assert.throws(() => cov.parseCoverage('{"a":1}'), /coverage-summary\.json/);
});

test('coverage: CI paths match repository files by suffix at a folder boundary', () => {
  const repo = ['src/a.ts', 'packages/web/src/a.ts', 'src/b.ts', 'lib/xa.ts'];
  const matched = cov.matchCoverageToRepo({
    '/home/runner/work/app/app/packages/web/src/a.ts': { found: 10, hit: 5 },
    'C:\\build\\src\\b.ts': { found: 4, hit: 4 },
    '/ci/other/thing.ts': { found: 1, hit: 0 },
    '/ci/lib/a.ts': { found: 2, hit: 2 },
  }, repo);
  assert.deepEqual(matched.files, { 'packages/web/src/a.ts': { found: 10, hit: 5 }, 'src/b.ts': { found: 4, hit: 4 } });
  assert.equal(matched.unmatched, 2, '"lib/a.ts" is not "lib/xa.ts" and nothing is guessed');
});

test('coverage risk: uncovered share weighted by dependents; full coverage is no risk', () => {
  // conn source = file defining the function, target = file calling it.
  const uses = (caller, defining) => ({ source: defining, target: caller });
  const data = { connections: [uses('b', 'core'), uses('c', 'core'), uses('d', 'b'), uses('e', 'leaf')] };
  const rows = cov.coverageRisk(data, { core: { found: 10, hit: 2 }, leaf: { found: 10, hit: 0 }, b: { found: 5, hit: 5 } });
  assert.deepEqual(rows.map(r => [r.path, r.percent, r.dependents, r.transitive, r.risk]), [['core', 20, 2, 1, 2], ['leaf', 0, 1, 0, 1]]);
});

test('coverage upload validation: only well-formed per-file counts are stored', () => {
  const { validateCoverage } = tsRequire(resolve('server/src/db/coverage.ts'), import.meta.url);
  assert.deepEqual(validateCoverage('lcov', { 'src/a.ts': { found: 4, hit: 9 } }).files, { 'src/a.ts': { found: 4, hit: 4 } }, 'hits are capped at lines found');
  assert.throws(() => validateCoverage('exe', { a: { found: 1, hit: 1 } }), /Unknown coverage format/);
  assert.throws(() => validateCoverage('lcov', {}), /match this repository/);
  assert.throws(() => validateCoverage('lcov', { a: { found: -1, hit: 0 } }), /Invalid coverage entry/);
  assert.throws(() => validateCoverage('lcov', [1]), /"files" object/);
});
