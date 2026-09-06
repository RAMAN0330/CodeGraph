import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Client } from 'pg';
import mysql from 'mysql2/promise';
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
import { fetchBlobContent, fetchFileContent, fetchLatestCommitSha, fetchRepositoryTree, fetchUserRepositories } from './services/githubService';
import { getCachedBlob, getCachedFile, getCachedTree, pruneStaleCacheEntries, saveBlobCache, saveFileCache, saveTreeCache, touchTreeCache } from './db/repoCache';
import { initSchema } from './db/pool';
import { UsernameTakenError, clearGithubConnection, createOrganizationWithAdmin, findUserById, findUserByUsername, setGithubConnection, toPublicUser, type UserRow } from './db/users';
import { addMember, createProject, createWorkspace, getDecryptedConnection, listProjects, listWorkspaces, removeMember, removeProject, removeWorkspace, updateDbConnection } from './db/projectStore';
import { getAnalysis } from './db/analysisStore';
import { createAlertRule, deleteAlertRule, listAlertRules } from './db/metricsSnapshots';
import { buildActivity, buildOverview, buildPerformance, buildQueries, buildReplication, buildSecurity, buildStorage } from './services/telemetry/orchestrate';
import { enqueueAnalysisJob, getAnalysisJobState, startAnalysisWorker, stopAnalysisWorker } from './queue/analysisQueue';

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
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.clientOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
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
      customHeaders: { 'User-Agent': 'GraphKeep' },
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

app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));

