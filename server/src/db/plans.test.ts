import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasFeature, seatLimit } from './plans';

test('Business unlocks audit and roles; Team does not', () => {
  assert.equal(hasFeature('team', 'audit'), false);
  assert.equal(hasFeature('team', 'roles'), false);
  assert.equal(hasFeature('business', 'audit'), true);
  assert.equal(hasFeature('business', 'roles'), true);
});

test('Team is capped at 10 seats, Business is not', () => {
  assert.equal(seatLimit('team'), 10);
  assert.equal(seatLimit('business'), Infinity);
});
