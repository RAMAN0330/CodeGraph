import { pool } from './pool';

// Uploaded test coverage, scoped to the uploader's organization so one team's
// report never changes what another team sees for the same public repository.

const MAX_FILES = 20_000;
const FORMATS = new Set(['lcov', 'cobertura', 'istanbul-summary']);

export interface CoverageReport {
  format: string;
  files: Record<string, { found: number; hit: number }>;
  uploadedBy: string | null;
  uploadedAt: string;
}

function normalize(value: string): string {
  return String(value || '').toLowerCase();
}

export function validateCoverage(format: unknown, files: unknown): { format: string; files: Record<string, { found: number; hit: number }> } {
  if (typeof format !== 'string' || !FORMATS.has(format)) throw new Error('Unknown coverage format.');
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error('Coverage needs a "files" object.');
  const entries = Object.entries(files as Record<string, any>);
  if (!entries.length) throw new Error('None of the report\'s files match this repository.');
  if (entries.length > MAX_FILES) throw new Error(`Coverage is limited to ${MAX_FILES} files.`);
  const clean: Record<string, { found: number; hit: number }> = {};
  for (const [path, value] of entries) {
    const found = Number(value?.found), hit = Number(value?.hit);
    if (!path || path.length > 500 || !Number.isInteger(found) || !Number.isInteger(hit) || found < 0 || hit < 0) throw new Error(`Invalid coverage entry for ${path.slice(0, 80)}.`);
    clean[path] = { found, hit: Math.min(hit, found) };
  }
  return { format, files: clean };
}

export async function saveCoverage(organizationId: number, userId: number, owner: string, repo: string, branch: string, format: string, files: Record<string, { found: number; hit: number }>): Promise<void> {
  await pool.query(
    `INSERT INTO coverage_reports (organization_id, owner, repo, branch, format, files_json, uploaded_by, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (organization_id, owner, repo, branch)
     DO UPDATE SET format = EXCLUDED.format, files_json = EXCLUDED.files_json, uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now()`,
    [organizationId, normalize(owner), normalize(repo), branch, format, JSON.stringify(files), userId],
  );
}

export async function getCoverage(organizationId: number, owner: string, repo: string, branch: string): Promise<CoverageReport | null> {
  const result = await pool.query(
    `SELECT c.format, c.files_json, c.uploaded_at, u.username FROM coverage_reports c LEFT JOIN users u ON u.id = c.uploaded_by
     WHERE c.organization_id = $1 AND c.owner = $2 AND c.repo = $3 AND c.branch = $4`,
    [organizationId, normalize(owner), normalize(repo), branch],
  );
  const row = result.rows[0];
  return row ? { format: row.format, files: row.files_json, uploadedBy: row.username, uploadedAt: row.uploaded_at } : null;
}

export async function deleteCoverage(organizationId: number, owner: string, repo: string, branch: string): Promise<void> {
  await pool.query('DELETE FROM coverage_reports WHERE organization_id = $1 AND owner = $2 AND repo = $3 AND branch = $4', [organizationId, normalize(owner), normalize(repo), branch]);
}
