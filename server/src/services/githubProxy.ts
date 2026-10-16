import crypto from 'node:crypto';

// Read-only GitHub REST proxy for the browser. The user's OAuth token stays on
// the server (it used to be handed to the client), and every response is kept
// with its ETag: a repeat view inside FRESH_MS costs nothing, and after that a
// conditional request that GitHub answers 304 does not count against the rate
// limit. Identical concurrent requests share one upstream call.

const API_ROOT = 'https://api.github.com';
const FRESH_MS = 30 * 1000;
const MAX_ENTRIES = 2000;
const MAX_CACHED_BYTES = 2 * 1024 * 1024;

const SEGMENT = '[A-Za-z0-9_.-]{1,100}';
const ALLOWED_PATHS = [
  new RegExp(`^/repos/${SEGMENT}/${SEGMENT}(/[^?#]*)?$`),
  /^\/user\/repos$/,
  /^\/rate_limit$/,
];

export interface ProxyResult {
  status: number;
  body: string;
  cached: boolean;
  rateLimit: { remaining: string | null; limit: string | null; reset: string | null };
}

interface Entry { etag: string; body: string; fetchedAt: number; rateLimit: ProxyResult['rateLimit'] }

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<ProxyResult>>();

// `pathAndQuery` is what follows /api/github/proxy, e.g. "/repos/o/r/commits?per_page=5".
export function isAllowedProxyPath(pathAndQuery: string): boolean {
  const path = pathAndQuery.split('?')[0];
  if (path.split('/').some(part => part === '..' || part === '.')) return false;
  return ALLOWED_PATHS.some(pattern => pattern.test(path));
}

export function clearGithubProxyCache(): void {
  cache.clear();
}

function keyFor(pathAndQuery: string, token: string): string {
  return `${crypto.createHash('sha256').update(token).digest('hex')}:${pathAndQuery}`;
}

function rateLimitOf(response: Response): ProxyResult['rateLimit'] {
  return {
    remaining: response.headers.get('x-ratelimit-remaining'),
    limit: response.headers.get('x-ratelimit-limit'),
    reset: response.headers.get('x-ratelimit-reset'),
  };
}

function remember(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  // Map keeps insertion order, so the first key is the least recently stored.
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

async function fetchUpstream(key: string, pathAndQuery: string, token: string, fetchImpl: typeof fetch): Promise<ProxyResult> {
  const stale = cache.get(key);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Structrace-App',
    Authorization: `token ${token}`,
  };
  if (stale) headers['If-None-Match'] = stale.etag;
  const response = await fetchImpl(`${API_ROOT}${pathAndQuery}`, { headers });
  const rateLimit = rateLimitOf(response);
  if (response.status === 304 && stale) {
    remember(key, { ...stale, fetchedAt: Date.now(), rateLimit });
    return { status: 200, body: stale.body, cached: true, rateLimit };
  }
  const body = await response.text();
  const etag = response.headers.get('etag');
  // 202 (stats still computing) and errors are never cached.
  if (response.status === 200 && etag && body.length <= MAX_CACHED_BYTES) {
    remember(key, { etag, body, fetchedAt: Date.now(), rateLimit });
  }
  return { status: response.status, body, cached: false, rateLimit };
}

export async function proxyGithubGet(pathAndQuery: string, token: string, fetchImpl: typeof fetch = fetch): Promise<ProxyResult> {
  const key = keyFor(pathAndQuery, token);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < FRESH_MS) {
    return { status: 200, body: hit.body, cached: true, rateLimit: hit.rateLimit };
  }
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetchUpstream(key, pathAndQuery, token, fetchImpl).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
