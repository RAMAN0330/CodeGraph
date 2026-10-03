import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import { env, validateEnvironment } from './config/env';
import type { SchemaColumn, SchemaForeignKey as SchemaFK, SchemaIndex, SchemaTable } from './types/schema';
import { createJsonProxy } from './middleware/asyncProxy';
import { GitHubApiError, fetchBlobContent, fetchFileContent, fetchLatestCommitSha, fetchRepositoryTree, fetchUserRepositories } from './services/githubService';
import { githubAppConfigured, githubAppInstallUrl, verifyWebhookSignature } from './services/githubApp';
import { MissingAnalysisError, buildPrReview, prReviewJobFromEvent } from './services/prReview';
import { getCachedBlob, getCachedFile, getCachedTree, pruneStaleCacheEntries, saveBlobCache, saveFileCache, saveTreeCache, touchTreeCache } from './db/repoCache';
import { initSchema } from './db/pool';
import { UsernameTakenError, clearGithubConnection, createOrganizationWithAdmin, findUserById, findUserByUsername, setGithubConnection, toPublicUser, type UserRow } from './db/users';
import { AccessError, NotFoundError, addMember, assertCanEditProject, createProject, createWorkspace, getAlertWebhook, getDecryptedConnection, listProjects, listWorkspaces, removeMember, removeProject, removeWorkspace, setAlertWebhook, updateDbConnection, type Actor } from './db/projectStore';
import { listAlerts, listSnapshots } from './db/analysisHistory';
import { InviteUnavailableError, createInvite, findOpenInvite, joinOrganizationWithInvite, listMembers } from './db/organization';
import { createAnnotation, deleteAnnotation, listAnnotations, updateAnnotation, validateNote } from './db/annotations';
import { deleteCoverage, getCoverage, saveCoverage, validateCoverage } from './db/coverage';
import { createView, deleteView, listViews, validateView } from './db/savedViews';
import { compareAnalyses } from './analysis/compareAnalyses';
import { aiConfigured, structuredResponse } from './services/openaiClient';
import { connectMysql, connectPostgres, type MysqlConnection } from './services/customerDb';
import { buildExplainContext, explainSchema, EXPLAIN_SYSTEM_PROMPT } from './services/codebaseExplain';
import { sendWebhookMessage } from './services/alertNotifier';
import { getAnalysis, type StoredAnalysis } from './db/analysisStore';
import { createAlertRule, deleteAlertRule, listAlertRules } from './db/metricsSnapshots';
import { buildActivity, buildOverview, buildPerformance, buildQueries, buildReplication, buildSecurity, buildStorage } from './services/telemetry/orchestrate';
import { enqueueAnalysisJob, enqueuePrReviewJob, getAnalysisJobState, startAnalysisWorker, stopAnalysisWorker } from './queue/analysisQueue';
import { canReadRepository, isValidRepoSegment, parseGithubCloneUrl, sanitizeToken } from './services/repoAccess';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends UserRow {}
  }
}

// Node 17+ defaults to 'verbatim' DNS ordering, so a host with both A and AAAA
// records can resolve IPv6-first and fail with ENETUNREACH on networks without
// IPv6 routing (common with hosted Postgres/MySQL providers). Prefer IPv4.
dns.setDefaultResultOrder('ipv4first');

validateEnvironment();

const redisClient = env.redisUrl ? createClient({ url: env.redisUrl }) : null;
redisClient?.on('error', error => console.error('Redis session error:', error));

const app = express();
app.set('trust proxy', env.trustProxyHops);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.clientOrigin,
  credentials: true,
}));

// GitHub App webhook for automatic PR reviews. Registered ahead of the JSON
// parser because the signature covers the exact raw bytes GitHub sent. It
// only queues work; the review itself runs in the pr-review worker.
app.post('/api/github/webhook', express.raw({ type: 'application/json', limit: '5mb' }), async (req: any, res: any) => {
  if (!githubAppConfigured()) return res.status(503).json({ error: 'Automatic PR reviews are not configured.' });
  if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, req.get('x-hub-signature-256'))) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Webhook body is not JSON.' });
  }
  const job = prReviewJobFromEvent(req.get('x-github-event'), payload);
  if (!job) return res.status(202).json({ queued: false });
  try {
    await enqueuePrReviewJob(job);
    res.status(202).json({ queued: true });
  } catch (error: any) {
    res.status(503).json({ error: error.message });
  }
});

app.use(express.json({ limit: '10mb' }));

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Outbound-connection and paid-API endpoints: bounded per client so a session
// can't be used to sweep internal hosts or burn the OpenAI budget.
const outboundRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const credentialsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(session({
  store: redisClient ? new RedisStore({ client: redisClient, prefix: 'codeflow:sess:' }) : undefined,
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.clientOrigin.startsWith('https://'),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

const githubAuthEnabled = Boolean(env.githubClientId && env.githubClientSecret);

class AccountSelectingGitHubStrategy extends GitHubStrategy {
  authorizationParams(options: { prompt?: string }) {
    return options.prompt ? { prompt: options.prompt } : {};
  }
}

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = await findUserByUsername(username);
    if (!user) return done(null, false, { message: 'Invalid username or password.' });
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) return done(null, false, { message: 'Invalid username or password.' });
    done(null, user);
  } catch (error) {
    done(error);
  }
}));

if (githubAuthEnabled) {
  passport.use(new AccountSelectingGitHubStrategy(
    {
      clientID: env.githubClientId,
      clientSecret: env.githubClientSecret,
      callbackURL: env.githubCallbackUrl,
      scope: ['user', 'repo'],
      state: true as unknown as string,
      passReqToCallback: true,
      customHeaders: { 'User-Agent': 'Structrace' },
    } as any,
    (async (req: any, accessToken: string, _refreshToken: string, profile: any, done: Function) => {
      if (!req.user) return done(null, false);
      try {
        const updated = await setGithubConnection(req.user.id, {
          login: profile.username,
          avatarUrl: profile.photos?.[0]?.value ?? '',
          token: accessToken,
        });
        done(null, updated);
      } catch (error) {
        done(error);
      }
    }) as any,
  ));
}

