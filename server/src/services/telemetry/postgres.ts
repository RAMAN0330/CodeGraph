import type { Client } from 'pg';
import type {
  ActivityEvent, DbIdentity, EngineIntelligenceMetric, HealthMatrixRow, LatencyPercentiles,
  ReplicaRow, SecurityFinding, SecurityUserRow, StorageTableRow, TopQueryRow,
} from '../../types/telemetry';

async function tryQuery<T = any>(client: Client, sql: string, params: any[] = []): Promise<T[] | null> {
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } catch {
    return null;
  }
}

export async function getIdentity(client: Client, database: string, host: string): Promise<DbIdentity> {
  const [versionRows, uptimeRows] = await Promise.all([
    tryQuery<{ version: string }>(client, 'SELECT version()'),
    tryQuery<{ uptime_seconds: string }>(client, "SELECT extract(epoch from now() - pg_postmaster_start_time()) AS uptime_seconds"),
  ]);
  const rawVersion = versionRows?.[0]?.version ?? null;
  const versionMatch = rawVersion?.match(/PostgreSQL ([\d.]+)/);
  return {
    dbType: 'postgres',
    version: versionMatch ? versionMatch[1] : rawVersion,
    host,
    database,
    uptimeSeconds: uptimeRows?.[0] ? Math.round(Number(uptimeRows[0].uptime_seconds)) : null,
  };
}

export async function pingLatencyMs(client: Client): Promise<number | null> {
  const start = process.hrtime.bigint();
  const ok = await tryQuery(client, 'SELECT 1');
  if (!ok) return null;
  const end = process.hrtime.bigint();
  return Number(end - start) / 1_000_000;
}

export async function getConnections(client: Client): Promise<{ active: number; idle: number; waiting: number; total: number; max: number | null }> {
  const [stateRows, maxRows] = await Promise.all([
    tryQuery<{ state: string | null; count: string }>(client, `
      SELECT state, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY state`),
    tryQuery<{ setting: string }>(client, "SHOW max_connections"),
  ]);
  let active = 0, idle = 0, waiting = 0, total = 0;
  for (const row of stateRows ?? []) {
    const count = Number(row.count);
    total += count;
    if (row.state === 'active') active += count;
    else if (row.state?.startsWith('idle')) idle += count;
  }
  const waitingRows = await tryQuery<{ count: string }>(client, `
    SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`);
  waiting = waitingRows ? Number(waitingRows[0]?.count ?? 0) : 0;
  return { active, idle, waiting, total, max: maxRows ? Number(maxRows[0]?.setting) : null };
}

export async function getDatabaseCounters(client: Client): Promise<Record<string, number> | null> {
  const rows = await tryQuery<Record<string, string>>(client, `
    SELECT xact_commit, xact_rollback, tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted,
           blks_hit, blks_read, deadlocks, temp_files, temp_bytes
    FROM pg_stat_database WHERE datname = current_database()`);
  const row = rows?.[0];
  if (!row) return null;
  const out: Record<string, number> = {};
  for (const key of Object.keys(row)) out[key] = Number(row[key]) || 0;
  return out;
}

export function cacheHitRatio(counters: Record<string, number> | null): number | null {
  if (!counters) return null;
  const hit = counters.blks_hit ?? 0;
  const read = counters.blks_read ?? 0;
  if (hit + read === 0) return null;
  return hit / (hit + read);
}

export async function getLockSummary(client: Client): Promise<{ blocked: number; totalLocks: number }> {
  const blockedRows = await tryQuery<{ count: string }>(client, `
    SELECT count(*) FROM pg_locks WHERE NOT granted`);
  const totalRows = await tryQuery<{ count: string }>(client, `SELECT count(*) FROM pg_locks`);
  return {
    blocked: blockedRows ? Number(blockedRows[0]?.count ?? 0) : 0,
    totalLocks: totalRows ? Number(totalRows[0]?.count ?? 0) : 0,
  };
}

export async function getStorage(client: Client): Promise<{ databaseSizeBytes: number | null; tables: StorageTableRow[] }> {
  const sizeRows = await tryQuery<{ size: string }>(client, 'SELECT pg_database_size(current_database()) AS size');
  const tableRows = await tryQuery<{ schemaname: string; relname: string; n_live_tup: string; total_bytes: string; data_bytes: string }>(client, `
    SELECT schemaname, relname, n_live_tup,
           pg_total_relation_size(relid) AS total_bytes,
           pg_relation_size(relid) AS data_bytes
    FROM pg_stat_user_tables
    ORDER BY total_bytes DESC
    LIMIT 15`);
  const tables: StorageTableRow[] = (tableRows ?? []).map(r => {
    const total = Number(r.total_bytes) || 0;
    const data = Number(r.data_bytes) || 0;
    return {
      name: r.relname,
      schema: r.schemaname,
      rows: r.n_live_tup === null ? null : Number(r.n_live_tup),
      dataBytes: data,
      indexBytes: Math.max(0, total - data),
      totalBytes: total,
    };
  });
  return { databaseSizeBytes: sizeRows ? Number(sizeRows[0]?.size) : null, tables };
}

