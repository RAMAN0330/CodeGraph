import dotenv from 'dotenv';

dotenv.config();

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: integer(process.env.PORT, 5000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  fastApiUrl: process.env.FASTAPI_URL ?? 'http://localhost:8000',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  dbCredentialsSecret: process.env.DB_CREDENTIALS_SECRET ?? 'dev-secret-change-me',
  databaseUrl: process.env.DATABASE_URL ?? '',
  githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  githubCallbackUrl: process.env.GITHUB_CALLBACK_URL ?? 'http://localhost:5000/auth/github/callback',
  // Optional GitHub App for automatic pull request reviews. All three of id,
  // private key and webhook secret are needed; the slug only builds the
  // "install" link. The key may be given with literal \n escapes.
  githubAppId: process.env.GITHUB_APP_ID ?? '',
  githubAppSlug: process.env.GITHUB_APP_SLUG ?? '',
  githubAppPrivateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  // How often project repositories are checked for new commits and
  // re-analyzed (regression alerts come from these runs). 0 turns it off.
  analysisScheduleMinutes: integer(process.env.ANALYSIS_SCHEDULE_MINUTES, 360),
  // Cron (UTC) for the weekly digest to project alert webhooks; "off" disables.
  digestCron: process.env.DIGEST_CRON ?? '0 9 * * 1',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  repoCacheTtlMs: integer(process.env.REPO_CACHE_TTL_MS, 6 * 60 * 60 * 1000),
  // Number of reverse proxies in front of this process (nginx + Go gateway in
  // the compose stacks). Determines which X-Forwarded-For entry is the client
  // IP that rate limits key on; too low makes every user share one limit.
  trustProxyHops: integer(process.env.TRUST_PROXY_HOPS, 1),
});

export function validateEnvironment(): void {
  if (env.nodeEnv === 'production' && env.sessionSecret === 'dev-secret-change-me') {
    throw new Error('SESSION_SECRET must be configured in production');
  }
  if (env.nodeEnv === 'production' && env.dbCredentialsSecret === 'dev-secret-change-me') {
    throw new Error('DB_CREDENTIALS_SECRET must be configured in production');
  }
  if (env.nodeEnv === 'production' && !env.redisUrl) throw new Error('REDIS_URL must be configured in production');
  if (env.nodeEnv === 'production' && !env.databaseUrl) throw new Error('DATABASE_URL must be configured in production');
}
