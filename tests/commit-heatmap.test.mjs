import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const hm = tsRequire(resolve('client/src/features/git-insights/services/heatmap.ts'), import.meta.url);

// 52 Sunday-aligned weeks ending with the week of Wed 2026-10-07 (UTC).
const lastSunday = Date.UTC(2026, 9, 4) / 1000;
const weeks = Array.from({ length: 52 }, (_, i) => ({ week: lastSunday - (51 - i) * 7 * 86400, total: 0, days: [0, 0, 0, 0, 0, 0, 0] }));
weeks[51].days = [0, 2, 3, 1, 9, 9, 9];        // Thu–Sat are after "today"
weeks[50].days = [1, 1, 1, 1, 1, 1, 40];       // Sat 2026-10-03 is the busiest day
const today = new Date(Date.UTC(2026, 9, 7, 15));

test('heatmap: Sunday-first columns with UTC dates; days after today are future and blank', () => {
  const h = hm.buildHeatmap(weeks, today);
  assert.equal(h.weeks.length, 52);
  assert.equal(h.weeks[51][0].date, '2026-10-04');
  assert.equal(h.weeks[51][3].date, '2026-10-07');
  assert.deepEqual(h.weeks[51].slice(4).map(c => [c.future, c.level]), [[true, 0], [true, 0], [true, 0]]);
  assert.equal(h.total, 52, 'future days are not counted');
});

test('heatmap: levels by quartile of active days, streaks and the busiest day', () => {
  const h = hm.buildHeatmap(weeks, today);
  assert.equal(h.weeks[50][6].level, 4);
  assert.equal(h.weeks[50][0].level, 1);
  assert.equal(h.weeks[0][0].level, 0);
  assert.equal(h.activeDays, 10);
  assert.equal(h.longestStreak, 7, 'Sun 9/27 through Sat 10/3; the empty Sun 10/4 breaks it');
  assert.deepEqual(h.busiest, { date: '2026-10-03', count: 40 });
});

test('heatmap: month labels where the month changes, never crammed together', () => {
  const h = hm.buildHeatmap(weeks, today);
  const cols = h.months.map(m => m.column);
  assert.ok(cols.every((c, i) => i === 0 || c - cols[i - 1] >= 3));
  assert.ok(cols.every(c => c <= h.weeks.length - 2), 'no label clipped at the right edge');
  assert.deepEqual(h.months.slice(-2).map(m => m.label), ['Aug', 'Sep']);
});

test('commit activity: retries while GitHub is still computing; no token means no auth header', async () => {
  const calls = [];
  const statuses = [202, 202, 200];
  const fetchImpl = async (url, init) => { calls.push(init.headers); const status = statuses.shift(); return { status, ok: status === 200, json: async () => [{ week: 1, total: 1, days: [1, 0, 0, 0, 0, 0, 0] }] }; };
  assert.equal((await hm.fetchCommitActivity('o', 'r', null, fetchImpl, 5, 0)).length, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].Authorization, undefined);
  const always202 = async () => ({ status: 202, ok: false });
  assert.equal(await hm.fetchCommitActivity('o', 'r', 't', always202, 2, 0), null);
});
