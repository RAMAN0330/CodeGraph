import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UiStateError, mergeUiState } from './uiState';

test('merges per key, last writer wins, null deletes', () => {
  const current = { 'cg.a': { v: 1, t: 10 }, 'cg.b': { v: 'x', t: 10 } };
  const { state, changed } = mergeUiState(current, { 'cg.a': { v: 2, t: 20 }, 'cg.b': { v: 'old', t: 5 }, 'cg.c': { v: true, t: 1 } });
  assert.equal(changed, true);
  assert.deepEqual(state, { 'cg.a': { v: 2, t: 20 }, 'cg.b': { v: 'x', t: 10 }, 'cg.c': { v: true, t: 1 } });
  assert.deepEqual(mergeUiState(state, { 'cg.c': { v: null, t: 2 } }).state['cg.c'], undefined);
  assert.equal(mergeUiState(state, { 'cg.a': { v: 3, t: 20 } }).changed, false);
});

test('rejects bad keys, missing timestamps and oversize state', () => {
  assert.throws(() => mergeUiState({}, { token: { v: 'x', t: 1 } }), UiStateError);
  assert.throws(() => mergeUiState({}, { 'cg.a': { v: 1 } }), UiStateError);
  assert.throws(() => mergeUiState({}, [1]), UiStateError);
  assert.throws(() => mergeUiState({}, { 'cg.big': { v: 'x'.repeat(300 * 1024), t: 1 } }), UiStateError);
});
