import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetSharedPolls, sharedPoll } from './sharedPoll';

test('coalesces concurrent builds and reuses fresh results', async () => {
  let builds = 0;
  const build = async () => ++builds;
  let clock = 1000;
  const [a, b] = await Promise.all([sharedPoll('p1:overview', build, () => clock), sharedPoll('p1:overview', build, () => clock)]);
  assert.equal(builds, 1);
  assert.equal(a, b);
  clock += 1000;
  await sharedPoll('p1:overview', build, () => clock);
  assert.equal(builds, 1);
  clock += 5000;
  await sharedPoll('p1:overview', build, () => clock);
  assert.equal(builds, 2);
  forgetSharedPolls('p1:');
  await sharedPoll('p1:overview', build, () => clock);
  assert.equal(builds, 3);
});

test('a failed build is not cached', async () => {
  let calls = 0;
  const failing = async () => { calls++; throw new Error('db down'); };
  await assert.rejects(sharedPoll('p2:x', failing));
  await assert.rejects(sharedPoll('p2:x', failing));
  assert.equal(calls, 2);
});
