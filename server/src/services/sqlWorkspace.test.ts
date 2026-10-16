import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqlInputError, browseTable, clampLimit, explainQuery, flattenPostgresPlan, runQuery, singleStatement } from './sqlWorkspace';

test('singleStatement accepts one statement and ignores semicolons in strings and comments', () => {
  assert.equal(singleStatement('select 1;;  '), 'select 1');
  assert.equal(singleStatement("select ';' as x -- trailing; comment"), "select ';' as x -- trailing; comment");
  assert.equal(singleStatement('select $$a;b$$, "c;d", /* e;f */ 1'), 'select $$a;b$$, "c;d", /* e;f */ 1');
  assert.throws(() => singleStatement('select 1; delete from t'), SqlInputError);
  assert.throws(() => singleStatement("select 'x'; drop table t"), SqlInputError);
  assert.throws(() => singleStatement('   '), SqlInputError);
});

test('clampLimit defaults and caps the row limit', () => {
  assert.equal(clampLimit(undefined), 500);
  assert.equal(clampLimit(50), 50);
  assert.equal(clampLimit(1e9), 5000);
  assert.equal(clampLimit(-3), 500);
});

test('flattenPostgresPlan walks nested plans depth-first', () => {
  const nodes = flattenPostgresPlan([{ Plan: { 'Node Type': 'Hash Join', 'Total Cost': 10, 'Plan Rows': 5, 'Hash Cond': '(a.id = b.a_id)', Plans: [
    { 'Node Type': 'Seq Scan', 'Relation Name': 'a', 'Total Cost': 2, 'Plan Rows': 100 },
    { 'Node Type': 'Hash', Plans: [{ 'Node Type': 'Index Scan', 'Relation Name': 'b', 'Index Name': 'b_pkey' }] },
  ] } }]);
  assert.deepEqual(nodes.map(n => [n.depth, n.nodeType, n.relation]), [[0, 'Hash Join', null], [1, 'Seq Scan', 'a'], [1, 'Hash', null], [2, 'Index Scan', 'b']]);
  assert.equal(nodes[0].detail, '(a.id = b.a_id)');
  assert.equal(nodes[3].detail, 'using b_pkey');
});

// Runs against a real Postgres when TEST_PG_URL is set, e.g.
// TEST_PG_URL=postgres://cg:cg@localhost:5432/shop with tables customers(id, name, email).
const pgUrl = process.env.TEST_PG_URL;
const pg = pgUrl ? (() => { const u = new URL(pgUrl); return { dbType: 'postgres' as const, host: u.hostname, port: u.port || 5432, database: u.pathname.slice(1), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password) }; })() : null;

test('postgres: runs, caps rows in the database, rejects writes, explains and browses', { skip: !pg }, async () => {
  const result = await runQuery(pg!, 'select id, name from customers order by id', 10);
  assert.deepEqual(result.columns, ['id', 'name']);
  assert.equal(result.rowCount, 10);
  assert.equal(result.truncated, true);
  await assert.rejects(runQuery(pg!, "insert into customers(name) values ('x')"), /read-only/);
  await assert.rejects(runQuery(pg!, "with d as (delete from customers returning *) select * from d"));
  await assert.rejects(runQuery(pg!, 'set transaction read write'));
  assert.equal((await runQuery(pg!, 'select count(*) from customers')).rows[0][0], '5000');
  const plan = await explainQuery(pg!, 'select * from customers where id = 5');
  assert.ok(plan.nodes.length >= 1);
  const page = await browseTable(pg!, { table: 'customers', page: 1, pageSize: 25, sortColumn: 'id', sortDir: 'desc', filterColumn: 'email', filterValue: '@x.io' });
  assert.equal(page.rowCount, 25);
  assert.equal(page.hasMore, true);
  assert.ok(page.columns.includes('email'));
  await assert.rejects(browseTable(pg!, { table: 'customers; drop table orders' }), SqlInputError);
  const injected = await browseTable(pg!, { table: 'customers', sortColumn: 'id; drop table orders', filterColumn: 'name', filterValue: "'; drop table orders; --" });
  assert.equal(injected.rowCount, 0);
});
