import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { buildCleanupPlan, planToMarkdown } = tsRequire(resolve('client/src/features/analysis/services/cleanupPlan.ts'), import.meta.url);

const fns = n => Array.from({ length: n }, (_, i) => ({ name: `f${i}` }));
const data = {
  files: [
    { path: 'src/legacy/old.ts', functions: fns(2) },
    { path: 'src/utils.ts', functions: fns(5) },
    { path: 'src/plugins.py', functions: fns(1) },
    { path: 'src/index.ts', functions: fns(1) },
    { path: 'src/shared.ts', functions: fns(1) },
  ],
  // conn source = defining file; something uses src/shared.ts.
  connections: [{ source: 'src/shared.ts', target: 'src/app.ts' }, { source: 'src/legacy/old.ts', target: 'docs/a.md', kind: 'link' }],
  deadFunctions: [
    { name: 'oldA', file: 'src/legacy/old.ts', line: 1, codeLines: 10, mentions: [] },
    { name: 'oldB', file: 'src/legacy/old.ts', line: 20, codeLines: 5, mentions: [] },
    { name: 'pad', file: 'src/utils.ts', line: 40, codeLines: 3, mentions: [] },
    { name: 'on_load', file: 'src/plugins.py', line: 3, codeLines: 8, mentions: ['config/hooks.yaml'] },
    { name: 'boot', file: 'src/index.ts', line: 1, codeLines: 4, mentions: [] },
    { name: 'helper', file: 'src/shared.ts', line: 1, codeLines: 2, mentions: [] },
  ],
};

test('cleanup plan: whole files only when nothing in or about them is used', () => {
  const plan = buildCleanupPlan(data);
  assert.deepEqual(plan.files.filter(f => f.wholeFile).map(f => f.path), ['src/legacy/old.ts'], 'a markdown link is not a use');
  const byPath = Object.fromEntries(plan.files.map(f => [f.path, f.wholeFile]));
  assert.equal(byPath['src/plugins.py'], false, 'name mentioned elsewhere');
  assert.equal(byPath['src/index.ts'], false, 'entry point');
  assert.equal(byPath['src/shared.ts'], false, 'other code depends on the file');
  assert.equal(byPath['src/utils.ts'], false, 'only some functions are unused');
  assert.deepEqual(plan.totals, { functions: 6, lines: 32, safe: 5, check: 1, wholeFiles: 1 });
});

test('cleanup plan markdown: delete, remove and check-first sections as a checklist', () => {
  const md = planToMarkdown(buildCleanupPlan(data), 'octo/shop');
  assert.match(md, /### Delete whole files\n\n- \[ \] `src\/legacy\/old\.ts` \(2 functions, 15 lines\)/);
  assert.match(md, /### Remove functions\n\n(- \[ \] .*\n)*- \[ \] `src\/utils\.ts`: `pad\(\)` line 40 \(3 lines\)/);
  assert.match(md, /### Check before removing — the name appears elsewhere\n\n- \[ \] `src\/plugins\.py`: `on_load\(\)` — mentioned in `config\/hooks\.yaml`/);
});
