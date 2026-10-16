import type { Client } from 'pg';
import { connectMysql, connectPostgres, type MysqlConnection } from './customerDb';
import type { DbConnectionInput } from '../db/projectStore';

// SQL editor and table browser for a project's customer database. Every
// statement runs on a read-only session inside a read-only transaction with a
// statement timeout, results are capped at a row limit (enforced in the
// database where the statement allows it, not by fetching everything), and
// only one statement is accepted per run.

export const MAX_ROW_LIMIT = 5000;
export const DEFAULT_ROW_LIMIT = 500;
const STATEMENT_TIMEOUT_MS = 15000;
const MAX_CELL_CHARS = 4000;
const MAX_SQL_CHARS = 100_000;

export class SqlInputError extends Error {}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  limit: number;
}

export interface PlanNode {
  depth: number;
  nodeType: string;
  relation: string | null;
  totalCost: number | null;
  planRows: number | null;
  detail: string | null;
}

export interface ExplainResult {
  durationMs: number;
  nodes: PlanNode[];
  raw: unknown;
}

// Returns the statement without trailing semicolons, or throws when it holds
// more than one statement. Quotes, dollar-quoted bodies and comments are
// skipped so a ';' inside them doesn't count.
export function singleStatement(sql: string): string {
  if (typeof sql !== 'string' || !sql.trim()) throw new SqlInputError('Enter a SQL statement.');
  if (sql.length > MAX_SQL_CHARS) throw new SqlInputError('The statement is too long (limit 100,000 characters).');
  const text = sql.trim().replace(/;+\s*$/, '');
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '-' && next === '-') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end + 1;
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\' && ch === "'") { j += 2; continue; }
        if (text[j] === ch) { if (text[j + 1] === ch) { j += 2; continue; } break; }
        j++;
      }
      i = j + 1;
    } else if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
      if (tag) {
        const end = text.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? text.length : end + tag[0].length;
      } else i++;
    } else if (ch === ';') {
      throw new SqlInputError('Run one statement at a time.');
    } else i++;
  }
  return text;
}

export function clampLimit(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_ROW_LIMIT;
  return Math.min(n, MAX_ROW_LIMIT);
}

