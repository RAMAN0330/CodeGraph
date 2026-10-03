const API_ROOT = 'https://api.github.com';

function headers(token?: string, etag?: string): Record<string, string> {
  const result: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Structrace-App',
  };
  if (token) result.Authorization = `token ${token}`;
  if (etag) result['If-None-Match'] = etag;
  return result;
}

// Carries GitHub's HTTP status so callers can branch on it instead of
// pattern-matching the message (which stays in the old format for the client).
export class GitHubApiError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`GitHub API error: ${status} ${statusText}`);
  }
}

async function githubJson(path: string, token?: string): Promise<unknown> {
  const response = await fetch(`${API_ROOT}${path}`, { headers: headers(token) });
  if (!response.ok) throw new GitHubApiError(response.status, response.statusText);
  return response.json();
}

async function githubSend(method: 'POST' | 'PATCH', path: string, token: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new GitHubApiError(response.status, response.statusText);
  return response.json();
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export interface PullRequestSummary {
  number: number; title: string; html_url: string; draft?: boolean;
  additions: number; deletions: number; changed_files: number;
  user: { login: string } | null;
  head: { sha: string; ref: string };
  base: { sha: string; ref: string };
}

export interface PullRequestFile { filename: string; status: string; additions: number; deletions: number }

export function fetchPullRequest(owner: string, repo: string, number: number, token?: string): Promise<PullRequestSummary> {
  return githubJson(`${repoPath(owner, repo)}/pulls/${number}`, token) as Promise<PullRequestSummary>;
}

// GitHub caps this listing at 3000 files; three pages covers any PR a person
// would actually review, and keeps one huge PR from burning the rate limit.
export async function fetchPullRequestFiles(owner: string, repo: string, number: number, token?: string, maxPages = 3): Promise<PullRequestFile[]> {
  const files: PullRequestFile[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = (await githubJson(`${repoPath(owner, repo)}/pulls/${number}/files?per_page=100&page=${page}`, token)) as PullRequestFile[];
    files.push(...batch.map(f => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions })));
    if (batch.length < 100) break;
  }
  return files;
}

// Author logins of the most recent commits touching `path` at `ref`.
export async function fetchPathCommitAuthors(owner: string, repo: string, path: string, ref: string, token?: string, limit = 20): Promise<string[]> {
  const commits = (await githubJson(`${repoPath(owner, repo)}/commits?per_page=${limit}&sha=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}`, token)) as Array<{ author?: { login?: string } | null }>;
  return commits.map(c => c.author?.login).filter((login): login is string => Boolean(login));
}

// Recent history of one file: commit count (capped at 100 — enough to rank
// churn), distinct authors and the latest change, since `since`.
export async function fetchPathHistory(owner: string, repo: string, path: string, ref: string | undefined, since: Date, token?: string): Promise<{ commits: number; authors: number; lastChanged: string | null }> {
  const refQuery = ref ? `&sha=${encodeURIComponent(ref)}` : '';
  const commits = (await githubJson(`${repoPath(owner, repo)}/commits?per_page=100&since=${encodeURIComponent(since.toISOString())}&path=${encodeURIComponent(path)}${refQuery}`, token)) as Array<{ author?: { login?: string } | null; commit?: { author?: { name?: string; date?: string } } }>;
  const authors = new Set(commits.map(c => c.author?.login || c.commit?.author?.name).filter(Boolean));
  return { commits: commits.length, authors: authors.size, lastChanged: commits[0]?.commit?.author?.date ?? null };
}

// Updates the comment carrying `marker` if this app already left one, so each
// push edits a single review comment instead of stacking new ones.
export async function upsertMarkedIssueComment(owner: string, repo: string, number: number, marker: string, body: string, token: string): Promise<void> {
  for (let page = 1; page <= 3; page++) {
    const comments = (await githubJson(`${repoPath(owner, repo)}/issues/${number}/comments?per_page=100&page=${page}`, token)) as Array<{ id: number; body?: string; user?: { type?: string } }>;
    const existing = comments.find(c => c.user?.type === 'Bot' && c.body?.includes(marker));
    if (existing) {
      await githubSend('PATCH', `${repoPath(owner, repo)}/issues/comments/${existing.id}`, token, { body });
      return;
    }
    if (comments.length < 100) break;
  }
  await githubSend('POST', `${repoPath(owner, repo)}/issues/${number}/comments`, token, { body });
}

