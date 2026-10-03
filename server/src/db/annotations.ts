import { pool } from './pool';

// Team notes on repository files and folders, shared inside an organization.

export const MAX_NOTE_LENGTH = 2000;

export interface Annotation {
  id: number;
  path: string;
  body: string;
  author: string | null;
  authorId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

function normalize(value: string): string {
  return String(value || '').toLowerCase();
}

function toAnnotation(row: any): Annotation {
  return { id: row.id, path: row.path, body: row.body, author: row.username ?? null, authorId: row.author_id, createdAt: row.created_at, updatedAt: row.updated_at, resolvedAt: row.resolved_at };
}

export function validateNote(path: unknown, body: unknown): { path: string; body: string } {
  const p = typeof path === 'string' ? path.trim().replace(/^\/+/, '') : '';
  const b = typeof body === 'string' ? body.trim() : '';
  if (!p || p.length > 500 || p.split('/').some(seg => seg === '..')) throw new Error('A note needs a repository path.');
  if (!b) throw new Error('Write something first.');
  if (b.length > MAX_NOTE_LENGTH) throw new Error(`Notes are limited to ${MAX_NOTE_LENGTH} characters.`);
  return { path: p, body: b };
}

const SELECT = `SELECT a.id, a.path, a.body, a.author_id, a.created_at, a.updated_at, a.resolved_at, u.username
  FROM annotations a LEFT JOIN users u ON u.id = a.author_id`;

export async function listAnnotations(organizationId: number, owner: string, repo: string): Promise<Annotation[]> {
  const result = await pool.query(
    `${SELECT} WHERE a.organization_id = $1 AND a.owner = $2 AND a.repo = $3 ORDER BY a.resolved_at IS NOT NULL, a.created_at DESC LIMIT 500`,
    [organizationId, normalize(owner), normalize(repo)],
  );
  return result.rows.map(toAnnotation);
}

export async function createAnnotation(organizationId: number, authorId: number, owner: string, repo: string, path: string, body: string): Promise<Annotation> {
  const inserted = await pool.query(
    'INSERT INTO annotations (organization_id, owner, repo, path, body, author_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [organizationId, normalize(owner), normalize(repo), path, body, authorId],
  );
  const result = await pool.query(`${SELECT} WHERE a.id = $1`, [inserted.rows[0].id]);
  return toAnnotation(result.rows[0]);
}

// Anyone in the organization may resolve or reopen a note; only its author
// may reword it. Returns null when the note isn't in the caller's organization.
export async function updateAnnotation(organizationId: number, userId: number, id: number, change: { body?: string; resolved?: boolean }): Promise<Annotation | null> {
  const current = await pool.query('SELECT author_id FROM annotations WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  if (!current.rows[0]) return null;
  if (change.body !== undefined && current.rows[0].author_id !== userId) throw new Error('Only the author can edit a note.');
  await pool.query(
    `UPDATE annotations SET
       body = COALESCE($3, body),
       resolved_at = CASE WHEN $4::boolean IS NULL THEN resolved_at WHEN $4 THEN COALESCE(resolved_at, now()) ELSE NULL END,
       updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [id, organizationId, change.body ?? null, change.resolved ?? null],
  );
  const result = await pool.query(`${SELECT} WHERE a.id = $1`, [id]);
  return toAnnotation(result.rows[0]);
}

// Author or an organization admin.
export async function deleteAnnotation(organizationId: number, user: { id: number; role: string }, id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM annotations WHERE id = $1 AND organization_id = $2 AND (author_id = $3 OR $4)',
    [id, organizationId, user.id, user.role === 'admin'],
  );
  return (result.rowCount ?? 0) > 0;
}
