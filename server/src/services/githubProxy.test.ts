import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearGithubProxyCache, isAllowedProxyPath, proxyGithubGet } from './githubProxy';

test('only repo-scoped, user repo list and rate limit paths are proxied', () => {
  assert.ok(isAllowedProxyPath('/repos/octo/hello/commits?per_page=5'));
  assert.ok(isAllowedProxyPath('/repos/octo/hello'));
  assert.ok(isAllowedProxyPath('/user/repos'));
  assert.ok(isAllowedProxyPath('/rate_limit'));
  assert.ok(!isAllowedProxyPath('/user'));
  assert.ok(!isAllowedProxyPath('/repos/octo/../admin'));
  assert.ok(!isAllowedProxyPath('/app/installations/1/access_tokens'));
  assert.ok(!isAllowedProxyPath('/user/emails'));
});

test('serves fresh hits from memory, coalesces concurrent calls and caches per token', async () => {
  clearGithubProxyCache();
  let calls = 0;
  const fakeFetch = (async () => {
    calls++;
    return new Response('[1]', { status: 200, headers: { etag: '"a"', 'x-ratelimit-remaining': '42' } });
  }) as unknown as typeof fetch;
  const [a, b] = await Promise.all([
    proxyGithubGet('/repos/o/r/commits', 't1', fakeFetch),
    proxyGithubGet('/repos/o/r/commits', 't1', fakeFetch),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.body, '[1]');
  assert.equal(b.rateLimit.remaining, '42');
  const again = await proxyGithubGet('/repos/o/r/commits', 't1', fakeFetch);
  assert.equal(again.cached, true);
  assert.equal(calls, 1);
  await proxyGithubGet('/repos/o/r/commits', 't2', fakeFetch);
  assert.equal(calls, 2, 'another token must not read the first token\'s cache');
});

test('does not cache 202 stats-computing responses', async () => {
  clearGithubProxyCache();
  let calls = 0;
  const fakeFetch = (async () => { calls++; return new Response('', { status: 202 }); }) as unknown as typeof fetch;
  await proxyGithubGet('/repos/o/r/stats/commit_activity', 't', fakeFetch);
  await proxyGithubGet('/repos/o/r/stats/commit_activity', 't', fakeFetch);
  assert.equal(calls, 2);
});
