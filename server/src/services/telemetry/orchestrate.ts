import { Client } from 'pg';
import mysql from 'mysql2/promise';
import type { DbConnectionInput } from '../../db/projectStore';
import * as pg from './postgres';
import * as my from './mysql';
import { computeRates, pushActivityEvent, getRecentActivity } from './rateCache';
import { maybeWriteSnapshot, getGrowthOverDays, getSnapshotHistory, listAlertRules, evaluateAlertRules } from '../../db/metricsSnapshots';
import type {
  ActivityResponse, EvaluatedAlert, OverviewResponse, PerformanceResponse, QueriesResponse,
  ReplicationResponse, SecurityResponse, StorageResponse,
} from '../../types/telemetry';

async function withPostgres<T>(conn: DbConnectionInput, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    host: conn.host, port: parseInt(String(conn.port), 10) || 5432, database: conn.database, user: conn.user,
    password: conn.password, ssl: conn.ssl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    const result = await fn(client);
    await client.end();
    return result;
  } catch (error) {
    try { await client.end(); } catch { /* already closed */ }
    throw error;
  }
}

async function withMysql<T>(conn: DbConnectionInput, fn: (connection: Awaited<ReturnType<typeof mysql.createConnection>>) => Promise<T>): Promise<T> {
  const connection = await mysql.createConnection({
    host: conn.host, port: parseInt(String(conn.port), 10) || 3306, database: conn.database, user: conn.user,
    password: conn.password, ssl: conn.ssl ? { rejectUnauthorized: false } : undefined, connectTimeout: 8000,
  });
  try {
    const result = await fn(connection);
    await connection.end();
    return result;
  } catch (error) {
    try { await connection.end(); } catch { /* already closed */ }
    throw error;
  }
}

function healthScoreFromMatrix(matrix: { status: string }[]): { score: number; status: 'healthy' | 'warning' | 'critical' } {
  let score = 100;
  for (const row of matrix) {
    if (row.status === 'critical') score -= 20;
    else if (row.status === 'warning') score -= 8;
  }
  score = Math.max(0, Math.min(100, score));
  const status = score < 60 ? 'critical' : score < 85 ? 'warning' : 'healthy';
  return { score, status };
}

async function evaluateAlertsFor(projectId: number, values: Record<string, number>): Promise<EvaluatedAlert[]> {
  const rules = await listAlertRules(projectId);
  return evaluateAlertRules(rules, values);
}