const ROW_RETURNING = /^\s*(\(\s*)*(select|with|values|table)\b/i;

function jsonCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.subarray(0, 64).toString('hex')}${value.length > 64 ? '…' : ''}`;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') value = JSON.stringify(value);
  if (typeof value === 'string' && value.length > MAX_CELL_CHARS) return `${value.slice(0, MAX_CELL_CHARS)}…`;
  return value;
}

function shape(columns: string[], rows: unknown[][], limit: number, durationMs: number): Omit<QueryResult, 'limit'> {
  const truncated = rows.length > limit;
  const kept = truncated ? rows.slice(0, limit) : rows;
  return { columns, rows: kept.map(r => r.map(jsonCell)), rowCount: kept.length, truncated, durationMs: Math.round(durationMs * 10) / 10 };
}

const elapsedMs = (start: bigint) => Number(process.hrtime.bigint() - start) / 1_000_000;

async function withPostgres<T>(conn: DbConnectionInput, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connectPostgres(conn);
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await client.query('BEGIN READ ONLY');
    // Taking a snapshot first means SET TRANSACTION READ WRITE can no longer
    // switch this transaction to read-write.
    await client.query('SELECT 1');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

async function withMysql<T>(conn: DbConnectionInput, fn: (connection: MysqlConnection) => Promise<T>): Promise<T> {
  const connection = await connectMysql(conn);
  try {
    await connection.query(`SET SESSION MAX_EXECUTION_TIME = ${STATEMENT_TIMEOUT_MS}`);
    await connection.query('START TRANSACTION READ ONLY');
    return await fn(connection);
  } finally {
    await connection.query('ROLLBACK').catch(() => undefined);
    await connection.end().catch(() => undefined);
  }
}

async function mysqlRows(connection: MysqlConnection, sql: string, params: unknown[] = []): Promise<{ columns: string[]; rows: unknown[][] }> {
  const [rows, fields] = await connection.query({ sql, values: params, rowsAsArray: true });
  return { columns: (fields as Array<{ name: string }> | undefined)?.map(f => f.name) ?? [], rows: Array.isArray(rows) ? (rows as unknown[][]) : [] };
}

export async function runQuery(conn: DbConnectionInput, sql: string, rowLimit?: unknown): Promise<QueryResult> {
  const statement = singleStatement(sql);
  const limit = clampLimit(rowLimit);
  // Row-returning statements are wrapped so the database stops after limit+1
  // rows; anything else (SHOW, EXPLAIN, …) runs as written.
  const wrapped = ROW_RETURNING.test(statement) ? `SELECT * FROM (${statement}\n) AS cg_result LIMIT ${limit + 1}` : null;
  if (conn.dbType === 'mysql') {
    return withMysql(conn, async connection => {
      const start = process.hrtime.bigint();
      let result;
      try {
        result = await mysqlRows(connection, wrapped ?? statement);
      } catch (error: any) {
        // MySQL rejects derived tables with duplicate column names; run as written.
        if (!wrapped || error?.code !== 'ER_DUP_FIELDNAME') throw error;
        result = await mysqlRows(connection, statement);
      }
      return { ...shape(result.columns, result.rows, limit, elapsedMs(start)), limit };
    });
  }
  return withPostgres(conn, async client => {
    const start = process.hrtime.bigint();
    const result = await client.query({ text: wrapped ?? statement, rowMode: 'array' });
    const rows = (Array.isArray(result) ? result[result.length - 1] : result) as { fields?: Array<{ name: string }>; rows?: unknown[][] };
    return { ...shape(rows.fields?.map(f => f.name) ?? [], rows.rows ?? [], limit, elapsedMs(start)), limit };
  });
}

export function flattenPostgresPlan(raw: unknown): PlanNode[] {
  const nodes: PlanNode[] = [];
  const visit = (plan: any, depth: number) => {
    if (!plan || typeof plan !== 'object') return;
    const detail = plan['Index Name'] ? `using ${plan['Index Name']}` : plan['Filter'] ?? plan['Hash Cond'] ?? plan['Join Filter'] ?? plan['Sort Key']?.join?.(', ') ?? null;
    nodes.push({
      depth,
      nodeType: String(plan['Node Type'] ?? 'Unknown'),
      relation: plan['Relation Name'] ?? null,
      totalCost: typeof plan['Total Cost'] === 'number' ? plan['Total Cost'] : null,
      planRows: typeof plan['Plan Rows'] === 'number' ? plan['Plan Rows'] : null,
      detail: detail ? String(detail) : null,
    });
    for (const child of plan.Plans ?? []) visit(child, depth + 1);
  };
  const root = Array.isArray(raw) ? raw[0] : raw;
  visit((root as any)?.Plan, 0);
  return nodes;
}

// The estimated plan only: EXPLAIN without ANALYZE never executes the statement.
export async function explainQuery(conn: DbConnectionInput, sql: string): Promise<ExplainResult> {
  const statement = singleStatement(sql);
  if (conn.dbType === 'mysql') {
    return withMysql(conn, async connection => {
      const start = process.hrtime.bigint();
      const { rows } = await mysqlRows(connection, `EXPLAIN FORMAT=JSON ${statement}`);
      const text = rows[0]?.[0];
      return { durationMs: Math.round(elapsedMs(start)), nodes: [], raw: typeof text === 'string' ? JSON.parse(text) : text };
    });
  }
  return withPostgres(conn, async client => {
    const start = process.hrtime.bigint();
    const result = await client.query({ text: `EXPLAIN (FORMAT JSON) ${statement}`, rowMode: 'array' });
    const raw = result.rows[0]?.[0];
    return { durationMs: Math.round(elapsedMs(start)), nodes: flattenPostgresPlan(raw), raw };
  });
}

export interface BrowseOptions {
  schema?: string;
  table: string;
  page?: unknown;
  pageSize?: unknown;
  sortColumn?: string;
  sortDir?: string;
  filterColumn?: string;
  filterValue?: string;
}

export interface BrowseResult extends QueryResult {
  page: number;
  pageSize: number;
  hasMore: boolean;
  estimatedTotal: number | null;
  columnTypes: string[];
}

const quotePg = (name: string) => `"${name.replace(/"/g, '""')}"`;
const quoteMy = (name: string) => `\`${name.replace(/`/g, '``')}\``;

