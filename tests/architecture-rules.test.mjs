import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const load = path => tsRequire(resolve(path), import.meta.url);
const rules = load('client/src/features/analysis/services/architectureRules.ts');
const prReview = load('server/src/services/prReview.ts');
const shared = load('server/src/analysis/sharedRules.ts');

// conn source = file defining the function, target = file calling it.
const uses = (caller, defining) => ({ source: defining, target: caller, fn: 'x', count: 1 });

test('globs: ** spans folders, * stays in one, plain paths cover a folder', () => {
  const m = (glob, path) => rules.globToRegExp(glob).test(path);
  assert.ok(m('src/ui/**', 'src/ui/a.ts') && m('src/ui/**', 'src/ui/x/y.ts'));
  assert.ok(!m('src/ui/**', 'src/uix/a.ts'));
  assert.ok(m('src/*/index.ts', 'src/a/index.ts') && !m('src/*/index.ts', 'src/a/b/index.ts'));
  assert.ok(m('**/*.test.ts', 'a.test.ts') && m('**/*.test.ts', 'deep/x/a.test.ts'));
  assert.ok(m('src/db', 'src/db') && m('src/db', 'src/db/pool.ts') && !m('src/db', 'src/dbx.ts'));
  assert.ok(m('./src/api/', 'src/api/client.ts'));
  assert.ok(m('src/a.b(c).ts', 'src/a.b(c).ts') && !m('src/a.b(c).ts', 'src/aXb(c).ts'), 'regex characters are literal');
});

test('rules file: both rule shapes parse; bad entries are reported, not fatal', () => {
  const parsed = rules.parseRulesFile(JSON.stringify({ rules: [
    { name: 'No UI to DB', from: 'src/ui/**', disallow: ['src/db/**'] },
    { to: 'src/api/client.ts', allowOnlyFrom: 'src/services/**', severity: 'warning' },
    { name: 'Broken', from: 'src/x/**' },
  ] }));
  assert.deepEqual(parsed.rules.map(r => [r.kind, r.name, r.severity]), [['forbidden', 'No UI to DB', 'error'], ['only', 'Rule 2', 'warning']]);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /^Broken: use either/);
  assert.match(rules.parseRulesFile('{nope').errors[0], /not valid JSON/);
  assert.match(rules.parseRulesFile('{}').errors[0], /needs a "rules" array/);
});

const connections = [
  uses('src/ui/page.ts', 'src/db/pool.ts'),          // forbidden
  uses('src/ui/page.ts', 'src/services/users.ts'),   // fine
  uses('src/services/users.ts', 'src/api/client.ts'),// allowed caller
  uses('src/ui/page.ts', 'src/api/client.ts'),       // not an allowed caller
  uses('src/api/retry.ts', 'src/api/client.ts'),     // inside the protected area itself
];
const ruleSet = rules.parseRulesFile(JSON.stringify({ rules: [
  { name: 'No UI to DB', from: 'src/ui/**', disallow: 'src/db/**' },
  { name: 'Client via services', to: 'src/api/client.ts', allowOnlyFrom: ['src/services/**', 'src/api/retry.ts'], severity: 'warning' },
] })).rules;

test('rules evaluation: forbidden edges and disallowed callers are found', () => {
  assert.deepEqual(rules.evaluateRules(ruleSet, connections), [
    { rule: 'Client via services', severity: 'warning', from: 'src/ui/page.ts', to: 'src/api/client.ts' },
    { rule: 'No UI to DB', severity: 'error', from: 'src/ui/page.ts', to: 'src/db/pool.ts' },
  ]);
  assert.deepEqual(rules.evaluateRules([], connections), []);
});

test('regressions: new rule violations raise an alert', () => {
  const snap = (n) => ({ healthScore: 90, healthGrade: 'A', circular: 0, stats: { security: 0, violations: 0, ruleViolations: n } });
  assert.deepEqual(shared.detectRegressions(snap(0), snap(2)).map(r => r.message), ['2 new rule violations (0 → 2)']);
  const legacy = { healthScore: 90, healthGrade: 'A', circular: 0, stats: { security: 0, violations: 0 } };
  assert.deepEqual(shared.detectRegressions(legacy, snap(0)), [], 'snapshots from before rules existed count as zero');
});

