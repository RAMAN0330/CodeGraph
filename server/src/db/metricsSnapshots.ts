import { pool } from './pool';
import type { AlertRule, EvaluatedAlert } from '../types/telemetry';

const SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000;

export async function maybeWriteSnapshot(projectId: number, metrics: {
  databaseSizeBytes: number | null;
  tableCount: number | null;
  connectionsActive: number | null;
  connectionsTotal: number | null;
}): Promise<void> {
  const last = await pool.query(
    'SELECT captured_at FROM db_metric_snapshots WHERE project_id = $1 ORDER BY captured_at DESC LIMIT 1',
    [projectId],
  );
  if (last.rowCount && last.rowCount > 0) {
    const lastAt = new Date(last.rows[0].captured_at).getTime();
    if (Date.now() - lastAt < SNAPSHOT_THROTTLE_MS) return;
  }
  await pool.query(
    `INSERT INTO db_metric_snapshots (project_id, database_size_bytes, table_count, connections_active, connections_total)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, metrics.databaseSizeBytes, metrics.tableCount, metrics.connectionsActive, metrics.connectionsTotal],
  );
}

export async function getSnapshotHistory(projectId: number, sinceDays: number): Promise<{ atSeconds: number; sizeBytes: number }[]> {
  const result = await pool.query(
    `SELECT captured_at, database_size_bytes FROM db_metric_snapshots
     WHERE project_id = $1 AND captured_at > now() - ($2 || ' days')::interval AND database_size_bytes IS NOT NULL
     ORDER BY captured_at ASC`,
    [projectId, sinceDays],
  );
  return result.rows.map(row => ({ atSeconds: Math.floor(new Date(row.captured_at).getTime() / 1000), sizeBytes: Number(row.database_size_bytes) }));
}

export async function getGrowthOverDays(projectId: number, days: number): Promise<number | null> {
  const history = await getSnapshotHistory(projectId, days);
  if (history.length < 2) return null;
  return history[history.length - 1].sizeBytes - history[0].sizeBytes;
}

function toAlertRule(row: any): AlertRule {
  return {
    id: row.id,
    metric: row.metric,
    condition: row.condition,
    threshold: Number(row.threshold),
    forMinutes: row.for_minutes,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export async function listAlertRules(projectId: number): Promise<AlertRule[]> {
  const result = await pool.query('SELECT * FROM db_alert_rules WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
  return result.rows.map(toAlertRule);
}

export async function createAlertRule(projectId: number, input: { metric: string; condition: 'gt' | 'lt'; threshold: number; forMinutes: number }): Promise<AlertRule> {
  if (!input.metric?.trim()) throw new Error('A metric is required.');
  if (input.condition !== 'gt' && input.condition !== 'lt') throw new Error('Condition must be gt or lt.');
  if (!Number.isFinite(input.threshold)) throw new Error('Threshold must be a number.');
  const result = await pool.query(
    `INSERT INTO db_alert_rules (project_id, metric, condition, threshold, for_minutes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, input.metric.trim(), input.condition, input.threshold, input.forMinutes || 5],
  );
  return toAlertRule(result.rows[0]);
}

export async function deleteAlertRule(projectId: number, ruleId: number): Promise<void> {
  await pool.query('DELETE FROM db_alert_rules WHERE id = $1 AND project_id = $2', [ruleId, projectId]);
}

/** Evaluates enabled rules against a flat map of currently computed metric values (e.g. { p95_latency_ms: 640, connections_pct: 82 }). */
export function evaluateAlertRules(rules: AlertRule[], currentValues: Record<string, number>): EvaluatedAlert[] {
  const evaluated: EvaluatedAlert[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const value = currentValues[rule.metric];
    if (value === undefined) continue;
    const triggered = rule.condition === 'gt' ? value > rule.threshold : value < rule.threshold;
    if (!triggered) continue;
    const overBy = rule.condition === 'gt' ? value / rule.threshold : rule.threshold / value;
    const severity: EvaluatedAlert['severity'] = overBy > 2 ? 'critical' : overBy > 1.3 ? 'high' : 'warning';
    evaluated.push({ rule, currentValue: value, severity });
  }
  return evaluated;
}
