import { fetchRepositoryTree, fetchBlobContent, fetchPathHistory } from '../services/githubService';
import { CHURN_WINDOW_DAYS, type FileHistory } from './hotspots';
import { MAX_MANIFESTS, analyzeFiles, selectSourceFiles, type SourceFile } from './analyzeFiles';
import { getCachedBlob, saveBlobCache, saveTreeCache, getCachedTree } from '../db/repoCache';
import { RULES_FILE, manifestEcosystem } from './sharedRules';

export interface RunAnalysisInput {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  // Per-file commit history for hotspots (~40 GitHub calls). Off for
  // throwaway analyses such as a PR's head commit.
  withHistory?: boolean;
}

interface TreeEntry { path: string; type: string; size?: number; sha: string }
interface ScannedFile extends SourceFile { sha: string }

async function scanFiles(owner: string, repo: string, branch: string, token: string | undefined): Promise<{ files: ScannedFile[]; rulesSha: string | null; manifests: Array<{ path: string; sha: string }> }> {
  // A job only runs because the caller already confirmed the commit changed,
  // so it must not serve a within-TTL-but-stale cached tree — always hit
  // GitHub (conditionally, via ETag) and refresh the cache with the result.
  const cached = await getCachedTree(owner, repo, branch);
  const result = await fetchRepositoryTree(owner, repo, token, branch, cached?.etag);
  const entries = (result.notModified ? cached?.tree : result.tree) as TreeEntry[] | undefined;
  if (!result.notModified) await saveTreeCache(owner, repo, branch, result.tree, result.etag ?? null);
  if (!entries) return { files: [], rulesSha: null, manifests: [] };

  // Read separately from the code scan: .json files may be excluded from it.
  const rulesSha = entries.find(entry => entry.type === 'blob' && entry.path === RULES_FILE)?.sha ?? null;
  const blobs = entries.filter(entry => entry.type === 'blob');
  const shaByPath = new Map(blobs.map(entry => [entry.path, entry.sha]));
  const files = selectSourceFiles(blobs).map(f => ({ ...f, sha: shaByPath.get(f.path)! }));
  const manifests = blobs.filter(entry => manifestEcosystem(entry.path)).slice(0, MAX_MANIFESTS).map(entry => ({ path: entry.path, sha: entry.sha }));
  return { files, rulesSha, manifests };
}

// Content-addressed by blob sha (from the tree scan) — cached forever, same
// as the browser's per-file fetch path when a sha is available.
async function getFileContent(owner: string, repo: string, sha: string, token: string | undefined): Promise<string | null> {
  const cachedBlob = await getCachedBlob(owner, repo, sha);
  if (cachedBlob !== null) return cachedBlob;
  const blob = await fetchBlobContent(owner, repo, sha, token);
  if (blob !== null) await saveBlobCache(owner, repo, sha, blob);
  return blob;
}

// Commit history for the hotspot candidates. Needs a token: anonymously,
// this alone would use most of GitHub's 60-requests-an-hour allowance.
async function collectHistory(owner: string, repo: string, branch: string, paths: string[], token: string): Promise<Map<string, FileHistory>> {
  const since = new Date(Date.now() - CHURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const ref = branch === 'HEAD' ? undefined : branch;
  const history = new Map<string, FileHistory>();
  let next = 0;
  async function worker() {
    while (next < paths.length) {
      const path = paths[next++];
      try {
        history.set(path, await fetchPathHistory(owner, repo, path, ref, since, token));
      } catch {
        // One unreadable file history shouldn't sink the analysis.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, paths.length) }, worker));
  return history;
}

export async function runAnalysis({ owner, repo, branch, token, withHistory = true }: RunAnalysisInput): Promise<any> {
  const { files, rulesSha, manifests } = await scanFiles(owner, repo, branch, token);
  return analyzeFiles({
    files,
    read: f => getFileContent(owner, repo, (f as ScannedFile).sha, token),
    readRules: async () => (rulesSha ? getFileContent(owner, repo, rulesSha, token) : null),
    readManifests: async () => {
      const read = await Promise.all(manifests.map(async m => ({ path: m.path, content: await getFileContent(owner, repo, m.sha, token).catch(() => null) })));
      return read.filter((m): m is { path: string; content: string } => m.content !== null);
    },
  }, {
    history: withHistory && token ? paths => collectHistory(owner, repo, branch, paths, token) : undefined,
    historyUnavailable: withHistory ? 'needs-token' : 'off',
  });
}