async function introspectPostgres(conn: { host: string; port: string | number; database: string; user: string; password: string; ssl?: boolean }): Promise<{ tables: SchemaTable[] }> {
  const client = new Client({ host: conn.host, port: parseInt(String(conn.port), 10) || 5432, database: conn.database, user: conn.user, password: conn.password, ssl: conn.ssl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();

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
  let connection: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    connection = await mysql.createConnection({ host, port: parseInt(String(port), 10) || 3306, database, user, password, ssl: ssl ? { rejectUnauthorized: false } : undefined, connectTimeout: 8000 });

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
app.post('/api/db/connect/postgres', async (req, res) => {
  try {
    const schema = await introspectPostgres(req.body);
    res.json({ success: true, schema });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- MySQL ---
app.post('/api/db/connect/mysql', async (req, res) => {
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

app.post('/api/db/parse-sql', (req, res) => {
  const { sql } = req.body as { sql: string };
  if (!sql) return res.status(400).json({ success: false, error: 'No SQL provided' });
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
app.post('/api/github/repo', async (req, res) => {
  const { owner, repo, token, branch } = req.body;
  if (!owner || !repo) return res.status(400).json({ success: false, error: 'owner and repo are required' });
  const cacheBranch = typeof branch === 'string' && branch ? branch : 'HEAD';
  try {
    const safeToken = token && /^[A-Za-z0-9_\-.]+$/.test(String(token)) ? String(token) : undefined;
    const cached = await getCachedTree(owner, repo, cacheBranch);
    if (cached && cached.fresh) return res.json({ success: true, tree: cached.tree, cached: true });
    const result = await fetchRepositoryTree(owner, repo, safeToken, cacheBranch, cached?.etag);
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
app.post('/api/github/file', async (req, res) => {
  const { owner, repo, path, branch, token, sha } = req.body;
  if (!owner || !repo || !path) return res.status(400).json({ success: false, error: 'owner, repo, and path are required' });
  try {
    const safeToken = token && /^[A-Za-z0-9_\-.]+$/.test(String(token)) ? String(token) : undefined;
    if (sha) {
      const cachedBlob = await getCachedBlob(owner, repo, sha);
      if (cachedBlob !== null) return res.json({ success: true, content: cachedBlob, cached: true });
      const content = await fetchBlobContent(owner, repo, sha, safeToken);
      if (content !== null) await saveBlobCache(owner, repo, sha, content);
      return res.json({ success: true, content, cached: false });
    }
    const cacheBranch = typeof branch === 'string' && branch ? branch : '';
    const cachedContent = await getCachedFile(owner, repo, cacheBranch, path);
    if (cachedContent !== null) return res.json({ success: true, content: cachedContent, cached: true });
    const content = await fetchFileContent(owner, repo, path, cacheBranch || undefined, safeToken);
    if (content !== null) await saveFileCache(owner, repo, cacheBranch, path, content);
    res.json({ success: true, content, cached: false });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Optional text-only enrichment for the deterministic client architecture graph.
app.post('/api/architecture/enrich', async (req, res) => {
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
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.openaiModel,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: 'Explain this repository architecture concisely. Preserve every supplied ID exactly. Return text updates only; do not invent components, paths, connections, or IDs.' }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ groups, nodes, edges }) }] },
        ],
        text: { format: { type: 'json_schema', name: 'architecture_enrichment', strict: true, schema } },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const result: any = await response.json();
    if (!response.ok) return res.status(502).json({ error: result?.error?.message || 'Explanation provider rejected the request.' });
    const outputText = result.output_text || result.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === 'output_text')?.text;
    if (!outputText) return res.status(502).json({ error: 'Explanation provider returned no structured output.' });
    const enrichment = JSON.parse(outputText);
    const safeGroups = Array.isArray(enrichment.groups) ? enrichment.groups.filter((item: any) => groupIds.has(item.id)).map((item: any) => ({ id: item.id, label: String(item.label || '').slice(0, 120), description: String(item.description || '').slice(0, 400) })) : [];
    const safeNodes = Array.isArray(enrichment.nodes) ? enrichment.nodes.filter((item: any) => nodeIds.has(item.id)).map((item: any) => ({ id: item.id, label: String(item.label || '').slice(0, 120), description: String(item.description || '').slice(0, 400) })) : [];
    return res.json({ summary: String(enrichment.summary || '').slice(0, 600), groups: safeGroups, nodes: safeNodes });
  } catch (error: any) {
    return res.status(502).json({ error: error?.name === 'TimeoutError' ? 'Explanation request timed out.' : 'Unable to generate the architecture explanation.' });
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

app.post('/auth/register', credentialsRateLimit, async (req, res, next) => {
  const organizationName = String(req.body?.organizationName ?? '').trim();
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!organizationName) return res.status(400).json({ error: 'Organization name is required.' });
  if (!usernamePattern.test(username)) return res.status(400).json({ error: 'Username must be 3-32 characters (letters, numbers, . _ -).' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createOrganizationWithAdmin(organizationName, username, passwordHash);
    loginSession(req, res, next, user, () => res.status(201).json(toPublicUser(user)));
  } catch (error) {
    if (error instanceof UsernameTakenError) return res.status(409).json({ error: error.message });
    next(error);
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

// Hand the connected GitHub token to the client so it can authenticate its own
// direct-to-GitHub API calls (repo scans, branch/commit browsing, etc).
app.get('/api/github/token', requireAuth, (req: any, res: any) => {
  if (!req.user.github_token) return res.status(409).json({ error: 'Connect a GitHub account before browsing repositories.' });
  res.json({ token: req.user.github_token });
});

// --- Projects / workspaces (server-backed, replacing client localStorage) ---
app.get('/api/projects', requireAuth, async (req: any, res: any) => {
  try {
    const [workspaces, projects] = await Promise.all([listWorkspaces(req.user.id), listProjects(req.user.id)]);
    res.json({ workspaces, projects });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workspaces', requireAuth, async (req: any, res: any) => {
  try {
    const workspace = await createWorkspace(req.user.id, String(req.body?.name ?? ''));
    res.status(201).json(workspace);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/workspaces/:id', requireAuth, async (req: any, res: any) => {
  try {
    await removeWorkspace(req.user.id, Number(req.params.id));
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', requireAuth, async (req: any, res: any) => {
  try {
    const projectType = req.body?.projectType === 'database' ? 'database' : 'codebase';
    const project = await createProject(req.user.id, {
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
    await removeProject(req.user.id, Number(req.params.id));
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/schema', requireAuth, async (req: any, res: any) => {
  try {
    const connection = await getDecryptedConnection(req.user.id, Number(req.params.id));
    const schema = connection.dbType === 'mysql' ? await introspectMysql(connection) : await introspectPostgres(connection);
    res.json({ success: true, schema });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/projects/:id/db-connection', requireAuth, async (req: any, res: any) => {
  try {
    const summary = await updateDbConnection(req.user.id, Number(req.params.id), req.body?.dbConnection);
    res.json(summary);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Database Dashboard telemetry (Postgres/MySQL projects only) ---
app.get('/api/projects/:id/db/overview', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(req.user.id, projectId);
    const data = await buildOverview(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/performance', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(req.user.id, projectId);
    const data = await buildPerformance(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/queries', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(req.user.id, projectId);
    const data = await buildQueries(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/storage', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(req.user.id, projectId);
    const data = await buildStorage(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/replication', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(req.user.id, projectId);
    const data = await buildReplication(projectId, connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/activity', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await getDecryptedConnection(req.user.id, projectId); // ownership check
    const data = await buildActivity(projectId);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/security', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    const connection = await getDecryptedConnection(req.user.id, projectId);
    const data = await buildSecurity(connection);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/projects/:id/db/alerts', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await getDecryptedConnection(req.user.id, projectId); // ownership check
    const rules = await listAlertRules(projectId);
    res.json({ success: true, data: rules });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/projects/:id/db/alerts', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await getDecryptedConnection(req.user.id, projectId); // ownership check
    const rule = await createAlertRule(projectId, {
      metric: String(req.body?.metric ?? ''),
      condition: req.body?.condition === 'lt' ? 'lt' : 'gt',
      threshold: Number(req.body?.threshold),
      forMinutes: Number(req.body?.forMinutes) || 5,
    });
    res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.delete('/api/projects/:id/db/alerts/:ruleId', requireAuth, async (req: any, res: any) => {
  try {
    const projectId = Number(req.params.id);
    await getDecryptedConnection(req.user.id, projectId); // ownership check
    await deleteAlertRule(projectId, Number(req.params.ruleId));
    res.status(204).end();
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/projects/:id/members', requireAuth, async (req: any, res: any) => {
  try {
    const member = await addMember(req.user.id, Number(req.params.id), String(req.body?.email ?? ''));
    res.status(201).json(member);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/projects/:id/members/:memberId', requireAuth, async (req: any, res: any) => {
  try {
    await removeMember(req.user.id, Number(req.params.id), Number(req.params.memberId));
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

// Checks freshness against the repo's current HEAD commit; auto-enqueues a
// job when stale or missing instead of ever computing the analysis inline.
app.get('/api/analysis/:owner/:repo', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  const branch = resolveAnalysisBranch(req);
  const token = req.user.github_token || undefined;
  try {
    const headSha = await fetchLatestCommitSha(owner, repo, branch === 'HEAD' ? undefined : branch, token);
    const stored = await getAnalysis(owner, repo, branch);
    if (headSha && stored && stored.commitSha === headSha) {
      return res.json({ status: 'ready', commitSha: stored.commitSha, data: stored.data, analyzedAt: stored.analyzedAt });
    }
    // Don't auto-retry a job that already failed — that would silently loop
    // forever on a poll every couple seconds. Surface it and let the user
    // retry explicitly via the refresh (Rescan) endpoint.
    const existingState = await getAnalysisJobState(owner, repo, branch);
    if (existingState === 'failed') return res.status(202).json({ status: 'failed' });
    await enqueueAnalysisJob({ owner, repo, branch, commitSha: headSha || stored?.commitSha || 'unknown', token });
    const state = await getAnalysisJobState(owner, repo, branch);
    res.status(202).json({ status: state === 'active' ? 'active' : 'queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Manual "Rescan" — force a re-analysis regardless of freshness.
app.post('/api/analysis/:owner/:repo/refresh', requireAuth, async (req: any, res: any) => {
  const { owner, repo } = req.params;
  const branch = resolveAnalysisBranch(req);
  const token = req.user.github_token || undefined;
  try {
    const headSha = await fetchLatestCommitSha(owner, repo, branch === 'HEAD' ? undefined : branch, token);
    await enqueueAnalysisJob({ owner, repo, branch, commitSha: headSha || 'unknown', token });
    const state = await getAnalysisJobState(owner, repo, branch);
    res.status(202).json({ status: state === 'active' ? 'active' : state === 'failed' ? 'failed' : 'queued' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy → FastAPI on port 8000
const proxyToFastAPI = createJsonProxy(env.fastApiUrl);
app.all('/api/analyze', proxyToFastAPI);
app.all('/api/tasks/:taskId', proxyToFastAPI);

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
