import { pool } from './pool';
import { env } from '../config/env';

function normalize(value: string): string {
  return String(value || '').toLowerCase();
}

export interface CachedTree {
  tree: unknown[];
  etag: string | null;
  fresh: boolean;
}

export async function getCachedTree(owner: string, repo: string, branch: string): Promise<CachedTree | null> {
  const result = await pool.query(
    'SELECT tree_json, etag, fetched_at FROM repo_tree_cache WHERE owner=$1 AND repo=$2 AND branch=$3',
    [normalize(owner), normalize(repo), branch]
  );
  const row = result.rows[0];
  if (!row) return null;
  const fresh = Date.now() - new Date(row.fetched_at).getTime() <= env.repoCacheTtlMs;
  return { tree: row.tree_json, etag: row.etag, fresh };
}

export async function saveTreeCache(owner: string, repo: string, branch: string, treeJson: unknown, etag: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO repo_tree_cache (owner, repo, branch, tree_json, etag, fetched_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (owner, repo, branch) DO UPDATE SET tree_json = EXCLUDED.tree_json, etag = EXCLUDED.etag, fetched_at = now()`,
    [normalize(owner), normalize(repo), branch, JSON.stringify(treeJson), etag]
  );
}

export async function touchTreeCache(owner: string, repo: string, branch: string): Promise<void> {
  await pool.query(
    'UPDATE repo_tree_cache SET fetched_at = now() WHERE owner=$1 AND repo=$2 AND branch=$3',
    [normalize(owner), normalize(repo), branch]
  );
}

export async function getCachedFile(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  const result = await pool.query(
    'SELECT content, fetched_at FROM repo_file_cache WHERE owner=$1 AND repo=$2 AND branch=$3 AND path=$4',
    [normalize(owner), normalize(repo), branch, path]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.fetched_at).getTime() > env.repoCacheTtlMs) return null;
  return row.content;
}

export async function saveFileCache(owner: string, repo: string, branch: string, path: string, content: string): Promise<void> {
  await pool.query(
    `INSERT INTO repo_file_cache (owner, repo, branch, path, content, fetched_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (owner, repo, branch, path) DO UPDATE SET content = EXCLUDED.content, fetched_at = now()`,
    [normalize(owner), normalize(repo), branch, path, content]
  );
}

// Content-addressed by blob sha — no TTL check. A sha's content can never
// change, so presence alone means the cached value is valid.
export async function getCachedBlob(owner: string, repo: string, sha: string): Promise<string | null> {
  const result = await pool.query(
    'SELECT content FROM repo_file_blob_cache WHERE owner=$1 AND repo=$2 AND sha=$3',
    [normalize(owner), normalize(repo), sha]
  );
  return result.rows[0] ? result.rows[0].content : null;
}

export async function saveBlobCache(owner: string, repo: string, sha: string, content: string): Promise<void> {
  await pool.query(
    `INSERT INTO repo_file_blob_cache (owner, repo, sha, content, fetched_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (owner, repo, sha) DO NOTHING`,
    [normalize(owner), normalize(repo), sha, content]
  );
}

export async function pruneStaleCacheEntries(): Promise<{ blobs: number; files: number; trees: number }> {
  const blobs = await pool.query("DELETE FROM repo_file_blob_cache WHERE fetched_at < now() - interval '90 days'");
  const files = await pool.query("DELETE FROM repo_file_cache WHERE fetched_at < now() - interval '30 days'");
  const trees = await pool.query("DELETE FROM repo_tree_cache WHERE fetched_at < now() - interval '30 days'");
  return { blobs: blobs.rowCount ?? 0, files: files.rowCount ?? 0, trees: trees.rowCount ?? 0 };
}