// Paged table rows. Table and column names are checked against the
// database's own catalog before they are quoted into SQL; the filter value is
// always a bound parameter. The total is the planner's estimate, so paging a
// huge table never runs COUNT(*).
export async function browseTable(conn: DbConnectionInput, options: BrowseOptions): Promise<BrowseResult> {
  const pageSize = Math.min(Math.max(Math.floor(Number(options.pageSize)) || 100, 10), 1000);
  const page = Math.max(Math.floor(Number(options.page)) || 0, 0);
  const dir = String(options.sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const filterValue = typeof options.filterValue === 'string' ? options.filterValue.slice(0, 500) : '';

  if (conn.dbType === 'mysql') {
    return withMysql(conn, async connection => {
      const { rows: columnRows } = await mysqlRows(connection,
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position',
        [conn.database, options.table]);
      if (!columnRows.length) throw new SqlInputError(`Table ${options.table} was not found.`);
      const names = columnRows.map(r => String(r[0]));
      const where = filterValue && options.filterColumn && names.includes(options.filterColumn)
        ? ` WHERE CAST(${quoteMy(options.filterColumn)} AS CHAR) LIKE ?` : '';
      const order = options.sortColumn && names.includes(options.sortColumn) ? ` ORDER BY ${quoteMy(options.sortColumn)} ${dir}` : '';
      const start = process.hrtime.bigint();
      const { rows } = await mysqlRows(connection,
        `SELECT * FROM ${quoteMy(options.table)}${where}${order} LIMIT ${pageSize + 1} OFFSET ${page * pageSize}`,
        where ? [`%${filterValue}%`] : []);
      const duration = elapsedMs(start);
      const { rows: estimate } = await mysqlRows(connection, 'SELECT table_rows FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [conn.database, options.table]);
      const shaped = shape(names, rows, pageSize, duration);
      return { ...shaped, limit: pageSize, page, pageSize, hasMore: shaped.truncated, estimatedTotal: estimate[0]?.[0] != null ? Number(estimate[0][0]) : null, columnTypes: columnRows.map(r => String(r[1])) };
    });
  }

  const schema = options.schema || 'public';
  return withPostgres(conn, async client => {
    const columnResult = await client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position',
      [schema, options.table]);
    if (!columnResult.rowCount) throw new SqlInputError(`Table ${schema}.${options.table} was not found.`);
    const names: string[] = columnResult.rows.map((r: any) => r.column_name);
    const where = filterValue && options.filterColumn && names.includes(options.filterColumn)
      ? ` WHERE CAST(${quotePg(options.filterColumn)} AS text) ILIKE $1` : '';
    const order = options.sortColumn && names.includes(options.sortColumn) ? ` ORDER BY ${quotePg(options.sortColumn)} ${dir} NULLS LAST` : '';
    const start = process.hrtime.bigint();
    const result = await client.query({
      text: `SELECT * FROM ${quotePg(schema)}.${quotePg(options.table)}${where}${order} LIMIT ${pageSize + 1} OFFSET ${page * pageSize}`,
      values: where ? [`%${filterValue}%`] : [],
      rowMode: 'array',
    });
    const duration = elapsedMs(start);
    const estimate = await client.query('SELECT reltuples::bigint AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = $2', [schema, options.table]);
    const n = Number(estimate.rows[0]?.n);
    const shaped = shape(names, result.rows, pageSize, duration);
    return { ...shaped, limit: pageSize, page, pageSize, hasMore: shaped.truncated, estimatedTotal: Number.isFinite(n) && n >= 0 ? n : null, columnTypes: columnResult.rows.map((r: any) => r.data_type) };
  });
}