export async function buildOverview(projectId: number, conn: DbConnectionInput): Promise<OverviewResponse> {
  if (conn.dbType === 'mysql') return buildOverviewMysql(projectId, conn);
  return withPostgres(conn, async client => {
    const [identity, latencyMs, connections, counters, storage, replication, topQueries, blocked, deadlocksRow] = await Promise.all([
      pg.getIdentity(client, conn.database, conn.host),
      pg.pingLatencyMs(client),
      pg.getConnections(client),
      pg.getDatabaseCounters(client),
      pg.getStorage(client),
      pg.getReplication(client),
      pg.getTopQueries(client),
      pg.getLockSummary(client),
      Promise.resolve(null as null),
    ]);
    const rates = counters ? computeRates(projectId, counters) : null;
    const opsPerSecond = rates ? (rates.xact_commit ?? 0) + (rates.xact_rollback ?? 0) : null;
    const deadlocks = counters?.deadlocks ?? 0;
    const matrix = pg.buildHealthMatrix({
      connections,
      latencyMs,
      cacheHitRatio: pg.cacheHitRatio(counters),
      deadlocks,
      blockedLocks: blocked.blocked,
      replicationMode: replication.mode,
      replicas: replication.replicas,
      queriesAvailable: topQueries.available,
    });
    const health = healthScoreFromMatrix(matrix);
    const growth7d = await getGrowthOverDays(projectId, 7).catch(() => null);
    await maybeWriteSnapshot(projectId, {
      databaseSizeBytes: storage.databaseSizeBytes,
      tableCount: storage.tables.length,
      connectionsActive: connections.active,
      connectionsTotal: connections.total,
    }).catch(() => {});
    if (topQueries.available && topQueries.queries[0]) {
      const event = pg.classifySlowQuery(topQueries.queries[0].avgMs);
      if (event) pushActivityEvent(projectId, event);
    }
    const largestObject = storage.tables[0] ? { name: storage.tables[0].name, sizeBytes: storage.tables[0].totalBytes } : null;
    const connPct = connections.max ? (connections.total / connections.max) * 100 : 0;
    const activeAlerts = await evaluateAlertsFor(projectId, {
      p95_latency_ms: latencyMs ?? 0,
      connections_pct: connPct,
      blocked_queries: blocked.blocked,
    }).catch(() => []);
    const nonHealthy = matrix.filter(r => r.status !== 'healthy' && r.status !== 'unknown');
    return {
      identity,
      healthScore: health.score,
      healthStatus: health.status,
      latencyMs,
      connections,
      opsPerSecond,
      databaseSizeBytes: storage.databaseSizeBytes,
      activeIssues: nonHealthy.length + activeAlerts.length,
      criticalIssues: matrix.filter(r => r.status === 'critical').length,
      throughput: [{ atSeconds: Math.floor(Date.now() / 1000), reads: rates ? (rates.tup_returned ?? null) : null, writes: rates ? (rates.tup_inserted ?? 0) + (rates.tup_updated ?? 0) + (rates.tup_deleted ?? 0) : null, total: opsPerSecond }],
      healthMatrix: matrix,
      recentActivity: getRecentActivity(projectId),
      topQueries: topQueries.available ? topQueries.queries.slice(0, 3) : { available: false, reason: topQueries.reason ?? 'Not available' },
      storageGrowthBytes7d: growth7d,
      largestObject,
      activeAlerts,
    };
  });
}

async function buildOverviewMysql(projectId: number, conn: DbConnectionInput): Promise<OverviewResponse> {
  return withMysql(conn, async connection => {
    const [identity, latencyMs, connections, counters, storage, replication, topQueries] = await Promise.all([
      my.getIdentity(connection, conn.database, conn.host),
      my.pingLatencyMs(connection),
      my.getConnections(connection),
      my.getCounters(connection),
      my.getStorage(connection, conn.database),
      my.getReplication(connection),
      my.getTopQueries(connection),
    ]);
    const rates = computeRates(projectId, counters);
    const opsPerSecond = rates ? (rates.com_select ?? 0) + (rates.com_insert ?? 0) + (rates.com_update ?? 0) + (rates.com_delete ?? 0) : null;
    const connPct = connections.max ? (connections.total / connections.max) * 100 : 0;
    const score = connPct > 90 ? 55 : connPct > 75 ? 80 : 96;
    const status = score < 60 ? 'critical' : score < 85 ? 'warning' : 'healthy';
    await maybeWriteSnapshot(projectId, {
      databaseSizeBytes: storage.databaseSizeBytes,
      tableCount: storage.tables.length,
      connectionsActive: connections.active,
      connectionsTotal: connections.total,
    }).catch(() => {});
    const growth7d = await getGrowthOverDays(projectId, 7).catch(() => null);
    const largestObject = storage.tables[0] ? { name: storage.tables[0].name, sizeBytes: storage.tables[0].totalBytes } : null;
    const activeAlerts = await evaluateAlertsFor(projectId, { connections_pct: connPct }).catch(() => []);
    return {
      identity, healthScore: score, healthStatus: status, latencyMs, connections, opsPerSecond,
      databaseSizeBytes: storage.databaseSizeBytes,
      activeIssues: activeAlerts.length,
      criticalIssues: 0,
      throughput: [{ atSeconds: Math.floor(Date.now() / 1000), reads: rates ? (rates.com_select ?? null) : null, writes: rates ? (rates.com_insert ?? 0) + (rates.com_update ?? 0) + (rates.com_delete ?? 0) : null, total: opsPerSecond }],
      healthMatrix: [
        { category: 'connections', status: connPct > 90 ? 'critical' : connPct > 75 ? 'warning' : 'healthy', detail: connections.max ? `${connections.total}/${connections.max} used` : null },
        { category: 'latency', status: latencyMs === null ? 'unknown' : latencyMs > 200 ? 'critical' : latencyMs > 80 ? 'warning' : 'healthy', detail: latencyMs === null ? null : `${latencyMs.toFixed(1)}ms round-trip` },
        { category: 'queries', status: topQueries.available ? 'healthy' : 'unknown', detail: topQueries.available ? null : 'performance_schema not available' },
        { category: 'locks', status: 'unknown', detail: null },
        { category: 'replication', status: replication.mode === 'standalone' ? 'unknown' : 'healthy', detail: replication.mode === 'standalone' ? 'Standalone instance' : null },
        { category: 'storage', status: 'healthy', detail: null },
        { category: 'cache', status: 'unknown', detail: null },
        { category: 'errors', status: 'healthy', detail: null },
      ],
      recentActivity: getRecentActivity(projectId),
      topQueries: topQueries.available ? topQueries.queries.slice(0, 3) : { available: false, reason: topQueries.reason ?? 'Not available' },
      storageGrowthBytes7d: growth7d,
      largestObject,
      activeAlerts,
    };
  });
}

