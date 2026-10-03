import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const load = async path => tsRequire(resolve(path), import.meta.url);

const rules = await load('server/src/analysis/sharedRules.ts');
const notifier = await load('server/src/services/alertNotifier.ts');

const analysis = ({ dead = 0, circularPairs = 0, high = 0, violations = 0 } = {}) => ({
  stats: { files: 10, functions: 40, connections: 20, loc: 900, dead, security: high, violations, duplicates: 0, patterns: 0 },
  issues: circularPairs ? [{ title: `${circularPairs} Circular Dependencies`, items: Array.from({ length: circularPairs }, () => ({})) }] : [],
  securityIssues: Array.from({ length: high }, () => ({ severity: 'high' })),
});

test('snapshot: health, grade, cycle count and headline stats', () => {
  const snap = rules.snapshotOf(analysis({ circularPairs: 2, high: 1 }), '2026-10-01T00:00:00Z', 'abc');
  assert.equal(snap.commitSha, 'abc');
  assert.equal(snap.circular, 2);
  assert.equal(snap.healthScore, 90); // -5 one circular issue, -5 one high finding
  assert.equal(snap.healthGrade, 'A');
  assert.equal(snap.stats.security, 1);
});

test('regressions: first analysis and unchanged code raise nothing', () => {
  const snap = rules.snapshotOf(analysis(), 't');
  assert.deepEqual(rules.detectRegressions(null, snap), []);
  assert.deepEqual(rules.detectRegressions(snap, rules.snapshotOf(analysis(), 't2')), []);
});

test('regressions: new cycles, high-severity findings and violations are each reported', () => {
  const before = rules.snapshotOf(analysis(), 't1');
  const after = rules.snapshotOf(analysis({ circularPairs: 2, high: 1, violations: 3 }), 't2');
  const found = rules.detectRegressions(before, after);
  assert.deepEqual(found.map(r => r.kind), ['health', 'circular', 'security', 'violations']);
  assert.equal(found[1].message, '2 new circular dependencies (0 → 2)');
  assert.equal(found[2].message, '1 new high-severity security finding (0 → 1)');
  assert.equal(found[3].message, '3 new architecture violations (0 → 3)');
});

test('regressions: a small score wobble is ignored, a grade drop is not', () => {
  const base = rules.snapshotOf(analysis(), 't1');
  const wobble = { ...base, healthScore: base.healthScore - 4 };
  assert.deepEqual(rules.detectRegressions(base, wobble), []);
  const gradeDrop = { ...base, healthScore: 89, healthGrade: 'B' };
  const prev = { ...base, healthScore: 91, healthGrade: 'A' };
  assert.equal(rules.detectRegressions(prev, gradeDrop)[0].message, 'Health dropped from A (91) to B (89)');
  assert.deepEqual(rules.detectRegressions(gradeDrop, prev), [], 'improvements are not alerts');
});

test('alert webhooks: only https Slack and Discord incoming webhooks are accepted', () => {
  assert.equal(notifier.webhookKind('https://hooks.slack.com/services/T0/B0/xyz'), 'slack');
  assert.equal(notifier.webhookKind('https://discord.com/api/webhooks/1/abc'), 'discord');
  for (const bad of [
    'http://hooks.slack.com/services/T0/B0/xyz',
    'https://hooks.slack.com.evil.example/services/x',
    'https://user:pw@hooks.slack.com/services/x',
    'https://hooks.slack.com:8443/services/x',
    'https://hooks.slack.com/other',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
    42,
  ]) assert.equal(notifier.webhookKind(bad), null, String(bad));
});

test('alert webhooks: Slack gets {text}, Discord gets {content}, redirects are refused', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
  await notifier.sendWebhookMessage('https://hooks.slack.com/services/a/b/c', 'hello', fetchImpl);
  await notifier.sendWebhookMessage('https://discord.com/api/webhooks/1/x', 'hello', fetchImpl);
  assert.deepEqual(calls[0].body, { text: 'hello' });
  assert.deepEqual(calls[1].body, { content: 'hello' });
  assert.equal(calls[0].init.redirect, 'error');
  await assert.rejects(notifier.sendWebhookMessage('https://example.com/hook', 'x', fetchImpl));
  assert.equal(calls.length, 2, 'a disallowed URL is never fetched');
});

test('alert message: names the repo, ref, commit and each regression', () => {
  const text = notifier.formatAlertMessage({
    owner: 'octo', repo: 'speech', branch: 'HEAD', commitSha: 'deadbeefcafe',
    regressions: [{ kind: 'circular', message: '1 new circular dependency (0 → 1)', previous: 0, current: 1 }],
    workspaceUrl: 'https://app.example/workspace?repo=octo%2Fspeech',
  });
  assert.equal(text, 'Structrace: octo/speech (default branch @ deadbee) got worse\n• 1 new circular dependency (0 → 1)\nhttps://app.example/workspace?repo=octo%2Fspeech');
});

test('weekly digest: health trend, regressions, hotspots and notes; silent when nothing happened', () => {
  const { formatDigest } = tsRequire(resolve('server/src/services/weeklyDigest.ts'), import.meta.url);
  const base = { project: 'Shop', repository: 'octo/shop', health: null, analyses: 0, regressions: [], hotspots: [], notes: { open: 2, newThisWeek: 0 }, workspaceUrl: 'https://app/w' };
  assert.equal(formatDigest(base), null, 'open notes alone are not news');
  const text = formatDigest({ ...base, analyses: 3, health: { from: { score: 86, grade: 'B' }, to: { score: 81, grade: 'B' } },
    regressions: ['1 new circular dependency (0 → 1)'], hotspots: [{ path: 'src/a.ts', score: 90 }], notes: { open: 2, newThisWeek: 1 } });
  assert.equal(text, [
    'Structrace weekly: Shop (octo/shop)',
    '• Health B (86) → B (81), -5 over 3 analyzed commits',
    '• 1 regression:',
    '    – 1 new circular dependency (0 → 1)',
    '• Top hotspots: src/a.ts (90)',
    '• Team notes: 2 open, 1 new this week',
    'https://app/w',
  ].join('\n'));
  assert.match(formatDigest({ ...base, analyses: 1 }), /• 1 analyzed commit this week\n• No regressions/);
});