export async function getReplication(client: Client): Promise<{ mode: 'standalone' | 'primary' | 'replica'; replicas: ReplicaRow[] }> {
  const isReplicaRows = await tryQuery<{ pg_is_in_recovery: boolean }>(client, 'SELECT pg_is_in_recovery()');
  const isReplica = isReplicaRows?.[0]?.pg_is_in_recovery === true;
  if (isReplica) return { mode: 'replica', replicas: [] };
  const replicationRows = await tryQuery<{ application_name: string; state: string; lag_ms: string | null }>(client, `
    SELECT application_name, state, extract(epoch from replay_lag) * 1000 AS lag_ms
    FROM pg_stat_replication`);
  if (!replicationRows || replicationRows.length === 0) return { mode: 'standalone', replicas: [] };
  return {
    mode: 'primary',
    replicas: replicationRows.map(r => ({ name: r.application_name || 'replica', state: r.state, lagMs: r.lag_ms === null ? null : Number(r.lag_ms) })),
  };
}

export async function getTopQueries(client: Client): Promise<{ available: boolean; reason?: string; queries: TopQueryRow[] }> {
  const extRows = await tryQuery<{ extname: string }>(client, "SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements'");
  if (!extRows || extRows.length === 0) {
    return { available: false, reason: 'pg_stat_statements extension is not enabled on this database.', queries: [] };
  }
  // Column names changed across Postgres versions (mean_time -> mean_exec_time in PG13+).
  let rows = await tryQuery<any>(client, `
    SELECT queryid, query, calls, mean_exec_time, total_exec_time, rows
    FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20`);
  if (!rows) {
    rows = await tryQuery<any>(client, `
      SELECT queryid, query, calls, mean_time AS mean_exec_time, total_time AS total_exec_time, rows
      FROM pg_stat_statements ORDER BY total_time DESC LIMIT 20`);
  }
  if (!rows) return { available: false, reason: 'Could not read pg_stat_statements.', queries: [] };
  const queries: TopQueryRow[] = rows.map(r => {
    const avgMs = Number(r.mean_exec_time) || 0;
    const impact: TopQueryRow['impact'] = avgMs > 1000 ? 'critical' : avgMs > 400 ? 'high' : avgMs > 100 ? 'medium' : 'low';
    return {
      fingerprint: `QRY-${r.queryid}`,
      query: String(r.query),
      calls: Number(r.calls) || 0,
      avgMs,
      p95Ms: null,
      totalMs: Number(r.total_exec_time) || 0,
      rows: r.rows === null || r.rows === undefined ? null : Number(r.rows),
      impact,
    };
  });
  return { available: true, queries };
}

export async function getLatencyPercentiles(client: Client): Promise<LatencyPercentiles> {
  const extRows = await tryQuery<{ extname: string }>(client, "SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements'");
  if (!extRows || extRows.length === 0) {
    return { p50: null, p95: null, p99: null, available: false, reason: 'pg_stat_statements extension is not enabled.' };
  }
  // pg_stat_statements only exposes mean/stddev, not true percentiles. We
  // approximate p95/p99 from mean+stddev rather than claiming exact values.
  let rows = await tryQuery<{ mean_exec_time: string; stddev_exec_time: string }>(client, `
    SELECT coalesce(avg(mean_exec_time), 0) AS mean_exec_time, coalesce(avg(stddev_exec_time), 0) AS stddev_exec_time
    FROM pg_stat_statements`);
  if (!rows) {
    rows = await tryQuery<{ mean_exec_time: string; stddev_exec_time: string }>(client, `
      SELECT coalesce(avg(mean_time), 0) AS mean_exec_time, coalesce(avg(stddev_time), 0) AS stddev_exec_time
      FROM pg_stat_statements`);
  }
  if (!rows || rows.length === 0) return { p50: null, p95: null, p99: null, available: false, reason: 'Could not read pg_stat_statements.' };
  const mean = Number(rows[0].mean_exec_time) || 0;
  const stddev = Number(rows[0].stddev_exec_time) || 0;
  return { p50: Math.round(mean), p95: Math.round(mean + stddev * 1.65), p99: Math.round(mean + stddev * 2.33), available: true };
}

