import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// The server package is CommonJS TypeScript; load it the way `tsx` runs it.
const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const load = async path => tsRequire(resolve(path), import.meta.url);

const repoAccess = await load('server/src/services/repoAccess.ts');
const cipher = await load('server/src/services/credentialCipher.ts');

function stubFetch(status, responseHeaders = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init?.headers?.Authorization });
    if (status === 'throw') throw new Error('network down');
    return { status, headers: new Headers(responseHeaders) };
  };
  return { calls, fetchImpl };
}

test('repo access: a readable repository is allowed and memoized per token', async () => {
  repoAccess.clearRepoAccessCache();
  const { calls, fetchImpl } = stubFetch(200);
  assert.equal(await repoAccess.canReadRepository('octocat', 'hello', 'tok_a', fetchImpl), true);
  assert.equal(await repoAccess.canReadRepository('OctoCat', 'Hello', 'tok_a', fetchImpl), true);
  assert.equal(calls.length, 1, 'second check for the same principal/repo is served from memo');
  assert.equal(calls[0].auth, 'token tok_a');
});

test('repo access: a different principal is checked independently (no cross-user reuse)', async () => {
  repoAccess.clearRepoAccessCache();
  const allowed = stubFetch(200);
  await repoAccess.canReadRepository('acme', 'private', 'owner_token', allowed.fetchImpl);
  const denied = stubFetch(404);
  assert.equal(await repoAccess.canReadRepository('acme', 'private', undefined, denied.fetchImpl), false);
  assert.equal(await repoAccess.canReadRepository('acme', 'private', 'other_token', denied.fetchImpl), false);
  assert.equal(denied.calls.length, 2);
  assert.equal(denied.calls[0].auth, undefined);
});

test('repo access: transient GitHub failures fail closed and are not memoized', async () => {
  repoAccess.clearRepoAccessCache();
  assert.equal(await repoAccess.canReadRepository('a', 'b', 't', stubFetch(502).fetchImpl), false);
  assert.equal(await repoAccess.canReadRepository('a', 'b', 't', stubFetch('throw').fetchImpl), false);
  const ok = stubFetch(200);
  assert.equal(await repoAccess.canReadRepository('a', 'b', 't', ok.fetchImpl), true);
  assert.equal(ok.calls.length, 1);
});

test('repo access: a GitHub rate-limit 403 is not remembered as "no access"', async () => {
  repoAccess.clearRepoAccessCache();
  assert.equal(await repoAccess.canReadRepository('a', 'b', 't', stubFetch(403, { 'x-ratelimit-remaining': '0' }).fetchImpl), false);
  assert.equal(await repoAccess.canReadRepository('a', 'b', 't', stubFetch(200).fetchImpl), true);
});

test('repo access: malformed owner/repo never reaches GitHub', async () => {
  const { calls, fetchImpl } = stubFetch(200);
  for (const [owner, repo] of [['..', 'x'], ['a/b', 'c'], ['', 'c'], ['a', 'c?x=1']]) {
    assert.equal(await repoAccess.canReadRepository(owner, repo, undefined, fetchImpl), false);
  }
  assert.equal(calls.length, 0);
});

test('clone URL validation only accepts https github.com owner/repo', () => {
  assert.deepEqual(repoAccess.parseGithubCloneUrl('https://github.com/octocat/hello-world'), { owner: 'octocat', repo: 'hello-world', url: 'https://github.com/octocat/hello-world.git' });
  assert.equal(repoAccess.parseGithubCloneUrl('https://github.com/octocat/hello-world.git/').repo, 'hello-world');
  for (const bad of ['file:///etc/passwd', 'ssh://git@github.com/a/b', 'https://evil.test/a/b', 'https://tok@github.com/a/b',
    'https://github.com/a/..', 'https://github.com/a/b/c', 'http://github.com/a/b', 'ext::sh -c id', 42, null]) {
    assert.equal(repoAccess.parseGithubCloneUrl(bad), null, `should reject ${String(bad)}`);
  }
});

test('GitHub tokens are encrypted at rest and legacy plaintext rows still read back', () => {
  const stored = cipher.encryptSecret('gho_exampleToken123');
  assert.notEqual(stored, 'gho_exampleToken123');
  assert.doesNotMatch(stored, /gho_/);
  assert.equal(cipher.revealSecret(stored), 'gho_exampleToken123');
  assert.equal(cipher.revealSecret('gho_legacyPlaintext'), 'gho_legacyPlaintext');
  assert.equal(cipher.revealSecret(null), null);
  const tampered = stored.slice(0, -2) + (stored.endsWith('00') ? '11' : '00');
  assert.equal(cipher.revealSecret(tampered), null, 'undecryptable values degrade to "not connected"');
});

test('outbound, paid and job-starting routes require an authenticated session', async () => {
  const source = await readFile('server/src/index.ts', 'utf8');
  for (const route of [
    "app.post('/api/db/connect/postgres'",
    "app.post('/api/db/connect/mysql'",
    "app.post('/api/github/repo'",
    "app.post('/api/github/file'",
    "app.post('/api/architecture/enrich'",
    "app.post('/api/analyze'",
    "app.get('/api/tasks/:taskId'",
    "app.get('/api/github/access/:owner/:repo'",
  ]) {
    const line = source.split('\n').find(candidate => candidate.startsWith(route));
    assert.ok(line, `${route} must exist`);
    assert.match(line, /requireAuth/, `${route} must be guarded by requireAuth`);
  }
  assert.doesNotMatch(source, /app\.all\('\/api\/analyze'/, 'the analysis proxy must not accept unauthenticated requests');
});

test('shared repo caches are only served after an access check', async () => {
  const source = await readFile('server/src/index.ts', 'utf8');
  const repoRoute = source.slice(source.indexOf("app.post('/api/github/repo'"), source.indexOf("app.post('/api/github/file'"));
  assert.ok(repoRoute.indexOf('canReadRepository') > -1 && repoRoute.indexOf('canReadRepository') < repoRoute.indexOf('cached.fresh'));
  const fileRoute = source.slice(source.indexOf("app.post('/api/github/file'"), source.indexOf('// Optional text-only enrichment'));
  assert.equal((fileRoute.match(/canReadRepository/g) || []).length, 2, 'both blob and path caches are access-checked');
});
