import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const co = tsRequire(resolve('client/src/features/git-insights/services/codeowners.ts'), import.meta.url);

test('CODEOWNERS patterns follow GitHub semantics', () => {
  const m = (p, path) => co.patternMatcher(p).test(path);
  assert.ok(m('/src/api/', 'src/api/x.ts') && !m('/src/api/', 'lib/src/api/x.ts'));
  assert.ok(m('docs/', 'docs/a.md') && m('apps/web/', 'apps/web/src/a.ts'));
  assert.ok(m('*.js', 'a.js') && m('*.js', 'deep/b.js') && !m('*.js', 'a.ts'));
  assert.ok(m('build', 'build/x') && m('build', 'pkg/build/x'), 'a bare name matches at any depth');
  assert.ok(m('/scripts/*', 'scripts/a.sh') && !m('/scripts/*.sh', 'scripts/deep/a.sh'));
  assert.ok(m('**/logs', 'a/b/logs/x.log'));
});

test('CODEOWNERS: comments ignored, the last matching rule wins', () => {
  const rules = co.parseCodeowners('# owners\n* @everyone\n/src/ @core # inline\n\n/src/api/ @api-team @alice\n');
  assert.deepEqual(rules.map(r => [r.line, r.pattern, r.owners]), [[2, '*', ['@everyone']], [3, '/src/', ['@core']], [5, '/src/api/', ['@api-team', '@alice']]]);
  assert.equal(co.ownersOf('src/api/x.ts', rules).line, 5);
  assert.equal(co.ownersOf('src/ui/x.ts', rules).line, 3);
  assert.equal(co.ownersOf('README.md', rules).line, 2);
});

test('areas: top-level folders, big ones split a level deeper', () => {
  const paths = [...Array.from({ length: 6 }, (_, i) => `client/src/f${i}.ts`), 'client/README.md', 'client/test/a.ts', 'server/a.ts', 'docs/x.md', 'package.json'];
  assert.deepEqual(co.suggestAreas(paths), [{ area: 'client/src', files: 6 }, { area: 'client', files: 1 }, { area: 'client/test', files: 1 }, { area: 'docs', files: 1 }, { area: 'server', files: 1 }]);
});

test('owners: top committers until half the commits are covered, max three, at least 15% each', () => {
  const activity = [
    { area: 'server', files: 10, commits: 20, authors: [{ login: 'alice', commits: 8 }, { login: 'bob', commits: 6 }, { login: 'carol', commits: 2 }, { login: 'dan', commits: 4 }] },
    { area: 'docs', files: 2, commits: 0, authors: [] },
    { area: 'misc', files: 9, commits: 10, authors: Array.from({ length: 10 }, (_, i) => ({ login: `u${i}`, commits: 1 })) },
  ];
  assert.deepEqual(co.suggestOwners(activity), [{ area: 'server', owners: ['@alice', '@bob'], share: 70, commits: 20 }]);
  assert.equal(co.renderCodeowners(co.suggestOwners(activity), 12).split('\n').filter(l => l && !l.startsWith('#')).join('\n'), '/server/ @alice @bob');
});

test('audit: stale people, patterns matching nothing, unowned areas; teams are never "stale"', () => {
  const rules = co.parseCodeowners('/server/ @alice @gone @org/backend\n/legacy/ @bob\n');
  const paths = ['server/a.ts', 'client/b.ts'];
  const activity = [
    { area: 'server', files: 1, commits: 5, authors: [{ login: 'Alice', commits: 5 }] },
    { area: 'client', files: 1, commits: 3, authors: [{ login: 'carol', commits: 3 }] },
  ];
  const findings = co.auditCodeowners(rules, paths, activity, co.suggestOwners(activity));
  assert.deepEqual(findings, [
    { kind: 'stale-owner', line: 1, pattern: '/server/', owner: '@gone', area: 'server' },
    { kind: 'no-match', line: 2, pattern: '/legacy/' },
    { kind: 'unowned', area: 'client', files: 1, suggested: ['@carol'] },
  ]);
});