passport.serializeUser((user: UserRow, done) => done(null, user.id));
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await findUserById(id);
    done(null, user ?? false);
  } catch (error) {
    done(error);
  }
});

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

// Prefer an explicit (validated) token from the request body, falling back to
// the GitHub connection stored on the signed-in user.
function actorOf(req: any): Actor {
  return { id: req.user.id, organizationId: req.user.organization_id, role: req.user.role };
}

// 403 when the caller is in the organization but may not change this
// resource; 404 when it is not in their organization at all.
function errorStatus(error: unknown, fallback: number): number {
  if (error instanceof AccessError) return 403;
  if (error instanceof NotFoundError) return 404;
  return fallback;
}

function requestGithubToken(req: any): string | undefined {
  return sanitizeToken(req.body?.token) ?? sanitizeToken(req.user?.github_token);
}

app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));

async function introspectPostgres(conn: { host: string; port: string | number; database: string; user: string; password: string; ssl?: boolean }): Promise<{ tables: SchemaTable[] }> {
  const client = await connectPostgres(conn);
  try {

    const tableResult = await client.query<{table_schema:string; table_name:string}>(`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY table_schema, table_name`);

    // Size/row-count and index metadata are cheap to fetch once for every
    // schema rather than per table, since they don't need to be parameterized
    // per table_name the way information_schema.columns lookups do.
    const [statsRes, indexRes] = await Promise.all([
      client.query<{schemaname:string; relname:string; n_live_tup:string; total_bytes:string}>(`
        SELECT schemaname, relname, n_live_tup, pg_total_relation_size(relid) AS total_bytes
        FROM pg_stat_user_tables`),
      client.query<{schemaname:string; tablename:string; indexname:string; indexdef:string}>(`
        SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`),
    ]);
    const statsByTable = new Map(statsRes.rows.map(r => [`${r.schemaname}.${r.relname}`, r]));
    const indexesByTable = new Map<string, SchemaIndex[]>();
    for (const row of indexRes.rows) {
      const key = `${row.schemaname}.${row.tablename}`;
      const columnsMatch = row.indexdef.match(/\(([^)]+)\)/);
      const index: SchemaIndex = {
        name: row.indexname,
        columns: columnsMatch ? columnsMatch[1].split(',').map(c => c.trim()) : [],
        unique: /CREATE UNIQUE INDEX/i.test(row.indexdef),
      };
      const list = indexesByTable.get(key) ?? [];
      list.push(index);
      indexesByTable.set(key, list);
    }

    const tables: SchemaTable[] = await Promise.all(tableResult.rows.map(async ({ table_schema, table_name }) => {
      const [colRes, pkRes, fkRes] = await Promise.all([
        client.query<{column_name:string; data_type:string; is_nullable:string}>(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema=$1 AND table_name=$2
          ORDER BY ordinal_position`, [table_schema, table_name]),
        client.query<{column_name:string}>(`
          SELECT kcu.column_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema=$1 AND tc.table_name=$2`, [table_schema, table_name]),
        client.query<{column_name:string; foreign_table:string; foreign_column:string}>(`
          SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema=$1 AND tc.table_name=$2`, [table_schema, table_name]),
      ]);
      const pks = new Set(pkRes.rows.map(r => r.column_name));
      const stats = statsByTable.get(`${table_schema}.${table_name}`);
      return {
        name: table_name,
        schema: table_schema,
        rowEstimate: stats ? Number(stats.n_live_tup) : null,
        sizeBytes: stats ? Number(stats.total_bytes) : null,
        indexes: indexesByTable.get(`${table_schema}.${table_name}`) ?? [],
        columns: colRes.rows.map(r => ({ name: r.column_name, type: r.data_type, nullable: r.is_nullable === 'YES', isPrimary: pks.has(r.column_name) })),
        foreignKeys: fkRes.rows.map(r => ({ column: r.column_name, referencedTable: r.foreign_table, referencedColumn: r.foreign_column })),
      };
    }));

    await client.end();
    return { tables };
  } catch (error) {
    try { await client.end(); } catch {}
    throw error;
  }
}

async function introspectMysql(conn: { host: string; port: string | number; database: string; user: string; password: string; ssl?: boolean }): Promise<{ tables: SchemaTable[] }> {
  const { host, port, database, user, password, ssl } = conn;
  let connection: MysqlConnection | undefined;
  try {
    connection = await connectMysql({ host, port, database, user, password, ssl });

    const [tableRows]: any = await connection.execute(
      `SELECT TABLE_NAME, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [database]);

    const tables: SchemaTable[] = await Promise.all((tableRows as any[]).map(async (row: any) => {
      const tbl = row.TABLE_NAME;
      const [colRows]: any = await connection!.execute(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
        [database, tbl]);
      const [fkRows]: any = await connection!.execute(
        `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [database, tbl]);
      const [indexRows]: any = await connection!.execute(
        `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [database, tbl]);
      const indexMap = new Map<string, SchemaIndex>();
      for (const r of indexRows as any[]) {
        const existing = indexMap.get(r.INDEX_NAME);
        if (existing) existing.columns.push(r.COLUMN_NAME);
        else indexMap.set(r.INDEX_NAME, { name: r.INDEX_NAME, columns: [r.COLUMN_NAME], unique: Number(r.NON_UNIQUE) === 0 });
      }
      return {
        name: tbl,
        schema: database,
        rowEstimate: row.TABLE_ROWS === null ? null : Number(row.TABLE_ROWS),
        sizeBytes: (Number(row.DATA_LENGTH) || 0) + (Number(row.INDEX_LENGTH) || 0),
        indexes: Array.from(indexMap.values()),
        columns: (colRows as any[]).map((r: any) => ({ name: r.COLUMN_NAME, type: r.COLUMN_TYPE, nullable: r.IS_NULLABLE === 'YES', isPrimary: r.COLUMN_KEY === 'PRI' })),
        foreignKeys: (fkRows as any[]).map((r: any) => ({ column: r.COLUMN_NAME, referencedTable: r.REFERENCED_TABLE_NAME, referencedColumn: r.REFERENCED_COLUMN_NAME })),
      };
    }));

    await connection.end();
    return { tables };
  } catch (error) {
    try { if (connection) await connection.end(); } catch {}
    throw error;
  }
}

// --- PostgreSQL ---
app.post('/api/db/connect/postgres', requireAuth, outboundRateLimit, async (req, res) => {
  try {
    const schema = await introspectPostgres(req.body);
    res.json({ success: true, schema });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- MySQL ---
app.post('/api/db/connect/mysql', requireAuth, outboundRateLimit, async (req, res) => {
  try {
    const schema = await introspectMysql(req.body);
    res.json({ success: true, schema });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- SQL Dump Parser (client uploads .sql file text) ---
function splitSqlDefinitions(body: string): string[] {
  const definitions: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '(') depth += 1;
    else if (body[index] === ')') depth = Math.max(0, depth - 1);
    else if (body[index] === ',' && depth === 0) {
      definitions.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  definitions.push(body.slice(start).trim());
  return definitions.filter(Boolean);
}

const MAX_SQL_DUMP_CHARS = 5 * 1024 * 1024;

app.post('/api/db/parse-sql', (req, res) => {
  const { sql } = req.body as { sql: string };
  if (!sql || typeof sql !== 'string') return res.status(400).json({ success: false, error: 'No SQL provided' });
  if (sql.length > MAX_SQL_DUMP_CHARS) return res.status(413).json({ success: false, error: 'SQL file is too large to parse (limit 5 MB).' });
  try {
    const tables: SchemaTable[] = [];
    // Match CREATE TABLE blocks
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([^;]+)\)/gim;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(sql)) !== null) {
      const tableName = m[1];
      const body = m[2];
      const columns: SchemaColumn[] = [];
      const foreignKeys: SchemaFK[] = [];
      const pkCols = new Set<string>();
      // PRIMARY KEY inline or constraint
      const pkMatch = body.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) pkMatch[1].split(',').forEach(c => pkCols.add(c.trim().replace(/[`"']/g, '')));
      // Foreign keys
      const fkRe = /FOREIGN\s+KEY\s*\([`"']?(\w+)[`"']?\)\s+REFERENCES\s+[`"']?(\w+)[`"']?\s*\([`"']?(\w+)[`"']?\)/gi;
      let fkM: RegExpExecArray | null;
      while ((fkM = fkRe.exec(body)) !== null) {
        foreignKeys.push({ column: fkM[1], referencedTable: fkM[2], referencedColumn: fkM[3] });
      }
      // Columns (skip constraint lines)
      const lines = splitSqlDefinitions(body);
      for (const line of lines) {
        const trimmed = line.trim().replace(/,$/, '');
        if (!trimmed || /^(PRIMARY|UNIQUE|INDEX|KEY|CONSTRAINT|FOREIGN)/i.test(trimmed)) continue;
        const colMatch = trimmed.match(/^[`"']?(\w+)[`"']?\s+(\S+)/);
        if (!colMatch) continue;
        const colName = colMatch[1];
        const colType = colMatch[2].replace(/[`"']/g, '');
        columns.push({ name: colName, type: colType, nullable: !/NOT\s+NULL/i.test(trimmed), isPrimary: pkCols.has(colName) || /PRIMARY\s+KEY/i.test(trimmed) });
      }
      if (columns.length > 0) tables.push({ name: tableName, columns, foreignKeys });
    }
    res.json({ success: true, schema: { tables } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- GitHub proxy ---
// Cached in Postgres (see repo_tree_cache). A fresh row is served with zero
// network calls; a stale one is refreshed with a conditional (ETag) request,
// which costs nothing against the rate limit when GitHub replies 304.
app.post('/api/github/repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo, branch } = req.body ?? {};
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ success: false, error: 'owner and repo are required' });
  const cacheBranch = typeof branch === 'string' && branch ? branch : 'HEAD';
  try {
    const token = requestGithubToken(req);
    const cached = await getCachedTree(owner, repo, cacheBranch);
    // The cache is shared across users: prove read access before serving it.
    if (cached && !(await canReadRepository(owner, repo, token))) {
      return res.status(404).json({ success: false, error: 'Repository not found or not accessible.' });
    }
    if (cached && cached.fresh) return res.json({ success: true, tree: cached.tree, cached: true });
    const result = await fetchRepositoryTree(owner, repo, token, cacheBranch, cached?.etag);
    if (result.notModified && cached) {
      await touchTreeCache(owner, repo, cacheBranch);
      return res.json({ success: true, tree: cached.tree, cached: true });
    }
    await saveTreeCache(owner, repo, cacheBranch, result.tree, result.etag ?? null);
    res.json({ success: true, tree: result.tree, cached: false });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Same cache treatment for individual file contents. When the caller supplies
// a blob `sha` (from a tree scan), content is cached forever under
// repo_file_blob_cache — a sha's content can never change, so a re-analysis
// only ever fetches files whose sha actually changed. Without a sha, falls
// back to the path+branch/TTL cache (repo_file_cache).
app.post('/api/github/file', requireAuth, async (req: any, res: any) => {
  const { owner, repo, path, branch, sha } = req.body ?? {};
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo) || typeof path !== 'string' || !path) {
    return res.status(400).json({ success: false, error: 'owner, repo, and path are required' });
  }
  try {
    const token = requestGithubToken(req);
    if (sha) {
      const cachedBlob = await getCachedBlob(owner, repo, String(sha));
      if (cachedBlob !== null) {
        if (!(await canReadRepository(owner, repo, token))) return res.status(404).json({ success: false, error: 'Repository not found or not accessible.' });
        return res.json({ success: true, content: cachedBlob, cached: true });
      }
      const content = await fetchBlobContent(owner, repo, String(sha), token);
      if (content !== null) await saveBlobCache(owner, repo, String(sha), content);
      return res.json({ success: true, content, cached: false });
    }
    const cacheBranch = typeof branch === 'string' && branch ? branch : '';
    const cachedContent = await getCachedFile(owner, repo, cacheBranch, path);
    if (cachedContent !== null) {
      if (!(await canReadRepository(owner, repo, token))) return res.status(404).json({ success: false, error: 'Repository not found or not accessible.' });
      return res.json({ success: true, content: cachedContent, cached: true });
    }
    const content = await fetchFileContent(owner, repo, path, cacheBranch || undefined, token);
    if (content !== null) await saveFileCache(owner, repo, cacheBranch, path, content);
    res.json({ success: true, content, cached: false });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Optional text-only enrichment for the deterministic client architecture graph.
app.post('/api/architecture/enrich', requireAuth, outboundRateLimit, async (req: any, res: any) => {
  if (!env.openaiApiKey) return res.status(503).json({ error: 'AI explanation is not configured. The validated architecture remains available.' });
  const graph = req.body?.graph;
  if (!graph || graph.version !== 1 || !Array.isArray(graph.groups) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return res.status(400).json({ error: 'A valid architecture graph is required.' });
  }
  if (graph.groups.length > 10 || graph.nodes.length > 60 || graph.edges.length > 120 || JSON.stringify(graph).length > 120_000) {
    return res.status(413).json({ error: 'Architecture graph exceeds enrichment limits.' });
  }
  const groups = graph.groups.map((group: any) => ({ id: String(group.id).slice(0, 80), label: String(group.label || '').slice(0, 120), description: String(group.description || '').slice(0, 400) }));
  const nodes = graph.nodes.map((node: any) => ({ id: String(node.id).slice(0, 80), groupId: String(node.groupId).slice(0, 80), label: String(node.label || '').slice(0, 120), description: String(node.description || '').slice(0, 400), paths: Array.isArray(node.paths) ? node.paths.slice(0, 30).map((path: unknown) => String(path).slice(0, 300)) : [] }));
  const edges = graph.edges.map((edge: any) => ({ source: String(edge.source).slice(0, 80), target: String(edge.target).slice(0, 80), label: String(edge.label || '').slice(0, 80) }));
  const groupIds = new Set(groups.map((group: any) => group.id));
  const nodeIds = new Set(nodes.map((node: any) => node.id));
  if (groups.some((group: any) => !group.id) || nodes.some((node: any) => !node.id || !groupIds.has(node.groupId)) || edges.some((edge: any) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
    return res.status(400).json({ error: 'Architecture graph contains invalid topology.' });
  }

  const schema = {
    type: 'object', additionalProperties: false, required: ['summary', 'groups', 'nodes'],
    properties: {
      summary: { type: 'string', maxLength: 600 },
      groups: { type: 'array', maxItems: 10, items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'description'], properties: { id: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' } } } },
      nodes: { type: 'array', maxItems: 60, items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'description'], properties: { id: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' } } } },
    },
  };
  try {
    const enrichment: any = await structuredResponse({
      system: 'Explain this repository architecture concisely. Preserve every supplied ID exactly. Return text updates only; do not invent components, paths, connections, or IDs.',
      user: JSON.stringify({ groups, nodes, edges }),
      schemaName: 'architecture_enrichment',
      schema,
    });
    const safeGroups = Array.isArray(enrichment.groups) ? enrichment.groups.filter((item: any) => groupIds.has(item.id)).map((item: any) => ({ id: item.id, label: String(item.label || '').slice(0, 120), description: String(item.description || '').slice(0, 400) })) : [];
    const safeNodes = Array.isArray(enrichment.nodes) ? enrichment.nodes.filter((item: any) => nodeIds.has(item.id)).map((item: any) => ({ id: item.id, label: String(item.label || '').slice(0, 120), description: String(item.description || '').slice(0, 400) })) : [];
    return res.json({ summary: String(enrichment.summary || '').slice(0, 600), groups: safeGroups, nodes: safeNodes });
  } catch (error: any) {
    return res.status(502).json({ error: error?.message || 'Unable to generate the architecture explanation.' });
  }
});

// Auth routes
app.get('/auth/config', (_req, res) => res.json({ github: githubAuthEnabled }));

const usernamePattern = /^[a-zA-Z0-9_.-]{3,32}$/;

function loginSession(req: any, res: any, next: any, user: UserRow, onSuccess: () => void) {
  // Regenerate the session on login to prevent session-fixation.
  req.session.regenerate((regenerateError: unknown) => {
    if (regenerateError) return next(regenerateError);
    req.login(user, (loginError: unknown) => {
      if (loginError) return next(loginError);
      onSuccess();
    });
  });
}

// With an invite token the account joins the inviting organization as a
// member; without one it founds a new organization as its admin.
app.post('/auth/register', credentialsRateLimit, async (req, res, next) => {
  const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken : '';
  const organizationName = String(req.body?.organizationName ?? '').trim();
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!inviteToken && !organizationName) return res.status(400).json({ error: 'Organization name is required.' });
  if (!usernamePattern.test(username)) return res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, . _ -).' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = inviteToken
      ? await joinOrganizationWithInvite(inviteToken, username, passwordHash)
      : await createOrganizationWithAdmin(organizationName, username, passwordHash);
    loginSession(req, res, next, user, () => res.status(201).json(toPublicUser(user)));
  } catch (error) {
    if (error instanceof UsernameTakenError) return res.status(409).json({ error: error.message });
    if (error instanceof InviteUnavailableError) return res.status(410).json({ error: error.message });
    next(error);
  }
});

app.get('/auth/invite/:token', authRateLimit, async (req, res) => {
  try {
    const invite = await findOpenInvite(String(req.params.token));
    if (!invite) return res.status(404).json({ error: 'This invite link has expired or was already used.' });
    res.json(invite);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Organization (team) ---
app.get('/api/organization/members', requireAuth, async (req: any, res: any) => {
  try {
    res.json({ members: await listMembers(req.user.organization_id), canInvite: req.user.role === 'admin' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/organization/invites', requireAuth, credentialsRateLimit, async (req: any, res: any) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only organization admins can invite people.' });
  try {
    const { token, expiresAt } = await createInvite(req.user.organization_id, req.user.id);
    res.status(201).json({ url: `${env.clientOrigin.replace(/\/$/, '')}/register?invite=${token}`, expiresAt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/auth/login', credentialsRateLimit, (req, res, next) => {
  passport.authenticate('local', (error: unknown, user: UserRow | false, info: { message?: string } | undefined) => {
    if (error) return next(error);
    if (!user) return res.status(401).json({ error: info?.message ?? 'Invalid username or password.' });
    loginSession(req, res, next, user, () => res.json(toPublicUser(user)));
  })(req, res, next);
});

app.get('/auth/github', authRateLimit, (req, res, next) => {
  if (!githubAuthEnabled) {
    return res.status(503).json({ error: 'GitHub OAuth is not configured.' });
  }
  if (!req.isAuthenticated?.()) return res.redirect(`${env.clientOrigin}/login`);
  passport.authenticate('github', { prompt: 'select_account' } as any)(req, res, next);
});

app.get('/auth/github/callback', authRateLimit, (req, res, next) => {
  if (!githubAuthEnabled) return res.redirect(`${env.clientOrigin}/welcome?connect=unavailable`);
  if (!req.isAuthenticated?.()) return res.redirect(`${env.clientOrigin}/login`);
  passport.authenticate('github', { failureRedirect: `${env.clientOrigin}/welcome?connect=failed` })(req, res, next);
}, (_req: any, res: any) => {
  res.redirect(`${env.clientOrigin}/welcome`);
});

app.post('/auth/github/disconnect', requireAuth, async (req: any, res: any, next: any) => {
  try {
    const updated = await clearGithubConnection(req.user.id);
    res.json(toPublicUser(updated));
  } catch (error) {
    next(error);
  }
});

app.get('/auth/me', (req: any, res: any) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(toPublicUser(req.user));
});

function endAuthenticatedSession(req: any, res: any, redirect: boolean) {
  req.logout((logoutError: unknown) => {
    if (logoutError) return res.status(500).json({ error: 'Unable to sign out' });
    req.session.destroy((sessionError: unknown) => {
      if (sessionError) return res.status(500).json({ error: 'Unable to clear session' });
      res.clearCookie('connect.sid', { path: '/' });
      res.clearCookie('connect.sid', { path: '/', secure: false });
      if (redirect) return res.redirect(env.clientOrigin);
      return res.status(204).end();
    });
  });
}

app.post('/auth/logout', authRateLimit, (req: any, res: any) => endAuthenticatedSession(req, res, false));
app.get('/auth/logout', authRateLimit, (req: any, res: any) => endAuthenticatedSession(req, res, true));

// Fetch authenticated user's repos
app.get('/api/github/repos', requireAuth, async (req: any, res: any) => {
  if (!req.user.github_token) return res.status(409).json({ error: 'Connect a GitHub account before browsing repositories.' });
  try {
    const repos = await fetchUserRepositories(req.user.github_token);
    res.json({ repos });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cheap "can this user read owner/repo?" check used when creating a project
// for a repository that isn't in the user's own repository list (e.g. a
// public repo they don't own). Memoized per user/repo in repoAccess.
app.get('/api/github/access/:owner/:repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  res.json({ accessible: await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)) });
});

// Hand the connected GitHub token to the client so it can authenticate its own
// direct-to-GitHub API calls (repo scans, branch/commit browsing, etc).
app.get('/api/github/token', requireAuth, (req: any, res: any) => {
  if (!req.user.github_token) return res.status(409).json({ error: 'Connect a GitHub account before browsing repositories.' });
  res.json({ token: req.user.github_token });
});

// --- Projects / workspaces (server-backed, replacing client localStorage) ---
app.get('/api/projects', requireAuth, async (req: any, res: any) => {
  try {
    const [workspaces, projects] = await Promise.all([listWorkspaces(actorOf(req)), listProjects(actorOf(req))]);
    res.json({ workspaces, projects });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspaces', requireAuth, async (req: any, res: any) => {
  try {
    const workspace = await createWorkspace(actorOf(req), String(req.body?.name ?? ''));
    res.status(201).json(workspace);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/workspaces/:id', requireAuth, async (req: any, res: any) => {
  try {
    await removeWorkspace(actorOf(req), Number(req.params.id));
    res.status(204).end();
  } catch (error: any) {
    res.status(errorStatus(error, 500)).json({ error: error.message });
  }
});

app.post('/api/projects', requireAuth, async (req: any, res: any) => {
  try {
    const projectType = req.body?.projectType === 'database' ? 'database' : 'codebase';
    const project = await createProject(actorOf(req), {
      workspaceId: Number(req.body?.workspaceId),
      name: String(req.body?.name ?? ''),
      instructions: String(req.body?.instructions ?? ''),
      projectType,
      repositoryFullName: req.body?.repositoryFullName !== undefined ? String(req.body.repositoryFullName) : undefined,
      dbConnection: req.body?.dbConnection,
    });
    res.status(201).json(project);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/projects/:id', requireAuth, async (req: any, res: any) => {
  try {
    await removeProject(actorOf(req), Number(req.params.id));
    res.status(204).end();
  } catch (error: any) {
    res.status(errorStatus(error, 500)).json({ error: error.message });
  }
});

app.post('/api/projects/:id/schema', requireAuth, async (req: any, res: any) => {
  try {
    const connection = await getDecryptedConnection(actorOf(req), Number(req.params.id));
    const schema = connection.dbType === 'mysql' ? await introspectMysql(connection) : await introspectPostgres(connection);
    res.json({ success: true, schema });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/projects/:id/db-connection', requireAuth, async (req: any, res: any) => {
  try {
    const summary = await updateDbConnection(actorOf(req), Number(req.params.id), req.body?.dbConnection);
    res.json(summary);
  } catch (error: any) {
    res.status(errorStatus(error, 400)).json({ error: error.message });
  }
});

// --- Database Dashboard telemetry (Postgres/MySQL projects only) ---
app.get('/api/projects/:id/db/overview', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(actorOf(req), projectId);
    const data = await buildOverview(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/performance', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(actorOf(req), projectId);
    const data = await buildPerformance(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/queries', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(actorOf(req), projectId);
    const data = await buildQueries(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/storage', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(actorOf(req), projectId);
    const data = await buildStorage(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/replication', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(actorOf(req), projectId);
    const data = await buildReplication(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/activity', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await getDecryptedConnection(actorOf(req), projectId); // ownership check
    const data = await buildActivity(projectId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/security', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(actorOf(req), projectId);
    const data = await buildSecurity(connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/alerts', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await getDecryptedConnection(actorOf(req), projectId); // ownership check
    const rules = await listAlertRules(projectId);
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/projects/:id/db/alerts', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await assertCanEditProject(actorOf(req), projectId);
    const rule = await createAlertRule(projectId, {
      metric: String(req.body?.metric ?? ''),
      condition: req.body?.condition === 'lt' ? 'lt' : 'gt',
      threshold: Number(req.body?.threshold),
      forMinutes: Number(req.body?.forMinutes) || 5,
    });
    res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    res.status(errorStatus(error, 400)).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects/:id/db/alerts/:ruleId', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await assertCanEditProject(actorOf(req), projectId);
    await deleteAlertRule(projectId, Number(req.params.ruleId));
    res.status(204).end();
  } catch (error: any) {
    res.status(errorStatus(error, 400)).json({ success: false, error: error.message });
  }
});

app.post('/api/projects/:id/members', requireAuth, async (req: any, res: any) => {
  try {
    const member = await addMember(actorOf(req), Number(req.params.id), String(req.body?.username ?? ''));
    res.status(201).json(member);
  } catch (error: any) {
    res.status(errorStatus(error, 400)).json({ error: error.message });
  }
});

app.delete('/api/projects/:id/members/:memberId', requireAuth, async (req: any, res: any) => {
  try {
    await removeMember(actorOf(req), Number(req.params.id), Number(req.params.memberId));
    res.status(204).end();
  } catch (error: any) {
    res.status(errorStatus(error, 500)).json({ error: error.message });
  }
});

// --- Analysis results (server-side background job) ---
// The actual GitHub fetch + parse runs as a BullMQ job (see
// queue/analysisQueue.ts, analysis/runAnalysis.ts) — it survives the
// requesting browser closing, and finishes into analysis_results (see
// db/analysisStore.ts) keyed by owner/repo/branch + the commit sha analyzed.
function resolveAnalysisBranch(req: any): string {
  return typeof req.query.branch === 'string' && req.query.branch ? req.query.branch : 'HEAD';
}

// A saved GitHub connection that GitHub now rejects (revoked, expired) would
// otherwise fail every analysis, public repositories included. Drop it so the
// account shows as disconnected, and carry on anonymously; a private repo then
// surfaces as "not found" with the hint to reconnect.
async function resolveAnalysisHead(req: any, owner: string, repo: string, branch: string): Promise<{ headSha: string | null; token?: string }> {
  const ref = branch === 'HEAD' ? undefined : branch;
  const token = req.user.github_token || undefined;
  try {
    return { headSha: await fetchLatestCommitSha(owner, repo, ref, token), token };
  } catch (error: any) {
    if (!token || !(error instanceof GitHubApiError && error.status === 401)) throw error;
    req.user = await clearGithubConnection(req.user.id);
    return { headSha: await fetchLatestCommitSha(owner, repo, ref, undefined), token: undefined };
  }
}

type AnalysisReadiness = { status: 'ready'; stored: StoredAnalysis } | { status: 'queued' | 'active' | 'failed' };

// Checks freshness against the branch's current commit; auto-enqueues a job
// when stale or missing instead of ever computing the analysis inline.
async function ensureAnalysisFresh(req: any, owner: string, repo: string, branch: string): Promise<AnalysisReadiness> {
  const { headSha, token } = await resolveAnalysisHead(req, owner, repo, branch);
  const stored = await getAnalysis(owner, repo, branch);
  if (headSha && stored && stored.commitSha === headSha) return { status: 'ready', stored };
  // Don't auto-retry a job that already failed — that would silently loop
  // forever on a poll every couple seconds. Surface it and let the user
  // retry explicitly via the refresh (Rescan) endpoint.
  const existingState = await getAnalysisJobState(owner, repo, branch);
  if (existingState === 'failed') return { status: 'failed' };
  await enqueueAnalysisJob({ owner, repo, branch, commitSha: headSha || stored?.commitSha || 'unknown', token });
  const state = await getAnalysisJobState(owner, repo, branch);
  return { status: state === 'active' ? 'active' : 'queued' };
}

app.get('/api/analysis/:owner/:repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  try {
    const readiness = await ensureAnalysisFresh(req, owner, repo, resolveAnalysisBranch(req));
    if (readiness.status !== 'ready') return res.status(202).json({ status: readiness.status });
    const { stored } = readiness;
    res.json({ status: 'ready', commitSha: stored.commitSha, data: stored.data, analyzedAt: stored.analyzedAt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manual "Rescan" — force a re-analysis regardless of freshness.
app.post('/api/analysis/:owner/:repo/refresh', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  const branch = resolveAnalysisBranch(req);
  try {
    const { headSha, token } = await resolveAnalysisHead(req, owner, repo, branch);
    await enqueueAnalysisJob({ owner, repo, branch, commitSha: headSha || 'unknown', token });
    const state = await getAnalysisJobState(owner, repo, branch);
    res.status(202).json({ status: state === 'active' ? 'active' : state === 'failed' ? 'failed' : 'queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const refPattern = /^[A-Za-z0-9_./-]{1,200}$/;
function isValidRef(value: unknown): value is string {
  return typeof value === 'string' && refPattern.test(value) && !value.startsWith('-') && !value.includes('..');
}

// Architecture diff between two branches. Each side must be analyzed at its
// current commit first; until both are, this answers 202 with each side's job
// status (the client polls), exactly like the single-branch analysis route.
app.get('/api/analysis/:owner/:repo/compare', requireAuth, outboundRateLimit, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  const { base, head } = req.query;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  if (!isValidRef(base) || !isValidRef(head) || base === head) return res.status(400).json({ error: 'Pick two different branches to compare.' });
  try {
    const [baseReady, headReady] = await Promise.all([ensureAnalysisFresh(req, owner, repo, base), ensureAnalysisFresh(req, owner, repo, head)]);
    if (baseReady.status === 'ready' && headReady.status === 'ready') {
      return res.json({
        status: 'ready',
        base: { ref: base, commitSha: baseReady.stored.commitSha },
        head: { ref: head, commitSha: headReady.stored.commitSha },
        diff: compareAnalyses(baseReady.stored.data, headReady.stored.data),
      });
    }
    res.status(202).json({ status: 'pending', base: { ref: base, status: baseReady.status }, head: { ref: head, status: headReady.status } });
  } catch (error: any) {
    if (error instanceof GitHubApiError && error.status === 404) return res.status(404).json({ error: 'One of those branches was not found.' });
    res.status(500).json({ error: error.message });
  }
});

// --- Ask the codebase ---
// Questions are answered client-side from the graph (codebaseQuery.ts); this
// optional step writes a prose answer from the matched files' code, taken
// from the stored analysis. Only offered when an AI key is configured.
app.get('/api/analysis/ai-config', requireAuth, (_req: any, res: any) => res.json({ explain: aiConfigured() }));

app.post('/api/analysis/:owner/:repo/explain', requireAuth, outboundRateLimit, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  if (!question) return res.status(400).json({ error: 'Ask a question first.' });
  if (!aiConfigured()) return res.status(503).json({ error: 'AI answers are not configured on this server.' });
  try {
    if (!(await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)))) return res.status(404).json({ error: 'Repository not found or not accessible.' });
    const branch = typeof req.body?.branch === 'string' && isValidRef(req.body.branch) ? req.body.branch : 'HEAD';
    const stored = (await getAnalysis(owner, repo, branch)) ?? (await getAnalysis(owner, repo, 'HEAD'));
    if (!stored) return res.status(409).json({ error: 'Analyze this repository first.' });
    const { user, allowed } = buildExplainContext(stored.data, question, req.body?.paths);
    if (!allowed.size) return res.status(400).json({ error: 'No matching files to explain from.' });
    const result = await structuredResponse<{ answer: string; cited: string[] }>({ system: EXPLAIN_SYSTEM_PROMPT, user, schemaName: 'codebase_answer', schema: explainSchema });
    res.json({
      answer: String(result.answer || '').slice(0, 4000),
      // Only paths that were actually part of the evidence can be cited.
      cited: (Array.isArray(result.cited) ? result.cited : []).filter(p => allowed.has(p)).slice(0, 8),
    });
  } catch (error: any) {
    res.status(502).json({ error: error.message || 'Could not get an answer.' });
  }
});

// Health snapshots per analyzed commit (oldest first) and recent regression
// alerts for the repository. Shared across users, so access is checked first.
app.get('/api/analysis/:owner/:repo/history', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  try {
    if (!(await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)))) return res.status(404).json({ error: 'Repository not found or not accessible.' });
    const [snapshots, alerts] = await Promise.all([listSnapshots(owner, repo, resolveAnalysisBranch(req)), listAlerts(owner, repo)]);
    res.json({ snapshots, alerts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Regression alert destination for a codebase project ---
app.put('/api/projects/:id/alert-webhook', requireAuth, async (req: any, res: any) => {
  const url = req.body?.url;
  if (url !== null && typeof url !== 'string') return res.status(400).json({ error: 'url must be a string or null.' });
  try {
    const configured = await setAlertWebhook(actorOf(req), Number(req.params.id), url === null || !url.trim() ? null : url);
    res.json({ configured });
  } catch (error: any) {
    res.status(errorStatus(error, 400)).json({ error: error.message });
  }
});

app.post('/api/projects/:id/alert-webhook/test', requireAuth, outboundRateLimit, async (req: any, res: any) => {
  try {
    const { url, repositoryFullName } = await getAlertWebhook(actorOf(req), Number(req.params.id));
    if (!url) return res.status(409).json({ error: 'Save a webhook URL first.' });
    await sendWebhookMessage(url, `Structrace: regression alerts for ${repositoryFullName} will be posted here.`);
    res.status(204).end();
  } catch (error: any) {
    res.status(errorStatus(error, 502)).json({ error: error.message });
  }
});

// --- Team notes on repository files ---
// Scoped to the caller's organization; reading or adding notes for a
// repository also requires being able to read that repository.
app.get('/api/annotations/:owner/:repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  try {
    if (!(await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)))) return res.status(404).json({ error: 'Repository not found or not accessible.' });
    res.json({ annotations: await listAnnotations(req.user.organization_id, owner, repo), userId: req.user.id, isAdmin: req.user.role === 'admin' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/annotations/:owner/:repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  let note: { path: string; body: string };
  try {
    note = validateNote(req.body?.path, req.body?.body);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
  try {
    if (!(await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)))) return res.status(404).json({ error: 'Repository not found or not accessible.' });
    res.status(201).json(await createAnnotation(req.user.organization_id, req.user.id, owner, repo, note.path, note.body));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/annotations/:id', requireAuth, async (req: any, res: any) => {
  const id = Number(req.params.id);
  const change: { body?: string; resolved?: boolean } = {};
  try {
    if (req.body?.body !== undefined) change.body = validateNote('x', req.body.body).body;
    if (typeof req.body?.resolved === 'boolean') change.resolved = req.body.resolved;
    const updated = await updateAnnotation(req.user.organization_id, req.user.id, id, change);
    if (!updated) return res.status(404).json({ error: 'Note not found.' });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/annotations/:id', requireAuth, async (req: any, res: any) => {
  try {
    const removed = await deleteAnnotation(req.user.organization_id, { id: req.user.id, role: req.user.role }, Number(req.params.id));
    if (!removed) return res.status(404).json({ error: 'Note not found, or not yours to delete.' });
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Test coverage (uploaded from CI reports, parsed in the browser) ---
async function coverageRequest(req: any, res: any): Promise<{ owner: string; repo: string; branch: string } | null> {
  const { owner, repo } = req.params;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) { res.status(400).json({ error: 'Use owner/repository.' }); return null; }
  if (!(await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)))) { res.status(404).json({ error: 'Repository not found or not accessible.' }); return null; }
  const branch = typeof req.query.branch === 'string' && isValidRef(req.query.branch) ? req.query.branch : 'HEAD';
  return { owner, repo, branch };
}

app.get('/api/coverage/:owner/:repo', requireAuth, async (req: any, res: any) => {
  try {
    const target = await coverageRequest(req, res);
    if (!target) return;
    res.json({ report: await getCoverage(req.user.organization_id, target.owner, target.repo, target.branch) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/coverage/:owner/:repo', requireAuth, async (req: any, res: any) => {
  let report: ReturnType<typeof validateCoverage>;
  try {
    report = validateCoverage(req.body?.format, req.body?.files);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
  try {
    const target = await coverageRequest(req, res);
    if (!target) return;
    await saveCoverage(req.user.organization_id, req.user.id, target.owner, target.repo, target.branch, report.format, report.files);
    res.json({ report: await getCoverage(req.user.organization_id, target.owner, target.repo, target.branch) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/coverage/:owner/:repo', requireAuth, async (req: any, res: any) => {
  try {
    const target = await coverageRequest(req, res);
    if (!target) return;
    await deleteCoverage(req.user.organization_id, target.owner, target.repo, target.branch);
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- Saved workspace views (shared within the organization) ---
app.get('/api/views/:owner/:repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  try {
    if (!(await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)))) return res.status(404).json({ error: 'Repository not found or not accessible.' });
    res.json({ views: await listViews(req.user.organization_id, owner, repo), userId: req.user.id, isAdmin: req.user.role === 'admin' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/views/:owner/:repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return res.status(400).json({ error: 'Use owner/repository.' });
  let view: ReturnType<typeof validateView>;
  try {
    view = validateView(req.body);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
  try {
    if (!(await canReadRepository(owner, repo, sanitizeToken(req.user.github_token)))) return res.status(404).json({ error: 'Repository not found or not accessible.' });
    res.status(201).json(await createView(req.user.organization_id, req.user.id, owner, repo, view));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/views/:id', requireAuth, async (req: any, res: any) => {
  try {
    const removed = await deleteView(req.user.organization_id, { id: req.user.id, role: req.user.role }, Number(req.params.id));
    if (!removed) return res.status(404).json({ error: 'View not found, or not yours to delete.' });
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- PR impact review (in-app) ---
// Same report the GitHub App posts on a pull request, scored against the
// stored analysis of the PR's base branch rather than a fresh one.
app.get('/api/pr-review/config', requireAuth, (_req: any, res: any) => {
  res.json({ automatic: githubAppConfigured(), installUrl: githubAppInstallUrl() });
});

app.get('/api/pr-review/:owner/:repo/:number', requireAuth, outboundRateLimit, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  const number = Number(req.params.number);
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo) || !Number.isInteger(number) || number < 1) {
    return res.status(400).json({ error: 'Use owner/repository and a pull request number.' });
  }
  const token = sanitizeToken(req.user.github_token);
  try {
    // The stored analysis is shared across users; prove access before using it.
    if (!(await canReadRepository(owner, repo, token))) return res.status(404).json({ error: 'Repository not found or not accessible.' });
    res.json(await buildPrReview({ owner, repo, number, token, analysis: 'stored' }));
  } catch (error: any) {
    if (error instanceof GitHubApiError && error.status === 404) return res.status(404).json({ error: `Pull request #${number} was not found.` });
    if (error instanceof MissingAnalysisError) return res.status(409).json({ error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Proxy → FastAPI on port 8000. The analysis service clones whatever URL it
// is handed, so only authenticated users may start a job, and only for a
// github.com repository they can actually read.
const proxyToFastAPI = createJsonProxy(env.fastApiUrl);
app.post('/api/analyze', requireAuth, outboundRateLimit, async (req: any, res: any) => {
  const target = parseGithubCloneUrl(req.body?.url);
  if (!target) return res.status(400).json({ error: 'Only https://github.com/<owner>/<repo> URLs can be analyzed.' });
  const token = requestGithubToken(req);
  if (!(await canReadRepository(target.owner, target.repo, token))) {
    return res.status(404).json({ error: 'Repository not found or not accessible.' });
  }
  const branch = typeof req.body?.branch === 'string' && /^[A-Za-z0-9_./-]{1,200}$/.test(req.body.branch) && !req.body.branch.startsWith('-') ? req.body.branch : undefined;
  req.body = { url: target.url, token, branch };
  return proxyToFastAPI(req, res);
});
app.get('/api/tasks/:taskId', requireAuth, (req: any, res: any) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.taskId)) return res.status(400).json({ error: 'Invalid task id.' });
  return proxyToFastAPI(req, res);
});

async function start(): Promise<void> {
  if (redisClient && !redisClient.isOpen) await redisClient.connect();
  await initSchema();
  const server = app.listen(env.port, () => console.log(`Server running on http://localhost:${env.port}`));

  const runCachePrune = () => pruneStaleCacheEntries()
    .then(counts => console.log(`Repo cache pruned: ${JSON.stringify(counts)}`))
    .catch(error => console.error('Repo cache prune failed:', error));
  runCachePrune();
  const pruneInterval = setInterval(runCachePrune, 24 * 60 * 60 * 1000);

  const worker = startAnalysisWorker();
  if (worker) console.log('Analysis job worker started.'); else console.warn('REDIS_URL not configured — analysis jobs will not run.');

  const shutdown = () => server.close(async () => {
    clearInterval(pruneInterval);
    await stopAnalysisWorker();
    if (redisClient?.isOpen) await redisClient.quit();
    process.exit(0);
  });
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

start().catch(error => { console.error('Server startup failed:', error); process.exit(1); });