export async function getSecurityPosture(client: Client): Promise<{ users: SecurityUserRow[]; findings: SecurityFinding[]; privilegedAccounts: number }> {
  const roleRows = await tryQuery<{ rolname: string; rolsuper: boolean; rolcreatedb: boolean; rolconnlimit: number }>(client, `
    SELECT rolname, rolsuper, rolcreatedb, rolconnlimit FROM pg_roles WHERE rolcanlogin = true ORDER BY rolname`);
  const users: SecurityUserRow[] = (roleRows ?? []).map(r => ({
    name: r.rolname,
    role: r.rolsuper ? 'superuser' : r.rolcreatedb ? 'createdb' : 'standard',
    privilege: r.rolsuper ? 'Full' : r.rolcreatedb ? 'Create DB' : 'Standard',
  }));
  const findings: SecurityFinding[] = [];
  const superusers = users.filter(u => u.role === 'superuser');
  if (superusers.length > 1) {
    findings.push({ severity: 'medium', summary: `${superusers.length} superuser roles exist (${superusers.map(u => u.name).join(', ')}).` });
  }
  const unlimited = (roleRows ?? []).filter(r => r.rolconnlimit === -1 && !r.rolsuper);
  if (unlimited.length > 0) {
    findings.push({ severity: 'low', summary: `${unlimited.length} non-superuser role(s) have an unlimited connection limit.` });
  }
  return { users, findings, privilegedAccounts: superusers.length };
}

export function buildHealthMatrix(input: {
  connections: { active: number; total: number; max: number | null };
  latencyMs: number | null;
  cacheHitRatio: number | null;
  deadlocks: number;
  blockedLocks: number;
  replicationMode: 'standalone' | 'primary' | 'replica';
  replicas: ReplicaRow[];
  queriesAvailable: boolean;
}): HealthMatrixRow[] {
  const connPct = input.connections.max ? input.connections.total / input.connections.max : 0;
  const laggingReplica = input.replicas.some(r => (r.lagMs ?? 0) > 5000);
  return [
    { category: 'connections', status: connPct > 0.9 ? 'critical' : connPct > 0.75 ? 'warning' : 'healthy', detail: input.connections.max ? `${input.connections.total}/${input.connections.max} used` : null },
    { category: 'latency', status: input.latencyMs === null ? 'unknown' : input.latencyMs > 200 ? 'critical' : input.latencyMs > 80 ? 'warning' : 'healthy', detail: input.latencyMs === null ? null : `${input.latencyMs.toFixed(1)}ms round-trip` },
    { category: 'queries', status: input.queriesAvailable ? 'healthy' : 'unknown', detail: input.queriesAvailable ? null : 'pg_stat_statements not enabled' },
    { category: 'locks', status: input.blockedLocks > 5 ? 'critical' : input.blockedLocks > 0 ? 'warning' : 'healthy', detail: input.blockedLocks > 0 ? `${input.blockedLocks} blocked` : null },
    { category: 'replication', status: input.replicationMode === 'standalone' ? 'unknown' : laggingReplica ? 'warning' : 'healthy', detail: input.replicationMode === 'standalone' ? 'Standalone instance' : null },
    { category: 'storage', status: 'healthy', detail: null },
    { category: 'cache', status: input.cacheHitRatio === null ? 'unknown' : input.cacheHitRatio < 0.9 ? 'warning' : 'healthy', detail: input.cacheHitRatio === null ? null : `${(input.cacheHitRatio * 100).toFixed(1)}% hit ratio` },
    { category: 'errors', status: input.deadlocks > 0 ? 'warning' : 'healthy', detail: input.deadlocks > 0 ? `${input.deadlocks} deadlocks total` : null },
  ];
}

export function buildEngineIntelligence(input: {
  cacheHitRatio: number | null;
  seqScans: number | null;
  deadlocks: number;
  blockedLocks: number;
  tempFiles: number | null;
}): EngineIntelligenceMetric[] {
  return [
    { label: 'Cache Hit Ratio', value: input.cacheHitRatio === null ? 'Not available' : `${(input.cacheHitRatio * 100).toFixed(1)}%`, status: input.cacheHitRatio === null ? 'unknown' : input.cacheHitRatio < 0.9 ? 'warning' : 'healthy' },
    { label: 'Sequential Scans', value: input.seqScans === null ? 'Not available' : String(input.seqScans) },
    { label: 'Deadlocks', value: String(input.deadlocks), status: input.deadlocks > 0 ? 'warning' : 'healthy' },
    { label: 'Locks (blocked)', value: String(input.blockedLocks), status: input.blockedLocks > 0 ? 'warning' : 'healthy' },
    { label: 'Temp Files', value: input.tempFiles === null ? 'Not available' : String(input.tempFiles) },
  ];
}

export async function getSeqScans(client: Client): Promise<number | null> {
  const rows = await tryQuery<{ total: string }>(client, 'SELECT coalesce(sum(seq_scan), 0) AS total FROM pg_stat_user_tables');
  return rows ? Number(rows[0]?.total ?? 0) : null;
}

export function classifySlowQuery(avgMs: number): ActivityEvent | null {
  if (avgMs < 1000) return null;
  return { at: new Date().toISOString(), kind: 'slow_query', summary: `Slow query detected`, detail: `${(avgMs / 1000).toFixed(1)}s average` };
}
