import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// The server package is CommonJS TypeScript; load it the way `tsx` runs it.
const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const load = async path => tsRequire(resolve(path), import.meta.url);

const githubApp = await load('server/src/services/githubApp.ts');
const prReview = await load('server/src/services/prReview.ts');
const impact = await load('server/src/analysis/sharedRules.ts');

const sign = (body, secret) => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

test('webhook signature: only an HMAC of the exact raw body with the secret passes', () => {
  const body = Buffer.from('{"action":"opened"}');
  assert.equal(githubApp.verifyWebhookSignature(body, sign(body, 's3cret'), 's3cret'), true);
  assert.equal(githubApp.verifyWebhookSignature(body, sign(body, 'other'), 's3cret'), false);
  assert.equal(githubApp.verifyWebhookSignature(Buffer.from('{"action":"opened" }'), sign(body, 's3cret'), 's3cret'), false);
  assert.equal(githubApp.verifyWebhookSignature(body, 'sha1=abc', 's3cret'), false);
  assert.equal(githubApp.verifyWebhookSignature(body, undefined, 's3cret'), false);
  assert.equal(githubApp.verifyWebhookSignature(body, sign(body, ''), ''), false, 'no secret configured never verifies');
});

test('app JWT: RS256-signed, issued by the app id, within GitHub\'s 10-minute limit', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs1', format: 'pem' });
  const jwt = githubApp.createAppJwt('12345', pem, 1_700_000_000);
  const [header, payload, signature] = jwt.split('.');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')));
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  assert.equal(claims.iss, '12345');
  assert.ok(claims.exp - claims.iat <= 600);
});

const prEvent = (overrides = {}) => ({
  action: 'opened',
  installation: { id: 77 },
  repository: { name: 'speech', owner: { login: 'octo' } },
  pull_request: { number: 9, state: 'open', draft: false, head: { sha: 'abc123' } },
  ...overrides,
});

test('webhook events: open, non-draft PR code changes queue a review', () => {
  assert.deepEqual(prReview.prReviewJobFromEvent('pull_request', prEvent()), { owner: 'octo', repo: 'speech', number: 9, headSha: 'abc123', installationId: 77 });
  for (const action of ['reopened', 'synchronize', 'ready_for_review']) {
    assert.ok(prReview.prReviewJobFromEvent('pull_request', prEvent({ action })), action);
  }
});

test('webhook events: everything else is ignored', () => {
  assert.equal(prReview.prReviewJobFromEvent('push', prEvent()), null);
  assert.equal(prReview.prReviewJobFromEvent('pull_request', prEvent({ action: 'labeled' })), null);
  assert.equal(prReview.prReviewJobFromEvent('pull_request', prEvent({ pull_request: { number: 9, state: 'open', draft: true, head: { sha: 'a' } } })), null);
  assert.equal(prReview.prReviewJobFromEvent('pull_request', prEvent({ pull_request: { number: 9, state: 'closed', head: { sha: 'a' } } })), null);
  assert.equal(prReview.prReviewJobFromEvent('pull_request', prEvent({ repository: { name: '../etc', owner: { login: 'octo' } } })), null);
  assert.equal(prReview.prReviewJobFromEvent('pull_request', prEvent({ installation: undefined })), null);
});

// a.ts is imported by b, c, d, e, f, g (6 dependents); test file mirrors b.
const analysis = {
  files: ['src/core/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts', 'src/g.ts', 'src/b.test.ts']
    .map(path => ({ path, name: path.split('/').pop() })),
  connections: ['b', 'c', 'd', 'e', 'f', 'g'].map(x => ({ source: 'src/core/a.ts', target: `src/${x}.ts`, fn: 'run', count: 1 })),
};

test('shared impact rules score a PR the same way the workspace modal does', () => {
  const pr = { files: [{ filename: 'src/core/a.ts' }, { filename: 'src/b.ts' }], additions: 250, deletions: 10 };
  const risk = impact.calcPRRisk(pr, analysis);
  assert.equal(risk.totalBlast, 6);
  assert.deepEqual(risk.hotspots, [{ file: 'src/core/a.ts', blast: 6 }]);
  assert.ok(risk.factors.includes('Core files modified (1)'));
  assert.ok(risk.factors.includes('Moderate changeset'));
  assert.deepEqual(impact.findTestImpact(pr, analysis), [{ file: 'b.test.ts', path: 'src/b.test.ts' }]);
  assert.equal(impact.calcBlast('src/core/a.ts', analysis.connections, analysis.files).count, 6);
});

test('review comment: carries the update marker, the risk, reach, tests and reviewers', () => {
  const md = prReview.renderPrReviewMarkdown({
    owner: 'octo', repo: 'speech', number: 9, title: 't', url: 'u', author: 'me', headSha: 'abc', baseRef: 'main',
    analyzedCommit: 'deadbeefcafe', additions: 250, deletions: 10,
    files: [{ filename: 'src/core/a`b.ts', status: 'modified', additions: 1, deletions: 1, dependents: 6 }],
    risk: { score: 52, level: 'high', factors: ['Core files modified (1)'], totalBlast: 6 },
    testImpact: [{ file: 'b.test.ts', path: 'src/b.test.ts' }],
    chains: [],
    reviewers: [{ login: 'alice', commits: 3 }],
  }, 'https://app.example/workspace?repo=octo%2Fspeech');
  assert.ok(md.startsWith(prReview.REVIEW_MARKER));
  assert.match(md, /\*\*Risk: HIGH \(52\/100\)\*\*/);
  assert.match(md, /\| `src\/core\/a'b\.ts` \| 6 \|/, 'backticks in paths cannot break out of code spans');
  assert.match(md, /- `src\/b\.test\.ts`/);
  assert.match(md, /@alice \(3 recent commits to these files\)/);
  assert.match(md, /`main` @ `deadbee`/);
  assert.match(md, /\[Open in Structrace\]\(https:\/\/app\.example/);
});
