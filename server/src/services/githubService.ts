const API_ROOT = 'https://api.github.com';

function headers(token?: string, etag?: string): Record<string, string> {
  const result: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'GraphKeep-App',
  };
  if (token) result.Authorization = `token ${token}`;
  if (etag) result['If-None-Match'] = etag;
  return result;
}

async function githubJson(path: string, token?: string): Promise<unknown> {
  const response = await fetch(`${API_ROOT}${path}`, { headers: headers(token) });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  return response.json();
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
  if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
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
  const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {
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