test('PR review: the head is judged by the base branch rules, even if the PR weakens them', () => {
  const base = { rules: { rules: ruleSet }, connections: connections.slice(1, 3) };
  // The PR adds a forbidden UI → DB call AND deletes the rule from its own rules file.
  const head = { rules: { rules: [] }, connections: [...connections.slice(1, 3), uses('src/ui/page.ts', 'src/db/pool.ts')] };
  const change = prReview.ruleChanges(base, head, true);
  assert.deepEqual(change.introduced.map(v => v.rule), ['No UI to DB']);
  assert.equal(change.rulesFileChanged, true);
});

const report = (changes) => ({
  owner: 'o', repo: 'r', number: 1, title: 't', url: 'u', author: null, headSha: 'h', baseRef: 'main', analyzedCommit: 'abcdef1234',
  additions: 1, deletions: 1, files: [], risk: { score: 10, level: 'low', factors: [], totalBlast: 0 }, testImpact: [], chains: [], reviewers: [], changes,
});
const empty = { items: [], total: 0 };
const noChanges = { cycles: { introduced: empty, resolved: empty }, violations: { introduced: empty, resolved: empty }, largeFiles: { introduced: empty }, rules: { introduced: [], resolved: [], rulesFileChanged: false }, database: [] };

test('PR check: only an introduced "error" rule violation fails it', () => {
  assert.equal(prReview.checkConclusion(report(noChanges)).conclusion, 'success');
  assert.equal(prReview.checkConclusion(report(undefined)).conclusion, 'success');
  const warning = { ...noChanges, rules: { introduced: [{ rule: 'w', severity: 'warning', from: 'a', to: 'b' }], resolved: [], rulesFileChanged: false } };
  assert.equal(prReview.checkConclusion(report(warning)).conclusion, 'success');
  const error = { ...noChanges, rules: { introduced: [{ rule: 'No UI to DB', severity: 'error', from: 'src/ui/page.ts', to: 'src/db/pool.ts' }], resolved: [], rulesFileChanged: true } };
  assert.deepEqual(prReview.checkConclusion(report(error)), { conclusion: 'failure', title: '1 architecture rule violation introduced' });
  const md = prReview.renderPrReviewMarkdown(report(error));
  assert.match(md, /\*\*Introduced by this PR\*\*\n- ⛔ \*\*No UI to DB\*\*: `src\/ui\/page\.ts` → `src\/db\/pool\.ts`/);
  assert.match(md, /This PR edits `structrace\.rules\.json`/);
});

test('PR review: migrations and schema edits list the tables and the code that queries them', () => {
  const base = { tableUsage: { users: [{ file: 'src/repo.ts', count: 2, kinds: ['sql'] }, { file: 'src/auth.ts', count: 1, kinds: ['model'] }] } };
  const head = {
    dbTables: [{ name: 'users', file: 'db/schema.sql' }, { name: 'audit', file: 'db/audit.sql' }],
    tableUsage: { ...base.tableUsage, users: [...base.tableUsage.users, { file: 'db/migrations/003.sql', count: 1, kinds: ['migration'] }] },
  };
  const changes = prReview.databaseChanges(base, head, ['db/migrations/003.sql', 'db/audit.sql', 'src/auth.ts']);
  assert.deepEqual(changes, [
    { table: 'users', via: 'migration', usedBy: ['src/repo.ts'], total: 1 },
    { table: 'audit', via: 'schema', usedBy: [], total: 0 },
  ]);
  const md = prReview.renderPrReviewMarkdown(report({ ...noChanges, database: changes }));
  assert.match(md, /\*\*Database tables touched\*\*\n- `users` \(migration\) — queried by 1 file: `src\/repo\.ts`\n- `audit` \(schema change\) — no other code queries it/);
});
