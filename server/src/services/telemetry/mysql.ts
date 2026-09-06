import type mysql from 'mysql2/promise';
import type {
  DbIdentity, EngineIntelligenceMetric, LatencyPercentiles, ReplicaRow,
  SecurityFinding, SecurityUserRow, StorageTableRow, TopQueryRow,
} from '../../types/telemetry';

type Connection = Awaited<ReturnType<typeof mysql.createConnection>>;

async function tryQuery<T = any>(connection: Connection, sql: string, params: any[] = []): Promise<T[] | null> {
  try {
    const [rows] = await connection.query(sql, params);
    return rows as T[];
  } catch {
    return null;
  }
}

async function statusMap(connection: Connection): Promise<Record<string, string>> {
  const rows = await tryQuery<{ Variable_name: string; Value: string }>(connection, 'SHOW GLOBAL STATUS');
  const map: Record<string, string> = {};
  for (const row of rows ?? []) map[row.Variable_name] = row.Value;
  return map;
}

export async function getIdentity(connection: Connection, database: string, host: string): Promise<DbIdentity> {
  const versionRows = await tryQuery<{ version: string }>(connection, 'SELECT VERSION() AS version');
  const status = await statusMap(connection);
  const uptime = status.Uptime ? Number(status.Uptime) : null;
  return { dbType: 'mysql', version: versionRows?.[0]?.version ?? null, host, database, uptimeSeconds: uptime };
}

export async function pingLatencyMs(connection: Connection): Promise<number | null> {
  const start = process.hrtime.bigint();
  const ok = await tryQuery(connection, 'SELECT 1');
  if (!ok) return null;
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000;
}

export async function getConnections(connection: Connection): Promise<{ active: number; idle: number; waiting: number; total: number; max: number | null }> {
  const status = await statusMap(connection);
  const total = status.Threads_connected ? Number(status.Threads_connected) : 0;
  const active = status.Threads_running ? Number(status.Threads_running) : 0;
  const maxRows = await tryQuery<{ Variable_name: string; Value: string }>(connection, "SHOW VARIABLES LIKE 'max_connections'");
  return { active, idle: Math.max(0, total - active), waiting: 0, total, max: maxRows?.[0] ? Number(maxRows[0].Value) : null };
}

export async function getCounters(connection: Connection): Promise<Record<string, number>> {
  const status = await statusMap(connection);
  const pick = (key: string) => (status[key] ? Number(status[key]) : 0);
  return {
    questions: pick('Questions'),
    com_select: pick('Com_select'),
    com_insert: pick('Com_insert'),
    com_update: pick('Com_update'),
    com_delete: pick('Com_delete'),
    slow_queries: pick('Slow_queries'),
    innodb_buffer_pool_reads: pick('Innodb_buffer_pool_reads'),
    innodb_buffer_pool_read_requests: pick('Innodb_buffer_pool_read_requests'),
  };
}

export function cacheHitRatio(counters: Record<string, number>): number | null {
  const requests = counters.innodb_buffer_pool_read_requests ?? 0;
  const reads = counters.innodb_buffer_pool_reads ?? 0;
  if (requests === 0) return null;
  return 1 - reads / requests;
}

export async function getStorage(connection: Connection, database: string): Promise<{ databaseSizeBytes: number | null; tables: StorageTableRow[] }> {
  const rows = await tryQuery<{ TABLE_NAME: string; TABLE_ROWS: string; DATA_LENGTH: string; INDEX_LENGTH: string }>(connection, `
    SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
    ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
    LIMIT 15`, [database]);
  const tables: StorageTableRow[] = (rows ?? []).map(r => {
    const data = Number(r.DATA_LENGTH) || 0;
    const index = Number(r.INDEX_LENGTH) || 0;
    return { name: r.TABLE_NAME, schema: database, rows: r.TABLE_ROWS === null ? null : Number(r.TABLE_ROWS), dataBytes: data, indexBytes: index, totalBytes: data + index };
  });
  const databaseSizeBytes = tables.reduce((sum, t) => sum + t.totalBytes, 0);
  return { databaseSizeBytes: tables.length ? databaseSizeBytes : null, tables };
}