export async function buildPerformance(projectId: number, conn: DbConnectionInput): Promise<PerformanceResponse> {
  if (conn.dbType === 'mysql') {
    return withMysql(conn, async connection => {
      const [connections, counters, latency] = await Promise.all([my.getConnections(connection), my.getCounters(connection), my.getLatencyPercentiles()]);
      const rates = computeRates(projectId, counters);
      const opsPerSecond = rates ? (rates.com_select ?? 0) + (rates.com_insert ?? 0) + (rates.com_update ?? 0) + (rates.com_delete ?? 0) : null;
      const intelligence = my.buildEngineIntelligence({ cacheHitRatio: my.cacheHitRatio(counters), slowQueries: counters.slow_queries ?? 0, threadsRunning: connections.active });
      const connPct = connections.max ? (connections.total / connections.max) * 100 : 0;
      return {
        opsPerSecond, latency,
        connections: { active: connections.active, idle: connections.idle, waiting: connections.waiting, blocked: 0 },
        throughput: [{ atSeconds: Math.floor(Date.now() / 1000), reads: rates ? rates.com_select ?? null : null, writes: rates ? (rates.com_insert ?? 0) + (rates.com_update ?? 0) + (rates.com_delete ?? 0) : null, transactions: null }],
        engineIntelligence: intelligence,
        activeAlerts: await evaluateAlertsFor(projectId, { connections_pct: connPct }).catch(() => []),
      };
    });
  }
  return withPostgres(conn, async client => {
    const [connections, counters, latency, blocked, seqScans] = await Promise.all([
      pg.getConnections(client), pg.getDatabaseCounters(client), pg.getLatencyPercentiles(client), pg.getLockSummary(client), pg.getSeqScans(client),
    ]);
    const rates = counters ? computeRates(projectId, counters) : null;
    const opsPerSecond = rates ? (rates.xact_commit ?? 0) + (rates.xact_rollback ?? 0) : null;
    const intelligence = pg.buildEngineIntelligence({
      cacheHitRatio: pg.cacheHitRatio(counters), seqScans, deadlocks: counters?.deadlocks ?? 0, blockedLocks: blocked.blocked, tempFiles: counters?.temp_files ?? null,
    });
    const connPct = connections.max ? (connections.total / connections.max) * 100 : 0;
    return {
      opsPerSecond, latency,
      connections: { active: connections.active, idle: connections.idle, waiting: connections.waiting, blocked: blocked.blocked },
      throughput: [{ atSeconds: Math.floor(Date.now() / 1000), reads: rates ? rates.tup_returned ?? null : null, writes: rates ? (rates.tup_inserted ?? 0) + (rates.tup_updated ?? 0) + (rates.tup_deleted ?? 0) : null, transactions: rates ? (rates.xact_commit ?? 0) + (rates.xact_rollback ?? 0) : null }],
      engineIntelligence: intelligence,
      activeAlerts: await evaluateAlertsFor(projectId, { p95_latency_ms: latency.p95 ?? 0, connections_pct: connPct, blocked_queries: blocked.blocked }).catch(() => []),
    };
  });
}

