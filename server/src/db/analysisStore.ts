import { pool } from './pool';

function normalize(value: string): string {
  return String(value || '').toLowerCase();
}

export interface StoredAnalysis {
  commitSha: string;
  data: unknown;
  analyzedAt: string;
}

export async function getAnalysis(owner: string, repo: string, branch: string): Promise<StoredAnalysis | null> {
  const result = await pool.query(
    'SELECT commit_sha, data_json, analyzed_at FROM analysis_results WHERE owner=$1 AND repo=$2 AND branch=$3',
    [normalize(owner), normalize(repo), branch],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { commitSha: row.commit_sha, data: row.data_json, analyzedAt: row.analyzed_at };
}

export async function saveAnalysis(owner: string, repo: string, branch: string, commitSha: string, data: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO analysis_results (owner, repo, branch, commit_sha, data_json, analyzed_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (owner, repo, branch) DO UPDATE SET commit_sha = EXCLUDED.commit_sha, data_json = EXCLUDED.data_json, analyzed_at = now()`,
    [normalize(owner), normalize(repo), branch, commitSha, JSON.stringify(data)],
  );
}
