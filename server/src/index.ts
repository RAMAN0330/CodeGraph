import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Client } from 'pg';
import mysql from 'mysql2/promise';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';

dotenv.config();
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set. Using insecure dev default.');
}

const app = express();
app.set('trust proxy', 1);
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 24 * 60 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GitHubStrategy(
  {
    clientID: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:5000/auth/github/callback',
    scope: ['user', 'repo'],
  },
  (_accessToken: string, _refreshToken: string, profile: any, done: Function) => {
    done(null, {
      login: profile.username,
      avatar_url: profile.photos?.[0]?.value ?? '',
      token: _accessToken,
    });
  }
));

passport.serializeUser((user: any, done) => done(null, user));
passport.deserializeUser((user: any, done) => done(null, user));

const PORT = process.env.PORT || 5000;

// Shared schema type
interface SchemaColumn { name: string; type: string; nullable: boolean; isPrimary: boolean; }
interface SchemaFK { column: string; referencedTable: string; referencedColumn: string; }
interface SchemaTable { name: string; columns: SchemaColumn[]; foreignKeys: SchemaFK[]; }

// --- PostgreSQL ---
app.post('/api/db/connect/postgres', async (req, res) => {
  const { host, port, database, user, password } = req.body;
  const client = new Client({ host, port: parseInt(port, 10) || 5432, database, user, password, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();

    const tableResult = await client.query<{table_name:string}>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`);

    const tables: SchemaTable[] = await Promise.all(tableResult.rows.map(async ({ table_name }) => {
      const [colRes, pkRes, fkRes] = await Promise.all([
        client.query<{column_name:string; data_type:string; is_nullable:string}>(`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1
          ORDER BY ordinal_position`, [table_name]),
        client.query<{column_name:string}>(`
          SELECT kcu.column_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema='public' AND tc.table_name=$1`, [table_name]),
        client.query<{column_name:string; foreign_table:string; foreign_column:string}>(`
          SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name=$1`, [table_name]),
      ]);
      const pks = new Set(pkRes.rows.map(r => r.column_name));
      return {
        name: table_name,
        columns: colRes.rows.map(r => ({ name: r.column_name, type: r.data_type, nullable: r.is_nullable === 'YES', isPrimary: pks.has(r.column_name) })),
        foreignKeys: fkRes.rows.map(r => ({ column: r.column_name, referencedTable: r.foreign_table, referencedColumn: r.foreign_column })),
      };
    }));

    await client.end();
    res.json({ success: true, schema: { tables } });
  } catch (error: any) {
    try { await client.end(); } catch {}
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- MySQL ---
app.post('/api/db/connect/mysql', async (req, res) => {
  const { host, port, database, user, password } = req.body;
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    conn = await mysql.createConnection({ host, port: parseInt(port, 10) || 3306, database, user, password, connectTimeout: 8000 });

    const [tableRows]: any = await conn.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [database]);

    const tables: SchemaTable[] = await Promise.all((tableRows as any[]).map(async (row: any) => {
      const tbl = row.TABLE_NAME;
      const [colRows]: any = await conn!.execute(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
        [database, tbl]);
      const [fkRows]: any = await conn!.execute(
        `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [database, tbl]);
      return {
        name: tbl,
        columns: (colRows as any[]).map((r: any) => ({ name: r.COLUMN_NAME, type: r.COLUMN_TYPE, nullable: r.IS_NULLABLE === 'YES', isPrimary: r.COLUMN_KEY === 'PRI' })),
        foreignKeys: (fkRows as any[]).map((r: any) => ({ column: r.COLUMN_NAME, referencedTable: r.REFERENCED_TABLE_NAME, referencedColumn: r.REFERENCED_COLUMN_NAME })),
      };
    }));

    await conn.end();
    res.json({ success: true, schema: { tables } });
  } catch (error: any) {
    try { if (conn) await conn.end(); } catch {}
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- SQL Dump Parser (client uploads .sql file text) ---
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
      const lines = body.split('\n');
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
app.post('/api/github/repo', async (req, res) => {
  const { owner, repo, token } = req.body;
  try {
    const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'CodeFlow-App' };
    if (token && /^[A-Za-z0-9_\-.]+$/.test(String(token))) headers['Authorization'] = `token ${token}`;
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers });
    if (!response.ok) throw new Error(`GitHub API error: ${response.statusText}`);
    const data = await response.json();
    res.json({ success: true, tree: data.tree });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auth routes
app.get('/auth/github', passport.authenticate('github'));

app.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/?auth=failed` }),
  (_req: any, res: any) => {
    res.redirect(`${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/workspace`);
  }
);

app.get('/auth/me', (req: any, res: any) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.user);
});

app.get('/auth/logout', (req: any, res: any) => {
  req.logout(() => {
    req.session.destroy((err: any) => {
      if (err) console.error('Session destroy error:', err);
      res.json({ ok: true });
    });
  });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
