import { pool } from './pool';
import type { AnalysisSnapshot, Regression } from '../analysis/sharedRules';

const SNAPSHOTS_KEPT = 200;

function normalize(value: string): string {
  return String(value || '').toLowerCase();
}

export interface AnalysisAlert {
  id: number;
  branch: string;
  commitSha: string;
  kind: Regression['kind'];
  message: string;
  createdAt: string;
}

export async function latestSnapshot(owner: string, repo: string, branch: string): Promise<AnalysisSnapshot | null> {
  const result = await pool.query(
    'SELECT snapshot_json FROM analysis_snapshots WHERE owner=$1 AND repo=$2 AND branch=$3 ORDER BY captured_at DESC, id DESC LIMIT 1',
    [normalize(owner), normalize(repo), branch],
  );
  return result.rows[0]?.snapshot_json ?? null;
}

export async function insertSnapshot(owner: string, repo: string, branch: string, snapshot: AnalysisSnapshot): Promise<void> {
  const key = [normalize(owner), normalize(repo), branch];
  await pool.query(
    'INSERT INTO analysis_snapshots (owner, repo, branch, commit_sha, snapshot_json) VALUES ($1, $2, $3, $4, $5)',
    [...key, snapshot.commitSha ?? 'unknown', JSON.stringify(snapshot)],
  );
  await pool.query(
    `DELETE FROM analysis_snapshots WHERE owner=$1 AND repo=$2 AND branch=$3 AND id NOT IN (
       SELECT id FROM analysis_snapshots WHERE owner=$1 AND repo=$2 AND branch=$3 ORDER BY captured_at DESC, id DESC LIMIT $4)`,
    [...key, SNAPSHOTS_KEPT],
  );
}

// Oldest first, ready to chart.
export async function listSnapshots(owner: string, repo: string, branch: string, limit = 30): Promise<AnalysisSnapshot[]> {
  const result = await pool.query(
    'SELECT snapshot_json FROM analysis_snapshots WHERE owner=$1 AND repo=$2 AND branch=$3 ORDER BY captured_at DESC, id DESC LIMIT $4',
    [normalize(owner), normalize(repo), branch, limit],
  );
  return result.rows.map(row => row.snapshot_json).reverse();
}

export async function insertAlerts(owner: string, repo: string, branch: string, commitSha: string, regressions: Regression[]): Promise<void> {
  for (const r of regressions) {
    await pool.query(
      `INSERT INTO analysis_alerts (owner, repo, branch, commit_sha, kind, message, previous_value, current_value)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [normalize(owner), normalize(repo), branch, commitSha, r.kind, r.message, r.previous, r.current],
    );
  }
}

// Newest first, across every branch of the repository.
export async function listAlerts(owner: string, repo: string, limit = 20): Promise<AnalysisAlert[]> {
  const result = await pool.query(
    'SELECT id, branch, commit_sha, kind, message, created_at FROM analysis_alerts WHERE owner=$1 AND repo=$2 ORDER BY created_at DESC, id DESC LIMIT $3',
    [normalize(owner), normalize(repo), limit],
  );
  return result.rows.map(row => ({ id: row.id, branch: row.branch, commitSha: row.commit_sha, kind: row.kind, message: row.message, createdAt: row.created_at }));
}
