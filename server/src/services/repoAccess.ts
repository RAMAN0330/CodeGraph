import crypto from 'node:crypto';

// The repo tree/file caches are shared across all users and keyed only by
// owner/repo/branch/path. Before a cached private-repo response is served, the
// requester must prove they can read that repository themselves; otherwise one
// user's cache fill would leak private source to anyone who asks for it.

const ACCESS_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;
const accessCache = new Map<string, { allowed: boolean; expiresAt: number }>();

const repoSegmentPattern = /^[A-Za-z0-9_.-]{1,100}$/;
const tokenPattern = /^[A-Za-z0-9_\-.]+$/;

export function isValidRepoSegment(value: unknown): value is string {
  return typeof value === 'string' && repoSegmentPattern.test(value) && value !== '.' && value !== '..';
}

export function sanitizeToken(value: unknown): string | undefined {
  return typeof value === 'string' && value && tokenPattern.test(value) ? value : undefined;
}

function cacheKey(owner: string, repo: string, token?: string): string {
  const principal = token ? crypto.createHash('sha256').update(token).digest('hex') : 'anonymous';
  return `${principal}:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function clearRepoAccessCache(): void {
  accessCache.clear();
}

// Resolves to true only when GitHub confirms the token (or anonymous access,
// for public repos) can read the repository. Definitive answers are memoized
// briefly; transient GitHub failures fail closed and are not memoized.
export async function canReadRepository(owner: string, repo: string, token?: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return false;
  const key = cacheKey(owner, repo, token);
  const now = Date.now();
  const memo = accessCache.get(key);
  if (memo && memo.expiresAt > now) return memo.allowed;

  let status: number;
  let rateLimited = false;
  try {
    const response = await fetchImpl(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Structrace-App',
        ...(token ? { Authorization: `token ${token}` } : {}),
      },
    });
    status = response.status;
    rateLimited = status === 429 || (status === 403 && response.headers?.get?.('x-ratelimit-remaining') === '0');
  } catch {
    return false;
  }
  // A rate-limit 403 says nothing about access: deny now, but ask again later.
  if (rateLimited || (status !== 200 && status !== 401 && status !== 403 && status !== 404)) return false;

  const allowed = status === 200;
  if (accessCache.size >= MAX_ENTRIES) {
    const oldest = accessCache.keys().next().value;
    if (oldest !== undefined) accessCache.delete(oldest);
  }
  accessCache.set(key, { allowed, expiresAt: now + ACCESS_TTL_MS });
  return allowed;
}

// Only public https://github.com/<owner>/<repo> clone URLs are accepted by the
// analysis service; anything else (file://, ssh, internal hosts, embedded
// credentials) is rejected before it reaches `git clone`.
export function parseGithubCloneUrl(value: unknown): { owner: string; repo: string; url: string } | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (!match || !isValidRepoSegment(match[1]) || !isValidRepoSegment(match[2])) return null;
  return { owner: match[1], repo: match[2], url: `https://github.com/${match[1]}/${match[2]}.git` };
}