export async function getReplication(connection: Connection): Promise<{ mode: 'standalone' | 'primary' | 'replica'; replicas: ReplicaRow[] }> {
  let rows = await tryQuery<any>(connection, 'SHOW REPLICA STATUS');
  if (!rows) rows = await tryQuery<any>(connection, 'SHOW SLAVE STATUS');
  if (rows && rows.length > 0) {
    const r = rows[0];
    const lagSeconds = r.Seconds_Behind_Source ?? r.Seconds_Behind_Master;
    return { mode: 'replica', replicas: [{ name: 'source', state: r.Replica_IO_Running ?? r.Slave_IO_Running ?? 'unknown', lagMs: lagSeconds === null || lagSeconds === undefined ? null : Number(lagSeconds) * 1000 }] };
  }
  const processRows = await tryQuery<any>(connection, 'SHOW PROCESSLIST');
  const hasReplicaConnections = (processRows ?? []).some((r: any) => r.Command === 'Binlog Dump' || r.Command === 'Binlog Dump GTID');
  return hasReplicaConnections ? { mode: 'primary', replicas: [] } : { mode: 'standalone', replicas: [] };
}

export async function getTopQueries(connection: Connection): Promise<{ available: boolean; reason?: string; queries: TopQueryRow[] }> {
  const rows = await tryQuery<any>(connection, `
    SELECT DIGEST AS fingerprint, DIGEST_TEXT AS query_text, COUNT_STAR AS calls,
           AVG_TIMER_WAIT / 1000000000 AS avg_ms, SUM_TIMER_WAIT / 1000000000 AS total_ms,
           SUM_ROWS_SENT AS rows_sent
    FROM performance_schema.events_statements_summary_by_digest
    WHERE DIGEST_TEXT IS NOT NULL
    ORDER BY SUM_TIMER_WAIT DESC
    LIMIT 20`);
  if (!rows) return { available: false, reason: 'performance_schema statement digests are not available on this database.', queries: [] };
  const queries: TopQueryRow[] = rows.map((r: any) => {
    const avgMs = Number(r.avg_ms) || 0;
    const impact: TopQueryRow['impact'] = avgMs > 1000 ? 'critical' : avgMs > 400 ? 'high' : avgMs > 100 ? 'medium' : 'low';
    return {
      fingerprint: `QRY-${String(r.fingerprint).slice(0, 12)}`,
      query: String(r.query_text ?? ''),
      calls: Number(r.calls) || 0,
      avgMs,
      p95Ms: null,
      totalMs: Number(r.total_ms) || 0,
      rows: r.rows_sent === null ? null : Number(r.rows_sent),
      impact,
    };
  });
  return { available: true, queries };
}

export async function getLatencyPercentiles(): Promise<LatencyPercentiles> {
  // MySQL has no built-in percentile-latency aggregate comparable to Postgres's
  // pg_stat_statements without enabling and querying performance_schema
  // histograms, which most managed MySQL instances don't expose by default.
  return { p50: null, p95: null, p99: null, available: false, reason: 'Percentile latency requires performance_schema histograms, which are not queried in this release.' };
}

export async function getSecurityPosture(connection: Connection): Promise<{ users: SecurityUserRow[]; findings: SecurityFinding[]; privilegedAccounts: number }> {
  const rows = await tryQuery<{ User: string; Host: string; Super_priv: string }>(connection, `
    SELECT User, Host, Super_priv FROM mysql.user`);
  if (!rows) return { users: [], findings: [], privilegedAccounts: 0 };
  const users: SecurityUserRow[] = rows.map(r => ({ name: `${r.User}@${r.Host}`, role: r.Super_priv === 'Y' ? 'superuser' : 'standard', privilege: r.Super_priv === 'Y' ? 'Full' : 'Standard' }));
  const superusers = users.filter(u => u.role === 'superuser');
  const findings: SecurityFinding[] = [];
  if (superusers.length > 1) findings.push({ severity: 'medium', summary: `${superusers.length} accounts have SUPER privilege.` });
  return { users, findings, privilegedAccounts: superusers.length };
}

export function buildEngineIntelligence(input: { cacheHitRatio: number | null; slowQueries: number; threadsRunning: number }): EngineIntelligenceMetric[] {
  return [
    { label: 'InnoDB Buffer Pool', value: input.cacheHitRatio === null ? 'Not available' : `${(input.cacheHitRatio * 100).toFixed(1)}% hit`, status: input.cacheHitRatio === null ? 'unknown' : input.cacheHitRatio < 0.9 ? 'warning' : 'healthy' },
    { label: 'Threads Running', value: String(input.threadsRunning) },
    { label: 'Slow Queries', value: String(input.slowQueries), status: input.slowQueries > 0 ? 'warning' : 'healthy' },
    { label: 'Table Locks', value: 'Not available' },
    { label: 'Temp Tables', value: 'Not available' },
    { label: 'Deadlocks', value: 'Not available' },
  ];
}