export async function buildQueries(_projectId: number, conn: DbConnectionInput): Promise<QueriesResponse> {
  if (conn.dbType === 'mysql') return withMysql(conn, async connection => { const r = await my.getTopQueries(connection); return { available: r.available, reason: r.reason, queries: r.queries }; });
  return withPostgres(conn, async client => { const r = await pg.getTopQueries(client); return { available: r.available, reason: r.reason, queries: r.queries }; });
}

export async function buildStorage(projectId: number, conn: DbConnectionInput): Promise<StorageResponse> {
  const history = await getSnapshotHistory7d(projectId);
  if (conn.dbType === 'mysql') {
    return withMysql(conn, async connection => {
      const storage = await my.getStorage(connection, conn.database);
      const growth = history.length >= 2 ? history[history.length - 1].sizeBytes - history[0].sizeBytes : null;
      const first = history[0]?.sizeBytes;
      return {
        databaseSizeBytes: storage.databaseSizeBytes,
        growth7dBytes: growth,
        growth7dPercent: growth !== null && first ? (growth / first) * 100 : null,
        indexesBytes: storage.tables.reduce((s, t) => s + t.indexBytes, 0),
        largestObject: storage.tables[0] ? { name: storage.tables[0].name, sizeBytes: storage.tables[0].totalBytes } : null,
        history,
        tables: storage.tables,
      };
    });
  }
  return withPostgres(conn, async client => {
    const storage = await pg.getStorage(client);
    const growth = history.length >= 2 ? history[history.length - 1].sizeBytes - history[0].sizeBytes : null;
    const first = history[0]?.sizeBytes;
    return {
      databaseSizeBytes: storage.databaseSizeBytes,
      growth7dBytes: growth,
      growth7dPercent: growth !== null && first ? (growth / first) * 100 : null,
      indexesBytes: storage.tables.reduce((s, t) => s + t.indexBytes, 0),
      largestObject: storage.tables[0] ? { name: storage.tables[0].name, sizeBytes: storage.tables[0].totalBytes } : null,
      history,
      tables: storage.tables,
    };
  });
}

async function getSnapshotHistory7d(projectId: number) {
  return getSnapshotHistory(projectId, 7).catch(() => []);
}

export async function buildReplication(_projectId: number, conn: DbConnectionInput): Promise<ReplicationResponse> {
  if (conn.dbType === 'mysql') {
    return withMysql(conn, async connection => {
      const r = await my.getReplication(connection);
      return { mode: r.mode, replicas: r.replicas, note: r.mode === 'standalone' ? 'No replica or source configuration detected.' : undefined };
    });
  }
  return withPostgres(conn, async client => {
    const r = await pg.getReplication(client);
    return { mode: r.mode, replicas: r.replicas, note: r.mode === 'standalone' ? 'This instance has no replicas configured (standalone).' : undefined };
  });
}

export async function buildActivity(projectId: number): Promise<ActivityResponse> {
  return { events: getRecentActivity(projectId, 50) };
}

export async function buildSecurity(conn: DbConnectionInput): Promise<SecurityResponse> {
  if (conn.dbType === 'mysql') {
    return withMysql(conn, async connection => {
      const posture = await my.getSecurityPosture(connection);
      const score = Math.max(40, 100 - posture.findings.length * 15 - posture.privilegedAccounts * 5);
      return { securityScore: score, totalUsers: posture.users.length, privilegedAccounts: posture.privilegedAccounts, users: posture.users, findings: posture.findings };
    });
  }
  return withPostgres(conn, async client => {
    const posture = await pg.getSecurityPosture(client);
    const score = Math.max(40, 100 - posture.findings.length * 15 - posture.privilegedAccounts * 5);
    return { securityScore: score, totalUsers: posture.users.length, privilegedAccounts: posture.privilegedAccounts, users: posture.users, findings: posture.findings };
  });
}
