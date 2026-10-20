import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const serverRequire = createRequire(resolve('server/package.json'));
const { require: tsRequire } = serverRequire('tsx/cjs/api');
const { codeAttention, databaseAttention, rankAttention } = tsRequire(resolve('client/src/shared/services/attention.ts'), import.meta.url);

test('code: critical findings outrank cycles, which outrank dead code', () => {
  const ranked = rankAttention(codeAttention({
    data: { securityIssues: [{ severity: 'high', path: 'a.js' }], deadFunctions: [{ name: 'x' }] },
    cycleCount: 1, cycleFiles: 4,
  }));
  assert.deepEqual(ranked.map(i => i.target), ['security', 'cycles', 'unused']);
});

test('reach breaks ties between equal severities', () => {
  const [wide, narrow] = rankAttention([
    ...codeAttention({ data: {}, cycleCount: 1, cycleFiles: 2 }),
    { ...codeAttention({ data: {}, cycleCount: 1, cycleFiles: 40 })[0], id: 'code:cycles-wide' },
  ]).reverse();
  assert.ok(wide.reach < narrow.reach);
});

test('database: alerts, unhealthy checks and tables without keys become items', () => {
  const items = databaseAttention({
    overview: {
      activeAlerts: [{ rule: { id: 7, metric: 'p95_latency_ms', condition: 'gt', threshold: 500, forMinutes: 5 }, currentValue: 812, severity: 'critical' }],
      healthMatrix: [{ category: 'storage', status: 'warning', detail: 'Disk 91% full' }, { category: 'cache', status: 'healthy', detail: null }],
      topQueries: [{ impact: 'high', avgMs: 900, calls: 1200 }],
      connections: { waiting: 2 },
    },
    tables: [{ name: 'audit_log', columns: [{ isPrimary: false }] }, { name: 'orders', columns: [{ isPrimary: true }] }],
  });
  const ids = items.map(i => i.id).sort();
  assert.deepEqual(ids, ['db:alert:7', 'db:health:storage', 'db:no-pk', 'db:slow-queries', 'db:waiting']);
  assert.equal(rankAttention(items)[0].id, 'db:alert:7');
});

test('a healthy project produces an empty feed', () => {
  assert.deepEqual(codeAttention({ data: {} }), []);
  assert.deepEqual(databaseAttention({ overview: { activeAlerts: [], healthMatrix: [], topQueries: [], connections: { waiting: 0 } } }), []);
});
