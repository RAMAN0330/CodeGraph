import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const cycles = tsRequire(resolve('client/src/features/analysis/services/cycles.ts'), import.meta.url);

// conn source = file defining the function, target = file calling it.
const uses = (caller, defining, fn = 'f', count = 1) => ({ source: defining, target: caller, fn, count });

test('cycles: components of any length; acyclic files are not tangles', () => {
  const t = cycles.findTangles([uses('a', 'b'), uses('b', 'c'), uses('c', 'a'), uses('c', 'd'), uses('x', 'y'), uses('y', 'x')]);
  assert.deepEqual(t.map(x => x.files), [['a', 'b', 'c'], ['x', 'y']]);
  assert.deepEqual(cycles.findTangles([uses('a', 'b'), uses('b', 'c')]), []);
});

test('cycles: the plan cuts the dependency that frees the most files, cheapest first', () => {
  // Two loops share the edge c -> a: a->b->c->a and a->d->c->a. Cutting c->a frees all four.
  const conns = [uses('a', 'b'), uses('b', 'c'), uses('c', 'a', 'helper'), uses('a', 'd'), uses('d', 'c'), uses('c', 'a', 'format', 3)];
  const [tangle] = cycles.findTangles(conns);
  assert.equal(tangle.files.length, 4);
  assert.equal(tangle.planComplete, true);
  assert.deepEqual(tangle.plan.map(s => [s.from, s.to, s.freed, s.functions.sort(), s.calls]), [['c', 'a', 4, ['format', 'helper'], 4]]);
});

test('cycles: among equally effective cuts, the one with fewer functions wins', () => {
  const [t] = cycles.findTangles([uses('a', 'b', 'f1'), uses('a', 'b', 'f2'), uses('b', 'a', 'only')]);
  assert.deepEqual(t.plan.map(s => `${s.from}->${s.to}`), ['b->a']);
});

test('cycles: Tarjan handles long chains without recursion limits', () => {
  const n = 20000;
  const conns = Array.from({ length: n }, (_, i) => uses(`f${i}`, `f${(i + 1) % n}`));
  const comps = cycles.stronglyConnected(Array.from({ length: n }, (_, i) => `f${i}`), cycles.dependencyEdges(conns));
  assert.equal(comps.length, 1);
  assert.equal(comps[0].length, n);
});

test('cycles: files of one Go/Java package referencing each other are not a cycle', () => {
  assert.deepEqual(cycles.findTangles([uses('pkg/http/server.go', 'pkg/http/middleware.go'), uses('pkg/http/middleware.go', 'pkg/http/server.go')]), []);
  assert.equal(cycles.findTangles([uses('pkg/a/a.go', 'pkg/b/b.go'), uses('pkg/b/b.go', 'pkg/a/a.go')]).length, 1, 'across packages it still is');
});
