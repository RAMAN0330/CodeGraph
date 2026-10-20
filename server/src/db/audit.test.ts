import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditCsv, parseAuditFilter, type AuditEntry } from './audit';

const entry = (over: Partial<AuditEntry>): AuditEntry => ({ id: 1, actorId: 1, actorName: 'raman', action: 'project.create', resourceType: 'project', resourceId: '3', meta: {}, ip: null, createdAt: '2026-10-20T12:00:00.000Z', ...over });

test('filter accepts safe values and clamps the page size', () => {
  assert.deepEqual(parseAuditFilter({ action: 'sql.run', actor: '4', before: '90', limit: '9999' }), { action: 'sql.run', actor: 4, before: 90, limit: 500 });
  assert.deepEqual(parseAuditFilter({ action: "x'; DROP TABLE users;--", actor: 'abc', limit: '0' }), { action: undefined, actor: undefined, before: undefined, limit: 1 });
  assert.equal(parseAuditFilter({}).limit, 100);
});

test('csv quotes cells and neutralises spreadsheet formulas', () => {
  const csv = auditCsv([entry({ actorName: '=HYPERLINK("x")', meta: { name: 'a,b' } })]);
  const [header, row] = csv.split('\n');
  assert.equal(header, '"time","actor","action","resource_type","resource_id","details","ip"');
  assert.match(row, /"'=HYPERLINK\(""x""\)"/);
  assert.match(row, /"{""name"":""a,b""}"/);
});
