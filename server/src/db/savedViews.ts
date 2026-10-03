import { pool } from './pool';

// Named workspace views shared inside an organization: a section, optionally
// a file selected in it, and the branch it was saved on.

export interface SavedView { id: number; name: string; section: string; file: string | null; branch: string | null; createdBy: string | null; createdById: number | null; createdAt: string }

const MAX_VIEWS_PER_REPO = 200;
const refPattern = /^[A-Za-z0-9_./-]{1,200}$/;

function normalize(value: string): string {
  return String(value || '').toLowerCase();
}

export function validateView(input: any): { name: string; section: string; file: string | null; branch: string | null } {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const section = typeof input?.section === 'string' ? input.section : '';
  const file = typeof input?.file === 'string' && input.file ? input.file : null;
  const branch = typeof input?.branch === 'string' && input.branch ? input.branch : null;
  if (!name || name.length > 80) throw new Error('Give the view a name (up to 80 characters).');
  if (!/^[a-z][a-z-]{0,39}$/.test(section)) throw new Error('Unknown workspace section.');
  if (file && (file.length > 500 || file.split('/').includes('..'))) throw new Error('Invalid file path.');
  if (branch && (!refPattern.test(branch) || branch.startsWith('-') || branch.includes('..'))) throw new Error('Invalid branch name.');
  return { name, section, file, branch };
}

export async function listViews(organizationId: number, owner: string, repo: string): Promise<SavedView[]> {
  const result = await pool.query(
    `SELECT v.id, v.name, v.section, v.file_path, v.branch, v.created_by, v.created_at, u.username
     FROM saved_views v LEFT JOIN users u ON u.id = v.created_by
     WHERE v.organization_id = $1 AND v.owner = $2 AND v.repo = $3 ORDER BY lower(v.name)`,
    [organizationId, normalize(owner), normalize(repo)],
  );
  return result.rows.map(r => ({ id: r.id, name: r.name, section: r.section, file: r.file_path, branch: r.branch, createdBy: r.username, createdById: r.created_by, createdAt: r.created_at }));
}

export async function createView(organizationId: number, userId: number, owner: string, repo: string, view: ReturnType<typeof validateView>): Promise<SavedView> {
  const count = await pool.query('SELECT count(*)::int AS n FROM saved_views WHERE organization_id = $1 AND owner = $2 AND repo = $3', [organizationId, normalize(owner), normalize(repo)]);
  if (count.rows[0].n >= MAX_VIEWS_PER_REPO) throw new Error(`A repository can have at most ${MAX_VIEWS_PER_REPO} saved views.`);
  const inserted = await pool.query(
    `INSERT INTO saved_views (organization_id, owner, repo, name, section, file_path, branch, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [organizationId, normalize(owner), normalize(repo), view.name, view.section, view.file, view.branch, userId],
  );
  const views = await listViews(organizationId, owner, repo);
  return views.find(v => v.id === inserted.rows[0].id)!;
}

// The creator or an organization admin.
export async function deleteView(organizationId: number, user: { id: number; role: string }, id: number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM saved_views WHERE id = $1 AND organization_id = $2 AND (created_by = $3 OR $4)',
    [id, organizationId, user.id, user.role === 'admin'],
  );
  return (result.rowCount ?? 0) > 0;
}
