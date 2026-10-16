import { pool } from './pool';

const HISTORY_KEEP = 200;

export interface HistoryEntry { id: number; sql: string; durationMs: number | null; rowCount: number | null; error: string | null; ranAt: string; username: string | null }
export interface SavedQuery { id: number; name: string; sql: string; createdAt: string; updatedAt: string; username: string | null; canDelete: boolean }

export async function recordHistory(projectId: number, userId: number, entry: { sql: string; durationMs?: number | null; rowCount?: number | null; error?: string | null }): Promise<void> {
  await pool.query(
    'INSERT INTO db_query_history (project_id, user_id, sql, duration_ms, row_count, error) VALUES ($1, $2, $3, $4, $5, $6)',
    [projectId, userId, entry.sql.slice(0, 20000), entry.durationMs ?? null, entry.rowCount ?? null, entry.error?.slice(0, 1000) ?? null],
  );
  await pool.query(
    `DELETE FROM db_query_history WHERE project_id = $1 AND id NOT IN (
       SELECT id FROM db_query_history WHERE project_id = $1 ORDER BY ran_at DESC LIMIT ${HISTORY_KEEP})`,
    [projectId],
  );
}

export async function listHistory(projectId: number, limit = 50): Promise<HistoryEntry[]> {
  const result = await pool.query(
    `SELECT h.id, h.sql, h.duration_ms, h.row_count, h.error, h.ran_at, u.username
     FROM db_query_history h LEFT JOIN users u ON u.id = h.user_id
     WHERE h.project_id = $1 ORDER BY h.ran_at DESC LIMIT $2`,
    [projectId, Math.min(Math.max(limit, 1), HISTORY_KEEP)],
  );
  return result.rows.map(r => ({ id: r.id, sql: r.sql, durationMs: r.duration_ms === null ? null : Number(r.duration_ms), rowCount: r.row_count, error: r.error, ranAt: r.ran_at, username: r.username ?? null }));
}

export function validateSavedQuery(input: { name?: unknown; sql?: unknown }): { name: string; sql: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const sql = typeof input.sql === 'string' ? input.sql.trim() : '';
  if (!name || name.length > 120) throw new Error('Give the query a name of up to 120 characters.');
  if (!sql || sql.length > 100_000) throw new Error('The query is empty or too long.');
  return { name, sql };
}

export async function listSavedQueries(projectId: number, viewer: { id: number; isAdmin: boolean }): Promise<SavedQuery[]> {
  const result = await pool.query(
    `SELECT q.id, q.name, q.sql, q.created_at, q.updated_at, q.user_id, u.username
     FROM db_saved_queries q LEFT JOIN users u ON u.id = q.user_id
     WHERE q.project_id = $1 ORDER BY lower(q.name)`,
    [projectId],
  );
  return result.rows.map(r => ({ id: r.id, name: r.name, sql: r.sql, createdAt: r.created_at, updatedAt: r.updated_at, username: r.username ?? null, canDelete: viewer.isAdmin || r.user_id === viewer.id }));
}

// Saving under an existing name in the same project updates that query.
export async function saveQuery(projectId: number, userId: number, input: { name: string; sql: string }): Promise<number> {
  const existing = await pool.query('SELECT id FROM db_saved_queries WHERE project_id = $1 AND lower(name) = lower($2)', [projectId, input.name]);
  if (existing.rows[0]) {
    await pool.query('UPDATE db_saved_queries SET sql = $1, updated_at = now() WHERE id = $2', [input.sql, existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const inserted = await pool.query('INSERT INTO db_saved_queries (project_id, user_id, name, sql) VALUES ($1, $2, $3, $4) RETURNING id', [projectId, userId, input.name, input.sql]);
  return inserted.rows[0].id;
}

export async function deleteSavedQuery(projectId: number, queryId: number, viewer: { id: number; isAdmin: boolean }): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM db_saved_queries WHERE id = $1 AND project_id = $2 AND ($3 OR user_id = $4)',
    [queryId, projectId, viewer.isAdmin, viewer.id],
  );
  return (result.rowCount ?? 0) > 0;
}