export async function createCompletedCheckRun(owner: string, repo: string, token: string, run: { name: string; headSha: string; conclusion: 'success' | 'neutral' | 'failure'; title: string; summary: string; detailsUrl?: string }): Promise<void> {
  await githubSend('POST', `${repoPath(owner, repo)}/check-runs`, token, {
    name: run.name,
    head_sha: run.headSha,
    status: 'completed',
    conclusion: run.conclusion,
    details_url: run.detailsUrl,
    output: { title: run.title, summary: run.summary },
  });
}

function decodeBase64(content: string): string {
  return Buffer.from(String(content || '').replace(/\s+/g, ''), 'base64').toString('utf-8');
}

export interface TreeFetchResult {
  notModified: boolean;
  tree?: unknown;
  etag?: string | null;
}

// branch defaults to 'HEAD', a ref the Trees API understands. When `etag` is
// passed, a 304 (nothing changed) doesn't count against the GitHub rate limit.
export async function fetchRepositoryTree(owner: string, repo: string, token?: string, branch = 'HEAD', etag?: string | null): Promise<TreeFetchResult> {
  const response = await fetch(
    `${API_ROOT}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: headers(token, etag || undefined) }
  );
  if (response.status === 304) return { notModified: true };
  if (!response.ok) throw new GitHubApiError(response.status, response.statusText);
  const data = await response.json();
  return { notModified: false, tree: (data as { tree: unknown }).tree, etag: response.headers.get('etag') };
}

// HEAD commit sha for a branch (or the repo's default branch when omitted) —
// used to decide whether a stored analysis is still fresh.
export async function fetchLatestCommitSha(owner: string, repo: string, branch?: string, token?: string): Promise<string | null> {
  const query = branch ? `&sha=${encodeURIComponent(branch)}` : '';
  const commits = (await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=1${query}`, token)) as Array<{ sha?: string }>;
  return commits?.[0]?.sha ?? null;
}

export function fetchUserRepositories(token: string) {
  return githubJson('/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator', token);
}

async function fetchRawFile(owner: string, repo: string, branch: string, path: string, token?: string): Promise<string | null> {
  const segments = path.split('/').filter(segment => segment && segment !== '.' && segment !== '..').map(encodeURIComponent).join('/');
  const response = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${branch.split('/').map(encodeURIComponent).join('/')}/${segments}`, {
    headers: token ? { Authorization: `token ${token}` } : undefined,
  });
  return response.ok ? response.text() : null;
}

// branch is optional — omitted means "the repository's default branch" (the
// contents API, unlike the trees API, has no "HEAD" ref it understands).
export async function fetchFileContent(owner: string, repo: string, path: string, branch?: string, token?: string): Promise<string | null> {
  const segments = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const query = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  try {
    const data = (await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${segments}${query}`, token)) as { content?: string };
    if (data.content) return decodeBase64(data.content);
  } catch {
    // fall through to the raw fallback below
  }
  const guessedBranch = branch || 'main';
  const content = await fetchRawFile(owner, repo, guessedBranch, path, token);
  if (content !== null) return content;
  if (!branch && guessedBranch === 'main') return fetchRawFile(owner, repo, 'master', path, token);
  return null;
}

// Content-addressed by blob sha — a single unconditional fetch, cacheable
// forever by the caller since the sha itself is the freshness proof.
export async function fetchBlobContent(owner: string, repo: string, sha: string, token?: string): Promise<string | null> {
  const data = (await githubJson(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(sha)}`, token)) as { content?: string };
  return data.content ? decodeBase64(data.content) : null;
}
