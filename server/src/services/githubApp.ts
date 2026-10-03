import crypto from 'node:crypto';
import { env } from '../config/env';

// GitHub App plumbing for automatic PR reviews: webhook signature checks and
// short-lived installation tokens. Unlike a user's OAuth connection, an
// installation token acts as the app ("Structrace[bot]"), can create check
// runs, and only reaches the repositories the app was installed on.

const API_ROOT = 'https://api.github.com';

export function githubAppConfigured(): boolean {
  return Boolean(env.githubAppId && env.githubAppPrivateKey && env.githubWebhookSecret);
}

export function githubAppInstallUrl(): string | null {
  return env.githubAppSlug ? `https://github.com/apps/${encodeURIComponent(env.githubAppSlug)}/installations/new` : null;
}

// X-Hub-Signature-256 is "sha256=<hex HMAC of the raw body>". Compared in
// constant time; anything malformed is simply rejected.
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: unknown, secret = env.githubWebhookSecret): boolean {
  if (!secret || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

// App JWT: backdated 60s for clock drift, valid for the 10-minute maximum.
export function createAppJwt(appId = env.githubAppId, privateKey = env.githubAppPrivateKey, now = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

const installationTokens = new Map<number, { value: string; expiresAt: number }>();

// Installation tokens last an hour; reuse one until five minutes before expiry.
export async function getInstallationToken(installationId: number, fetchImpl: typeof fetch = fetch): Promise<string> {
  const cached = installationTokens.get(installationId);
  if (cached && cached.expiresAt - 5 * 60 * 1000 > Date.now()) return cached.value;
  const response = await fetchImpl(`${API_ROOT}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${createAppJwt()}`, 'User-Agent': 'Structrace-App' },
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status} creating an installation token`);
  const data = (await response.json()) as { token: string; expires_at: string };
  installationTokens.set(installationId, { value: data.token, expiresAt: new Date(data.expires_at).getTime() });
  return data.token;
}
