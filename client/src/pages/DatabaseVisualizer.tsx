import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Upload, ArrowLeft, Play, LayoutDashboard, AlertCircle, Loader, FolderOpen, GitBranch, ChevronRight, Check, FileCode, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ERDiagramGraph from '../components/ERDiagramGraph';
import { GitHub } from '../lib/github';
import { dbSchemaToFlowSchema, parseDjangoModels } from '../lib/dbParser';

const API = 'http://localhost:5000';

// ── Design tokens ────────────────────────────────────────────────────────────
const GG = {
  bg: '#07090c',
  bg1: '#0b0e13',
  bg2: '#10141b',
  panel: '#0d1117',
  line: 'rgba(255,255,255,0.06)',
  lineStrong: 'rgba(255,255,255,0.12)',
  fg: '#e6edf3',
  fg2: '#b1bac4',
  fg3: '#7d8590',
  fg4: '#4b5563',
  accent: '#3fb950',
  info: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#76e4f7',
  mono: "'JetBrains Mono', monospace" as const,
  sans: "'Inter', sans-serif" as const,
};

interface SchemaColumn { name: string; type: string; nullable: boolean; isPrimary: boolean; }
interface SchemaFK { column: string; referencedTable: string; referencedColumn: string; }
interface SchemaTable { name: string; columns: SchemaColumn[]; foreignKeys: SchemaFK[]; app?: string; file?: string; modelName?: string; dbTableName?: string; }
interface Schema { tables: SchemaTable[]; }

interface AppFolder { path: string; label: string; filePaths: string[]; }

// Convert DbTable[] from dbParser to SchemaTable[] for ERDiagramGraph
function dbTablesToSchema(tables: ReturnType<typeof parseDjangoModels>): SchemaTable[] {
  return dbSchemaToFlowSchema({ tables, relations: tables.flatMap(t => t.relations) }).tables;
}

// ── Source tile definitions ──────────────────────────────────────────────────
const SOURCES = [
  { id: 'postgres',  label: 'PostgreSQL',  icon: '🐘', connectType: 'credentials' as const, dbType: 'postgres'  as const },
  { id: 'mysql',     label: 'MySQL',       icon: '🐬', connectType: 'credentials' as const, dbType: 'mysql'     as const },
  { id: 'sqlite',    label: 'SQLite',      icon: '🗃',  connectType: 'file'        as const, dbType: null },
  { id: 'mongo',     label: 'MongoDB',     icon: '🍃', connectType: 'credentials' as const, dbType: 'postgres'  as const },
  { id: 'sqldump',   label: 'SQL Dump',    icon: '📄', connectType: 'file'        as const, dbType: null },
  { id: 'repo',      label: 'From Repo',   icon: '🗂',  connectType: 'repo'        as const, dbType: null },
  { id: 'csv',       label: 'CSV',         icon: '📊', connectType: 'file'        as const, dbType: null },
  { id: 'snowflake', label: 'Snowflake',   icon: '❄️', connectType: 'credentials' as const, dbType: 'postgres'  as const },
];

export default function DatabaseVisualizer() {
  const navigate = useNavigate();
  const [connectType, setConnectType] = useState<'credentials' | 'file' | 'repo'>('credentials');
  const [dbType, setDbType] = useState<'postgres' | 'mysql'>('postgres');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [schema, setSchema] = useState<Schema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sqlFileName, setSqlFileName] = useState<string>('');
  const [graphSearch, setGraphSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState('all');
  const [focusedTable, setFocusedTable] = useState<string | null>(null);
  const [showMigrationEditor, setShowMigrationEditor] = useState(false);
  const [migrationApp, setMigrationApp] = useState('all');
  const [migrationName, setMigrationName] = useState('auto_model_update');
  const [migrationDraft, setMigrationDraft] = useState('');
  const [sslEnabled, setSslEnabled] = useState(false);
  const [readOnly, setReadOnly] = useState(true);
  const [activeSourceId, setActiveSourceId] = useState<string>('postgres');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Repo tab state
  const [repoUrl, setRepoUrl] = useState('');
  const [repoToken, setRepoToken] = useState('');
  const [repoStatus, setRepoStatus] = useState('');
  const [appFolders, setAppFolders] = useState<AppFolder[]>([]);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [repoStep, setRepoStep] = useState<'input' | 'select' | 'done'>('input');
  const localFilesRef = useRef<Map<string, string>>(new Map());
  const repoOwnerRef = useRef('');
  const repoNameRef = useRef('');
  const repoBranchRef = useRef('main');

  // Blinking cursor effect
  useEffect(() => {
    const t = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(t);
  }, []);

  const fkCount = schema?.tables?.reduce((s, t) => s + t.foreignKeys.length, 0) ?? 0;
  const appOptions = useMemo(() => {
    const apps = new Set<string>();
    schema?.tables?.forEach(t => { const a = (t.app ?? '').trim(); if (a) apps.add(a); });
    return Array.from(apps).sort();
  }, [schema]);
  const visibleSchema = useMemo(() => {
    if (!schema) return null;
    const q = graphSearch.trim().toLowerCase();
    const tables = (schema.tables ?? []).filter(t => {
      if (selectedApp !== 'all') {
        const tApp = (t.app ?? '').trim();
        if (tApp !== selectedApp) return false;
      }
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
    });
    return { tables };
  }, [schema, graphSearch, selectedApp]);
  const migrationApps = useMemo(() => {
    const apps = new Set<string>();
    schema?.tables?.forEach(t => { if (t.app) apps.add(t.app); });
    return Array.from(apps).sort();
  }, [schema]);
  const migrationSource = useMemo(() => {
    if (!schema) return '';
    return generateDjangoMigration(schema, migrationApp, migrationName);
  }, [schema, migrationApp, migrationName]);

  useEffect(() => {
    if (showMigrationEditor) setMigrationDraft(migrationSource);
  }, [showMigrationEditor, migrationSource]);

  // Connection string preview
  const connString = useMemo(() => {
    if (connectType !== 'credentials') return '';
    const proto = dbType === 'postgres' ? 'postgresql' : 'mysql';
    const u = user || '<user>';
    const d = database || '<database>';
    return `${proto}://${u}:••••@${host}:${port}/${d}`;
  }, [connectType, dbType, user, database, host, port]);

  async function connect() {
    setError(null);
    setLoading(true);
    try {
      const endpoint = dbType === 'postgres' ? '/api/db/connect/postgres' : '/api/db/connect/mysql';
      const res = await fetch(API + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, database, user, password }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Connection failed');
      setSchema(data.schema);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function parseSqlFile(file: File) {
    setError(null);
    setLoading(true);
    setSqlFileName(file.name);
    try {
      const sql = await file.text();
      const res = await fetch(API + '/api/db/parse-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to parse SQL');
      if (!data.schema?.tables?.length) throw new Error('No CREATE TABLE statements found in file');
      setSchema(data.schema);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseSqlFile(file);
  }

  async function scanGitHubRepo() {
    setError(null);
    setLoading(true);
    setRepoStatus('Connecting to GitHub…');
    try {
      const cleaned = repoUrl.replace(/https?:\/\/github\.com\//, '').replace(/\.git$/, '').trim();
      const parts = cleaned.split('/');
      if (parts.length < 2) throw new Error('Enter a valid GitHub repo (owner/repo or full URL)');
      const [owner, repo] = parts;
      repoOwnerRef.current = owner;
      repoNameRef.current = repo;
      if (repoToken) (GitHub as any).token = repoToken;

      setRepoStatus('Fetching file tree…');
      const result = await (GitHub as any).scan(owner, repo, (msg: string) => setRepoStatus(msg), null);
      repoBranchRef.current = result.branch || 'main';

      const modelFiles: string[] = result.files
        .filter((f: any) => f.name === 'models.py' || (f.path || '').toLowerCase().includes('/models/') && (f.name || '').endsWith('.py') && !(f.name || '').startsWith('test'))
        .map((f: any) => f.path);

      if (!modelFiles.length) throw new Error('No models.py files found in this repository');

      const folderMap = new Map<string, string[]>();
      for (const fp of modelFiles) {
        const folder = fp.includes('/') ? fp.substring(0, fp.lastIndexOf('/')) : '(root)';
        if (!folderMap.has(folder)) folderMap.set(folder, []);
        folderMap.get(folder)!.push(fp);
      }

      const folders: AppFolder[] = Array.from(folderMap.entries()).map(([path, filePaths]) => ({
        path,
        label: path === '(root)' ? '(root)' : path.split('/').pop() || path,
        filePaths,
      }));

      localFilesRef.current.clear();
      setAppFolders(folders);
      setSelectedApps(new Set(folders.map(f => f.path)));
      setRepoStep('select');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRepoStatus('');
    }
  }

  async function scanLocalFolder() {
    setError(null);
    setLoading(true);
    setRepoStatus('Opening folder picker…');
    try {
      // @ts-ignore
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      const fileMap = new Map<string, string>();
      setRepoStatus('Scanning for models.py…');

      async function walk(handle: any, prefix: string) {
        for await (const [name, entry] of handle.entries()) {
          const path = prefix ? `${prefix}/${name}` : name;
          if (entry.kind === 'directory') {
            if (!['node_modules', '.git', '__pycache__', 'venv', '.venv', 'env', 'dist', 'build'].includes(name)) {
              await walk(entry, path);
            }
          } else if (name === 'models.py' || (path.toLowerCase().includes('/models/') && name.endsWith('.py') && !name.startsWith('test'))) {
            const file = await entry.getFile();
            const text = await file.text();
            fileMap.set(path, text);
          }
        }
      }
      await walk(dirHandle, '');

      if (!fileMap.size) throw new Error('No models.py files found in this folder');

      localFilesRef.current = fileMap;
      repoOwnerRef.current = '';
      repoNameRef.current = dirHandle.name;

      const folderMap = new Map<string, string[]>();
      for (const fp of fileMap.keys()) {
        const folder = fp.includes('/') ? fp.substring(0, fp.lastIndexOf('/')) : '(root)';
        if (!folderMap.has(folder)) folderMap.set(folder, []);
        folderMap.get(folder)!.push(fp);
      }

      const folders: AppFolder[] = Array.from(folderMap.entries()).map(([path, filePaths]) => ({
        path,
        label: path === '(root)' ? '(root)' : path.split('/').pop() || path,
        filePaths,
      }));

      setAppFolders(folders);
      setSelectedApps(new Set(folders.map(f => f.path)));
      setRepoStep('select');
    } catch (e: any) {
      if (e?.name === 'AbortError') { /* user cancelled */ }
      else setError(e.message);
    } finally {
      setLoading(false);
      setRepoStatus('');
    }
  }

  async function parseSelectedApps() {
    setError(null);
    setLoading(true);
    setRepoStatus('Parsing models…');
    try {
      const selected = appFolders.filter(f => selectedApps.has(f.path));
      const allPaths = selected.flatMap(f => f.filePaths);
      const contents: { path: string; content: string }[] = [];

      if (repoOwnerRef.current) {
        await Promise.all(allPaths.map(async (fp) => {
          const text = await (GitHub as any).getFile(repoOwnerRef.current, repoNameRef.current, fp, repoBranchRef.current);
          if (text) contents.push({ path: fp, content: text });
        }));
      } else {
        for (const fp of allPaths) {
          const text = localFilesRef.current.get(fp);
          if (text) contents.push({ path: fp, content: text });
        }
      }

      if (!contents.length) throw new Error('Could not read any models.py content');

      const allTables: ReturnType<typeof parseDjangoModels> = [];
      for (const { path, content } of contents) {
        const tables = parseDjangoModels(content, path);
        allTables.push(...tables);
      }

      if (!allTables.length) throw new Error('No Django models found in the selected apps. Make sure the files contain classes extending models.Model.');

      const seen = new Map<string, typeof allTables[0]>();
      allTables.forEach(t => seen.set(t.name.toLowerCase(), t));

      setSchema({ tables: dbTablesToSchema(Array.from(seen.values())) });
      setRepoStep('done');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRepoStatus('');
    }
  }

  function toggleApp(path: string) {
    setSelectedApps(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function resetRepo() {
    setRepoStep('input');
    setAppFolders([]);
    setSelectedApps(new Set());
    setError(null);
    setRepoStatus('');
    localFilesRef.current.clear();
    setGraphSearch('');
    setSelectedApp('all');
    setFocusedTable(null);
  }

  // ── GG shared input style ────────────────────────────────────────────────
  const ggInput: React.CSSProperties = {
    width: '100%',
    height: 38,
    padding: '0 12px',
    background: GG.bg1,
    border: `1px solid ${GG.lineStrong}`,
    borderRadius: 8,
    color: GG.fg,
    fontFamily: GG.mono,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };

  const ggLabel: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    color: GG.fg3,
    fontSize: 11,
    fontFamily: GG.mono,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: GG.bg, color: GG.fg, fontFamily: GG.sans, display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: `${GG.panel}cc`,
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${GG.lineStrong}`,
        padding: '0 24px',
        height: 48,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontFamily: GG.mono, fontSize: 13, color: GG.accent, fontWeight: 700 }}>gitgraph/0.4.2</span>
        <span style={{ color: GG.fg4, fontSize: 13, fontFamily: GG.mono }}>›</span>
        <span style={{ fontFamily: GG.mono, fontSize: 13, color: GG.fg3 }}>workspace</span>
        <span style={{ color: GG.fg4, fontSize: 13, fontFamily: GG.mono }}>›</span>
        <span style={{ fontFamily: GG.mono, fontSize: 13, color: GG.info }}>db-visualizer</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {schema && migrationApps.length > 0 && (
            <button
              onClick={() => { setMigrationApp(selectedApp !== 'all' ? selectedApp : migrationApps[0] || 'all'); setShowMigrationEditor(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'transparent', border: `1px solid ${GG.lineStrong}`, borderRadius: 6, color: GG.fg2, fontSize: 12, fontFamily: GG.mono, cursor: 'pointer' }}
            >
              <FileCode size={14} /> Migration
            </button>
          )}
          {schema && (
            <button
              onClick={() => { setSchema(null); setError(null); setSqlFileName(''); resetRepo(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'transparent', border: `1px solid ${GG.lineStrong}`, borderRadius: 6, color: GG.fg2, fontSize: 12, fontFamily: GG.mono, cursor: 'pointer' }}
            >
              <LayoutDashboard size={14} /> New Connection
            </button>
          )}
        </div>
      </nav>

      {/* ── Page header ── */}
      <div style={{ padding: '32px 32px 0', maxWidth: 1400, width: '100%', margin: '0 auto', boxSizing: 'border-box' as const }}>
        {/* breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <button
            onClick={() => navigate('/workspace')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: GG.fg3, fontFamily: GG.mono, fontSize: 12, cursor: 'pointer', padding: 0 }}
          >
            <ArrowLeft size={14} /> workspace
          </button>
          <span style={{ color: GG.fg4, fontFamily: GG.mono, fontSize: 12 }}>›</span>
          <span style={{ color: GG.fg2, fontFamily: GG.mono, fontSize: 12 }}>database_visualizer</span>
        </div>

        {/* h1 */}
        <h1 style={{ fontFamily: GG.mono, fontSize: 22, fontWeight: 700, color: GG.fg, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
          <span style={{ color: GG.fg3 }}>›</span> connect_database
          <span style={{ opacity: cursorVisible ? 1 : 0, color: GG.accent, marginLeft: 3 }}>█</span>
        </h1>
        <p style={{ fontFamily: GG.sans, fontSize: 14, color: GG.fg3, margin: '0 0 6px' }}>
          Pick a data source, configure credentials, and explore your schema as an interactive ER diagram.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GG.accent, display: 'inline-block', boxShadow: `0 0 6px ${GG.accent}` }} />
          <span style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg3 }}>
            tunnel ready · {schema ? schema.tables.length : 0} connection{schema ? 's' : ''} cached
          </span>
        </div>
      </div>

      {/* ── 3-column card (pre-schema) ── */}
      {!schema ? (
        <div style={{ flex: 1, padding: '0 32px 32px', maxWidth: 1400, width: '100%', margin: '0 auto', boxSizing: 'border-box' as const }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr 360px',
            gap: 1,
            background: GG.lineStrong,
            borderRadius: 12,
            overflow: 'hidden',
            border: `1px solid ${GG.lineStrong}`,
          }}>

            {/* ── Left: Sources ── */}
            <div style={{ background: GG.panel, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Data Sources
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {SOURCES.map(src => {
                  const active = activeSourceId === src.id;
                  return (
                    <button
                      key={src.id}
                      onClick={() => {
                        setActiveSourceId(src.id);
                        setConnectType(src.connectType);
                        if (src.dbType) setDbType(src.dbType);
                        if (src.dbType === 'postgres') setPort('5432');
                        if (src.dbType === 'mysql') setPort('3306');
                        setError(null);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px',
                        background: active ? `${GG.accent}18` : 'transparent',
                        border: `1px solid ${active ? GG.accent + '44' : 'transparent'}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: 16, lineHeight: 1 }}>{src.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: GG.sans, fontSize: 13, color: active ? GG.accent : GG.fg2, fontWeight: active ? 600 : 400 }}>{src.label}</div>
                      </div>
                      {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GG.accent, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>

              {/* Recent section */}
              <div style={{ marginTop: 8, borderTop: `1px solid ${GG.line}`, paddingTop: 16 }}>
                <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                  Recent
                </div>
                <div style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg4, fontStyle: 'italic' }}>
                  No recent connections
                </div>
              </div>
            </div>

            {/* ── Middle: Form ── */}
            <div style={{ background: GG.bg2, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Form header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>
                  {SOURCES.find(s => s.id === activeSourceId)?.icon ?? '🔌'}
                </span>
                <div>
                  <div style={{ fontFamily: GG.mono, fontSize: 14, color: GG.fg, fontWeight: 700 }}>
                    connect to {SOURCES.find(s => s.id === activeSourceId)?.label?.toLowerCase() ?? connectType}
                  </div>
                  <div style={{ fontFamily: GG.sans, fontSize: 12, color: GG.fg3, marginTop: 2 }}>
                    {connectType === 'credentials' ? 'Enter your database credentials below' : connectType === 'file' ? 'Upload a SQL dump file' : 'Scan a repository for Django models'}
                  </div>
                </div>
              </div>

              {/* ── Credentials form ── */}
              {connectType === 'credentials' && (
                <motion.div key="creds" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* DB type pills */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['postgres', 'mysql'] as const).map(t => (
                      <button key={t} onClick={() => { setDbType(t); setPort(t === 'postgres' ? '5432' : '3306'); }} style={{
                        flex: 1, padding: '7px 0',
                        background: dbType === t ? `${GG.info}18` : GG.bg1,
                        border: `1px solid ${dbType === t ? GG.info + '55' : GG.lineStrong}`,
                        borderRadius: 8, color: dbType === t ? GG.info : GG.fg3,
                        fontFamily: GG.mono, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}>
                        {t === 'postgres' ? '🐘 PostgreSQL' : '🐬 MySQL'}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 2 }}>
                      <label style={ggLabel}>Host</label>
                      <input style={ggInput} value={host} onChange={e => setHost(e.target.value)} placeholder="localhost" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={ggLabel}>Port</label>
                      <input style={ggInput} value={port} onChange={e => setPort(e.target.value)} placeholder={dbType === 'postgres' ? '5432' : '3306'} />
                    </div>
                  </div>

                  <div>
                    <label style={ggLabel}>Database</label>
                    <input style={ggInput} value={database} onChange={e => setDatabase(e.target.value)} placeholder="my_database" />
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={ggLabel}>Username</label>
                      <input style={ggInput} value={user} onChange={e => setUser(e.target.value)} placeholder={dbType === 'postgres' ? 'postgres' : 'root'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={ggLabel}>Password</label>
                      <input type="password" style={ggInput} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                  </div>

                  {/* Toggles */}
                  <div style={{ display: 'flex', gap: 20 }}>
                    <Toggle label="SSL" value={sslEnabled} onChange={setSslEnabled} />
                    <Toggle label="Read-only" value={readOnly} onChange={setReadOnly} />
                  </div>

                  {/* Connection string preview */}
                  {connString && (
                    <div style={{
                      background: GG.bg1, border: `1px solid ${GG.line}`,
                      borderRadius: 8, padding: '8px 12px',
                      fontFamily: GG.mono, fontSize: 11, color: GG.fg3,
                      wordBreak: 'break-all',
                    }}>
                      <span style={{ color: GG.fg4, marginRight: 6 }}>$</span>{connString}
                    </div>
                  )}

                  {error && <GGErrorBanner msg={error} />}

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button
                      onClick={connect}
                      disabled={loading || !database}
                      style={{
                        flex: 1, height: 40,
                        background: loading || !database ? GG.fg4 + '33' : GG.accent,
                        border: 'none', borderRadius: 8,
                        color: loading || !database ? GG.fg4 : GG.bg,
                        fontFamily: GG.mono, fontSize: 13, fontWeight: 700,
                        cursor: loading || !database ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'all 0.15s',
                      }}
                    >
                      {loading ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> connecting…</> : <><Play size={14} /> connect & analyze ↵</>}
                    </button>
                    <button
                      onClick={() => { /* test only */ connect(); }}
                      disabled={loading || !database}
                      style={{
                        padding: '0 18px', height: 40,
                        background: 'transparent',
                        border: `1px solid ${GG.lineStrong}`,
                        borderRadius: 8, color: GG.fg3,
                        fontFamily: GG.mono, fontSize: 12, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      test connection
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── File / SQL Dump form ── */}
              {connectType === 'file' && (
                <motion.div key="file" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      padding: '3rem 2rem',
                      border: `2px dashed ${error ? '#f8514944' : GG.lineStrong}`,
                      borderRadius: 12,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: GG.bg1,
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleFileDrop}
                  >
                    <Upload size={36} color={GG.fg4} />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: GG.fg, margin: 0, fontFamily: GG.mono, fontSize: 13, fontWeight: 600 }}>
                        {sqlFileName || 'drop your .sql file here'}
                      </p>
                      <p style={{ color: GG.fg3, margin: '6px 0 0', fontSize: 12, fontFamily: GG.sans }}>
                        or click to browse — supports PostgreSQL & MySQL dumps
                      </p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".sql,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) parseSqlFile(f); }} />
                  </div>
                  {error && <GGErrorBanner msg={error} />}
                  {loading && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, color: GG.fg3, fontSize: 12, fontFamily: GG.mono }}>
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> parsing SQL…
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Repo form ── */}
              {connectType === 'repo' && (
                <motion.div key="repo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {repoStep === 'input' && (
                    <>
                      <p style={{ margin: 0, color: GG.fg3, fontSize: 13, lineHeight: 1.6, fontFamily: GG.sans }}>
                        Scan a GitHub repo or local folder for Django{' '}
                        <code style={{ background: GG.bg1, padding: '2px 6px', borderRadius: 4, fontFamily: GG.mono, fontSize: 12, color: GG.cyan }}>models.py</code>{' '}
                        files, then pick which apps to visualize.
                      </p>
                      <div>
                        <label style={ggLabel}>GitHub Repository URL</label>
                        <input style={ggInput} value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="owner/repo or https://github.com/owner/repo" />
                      </div>
                      <div>
                        <label style={ggLabel}>
                          Personal Access Token{' '}
                          <span style={{ color: GG.fg4, textTransform: 'none', letterSpacing: 0 }}>(optional, for private repos)</span>
                        </label>
                        <input type="password" style={ggInput} value={repoToken} onChange={e => setRepoToken(e.target.value)} placeholder="ghp_..." />
                      </div>
                      {repoStatus && (
                        <div style={{ color: GG.fg3, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: GG.mono }}>
                          <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> {repoStatus}
                        </div>
                      )}
                      {error && <GGErrorBanner msg={error} />}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={scanGitHubRepo}
                          disabled={loading || !repoUrl.trim()}
                          style={{
                            flex: 1, height: 40,
                            background: loading || !repoUrl.trim() ? GG.fg4 + '22' : GG.accent,
                            border: 'none', borderRadius: 8,
                            color: loading || !repoUrl.trim() ? GG.fg4 : GG.bg,
                            fontFamily: GG.mono, fontSize: 12, fontWeight: 700,
                            cursor: loading || !repoUrl.trim() ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          }}
                        >
                          {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> scanning…</> : <><GitBranch size={14} /> Scan GitHub Repo</>}
                        </button>
                        <button
                          onClick={scanLocalFolder}
                          disabled={loading}
                          style={{
                            flex: 1, height: 40,
                            background: 'transparent',
                            border: `1px solid ${GG.lineStrong}`,
                            borderRadius: 8, color: GG.fg2,
                            fontFamily: GG.mono, fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          }}
                        >
                          <FolderOpen size={14} /> Local Folder
                        </button>
                      </div>
                    </>
                  )}

                  {repoStep === 'select' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: GG.fg3, fontFamily: GG.mono }}>
                          {appFolders.length} app{appFolders.length !== 1 ? 's' : ''} found — select which to visualize
                        </span>
                        <button onClick={resetRepo} style={{ background: 'none', border: 'none', color: GG.fg3, cursor: 'pointer', fontSize: 12, fontFamily: GG.mono }}>← back</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                        {appFolders.map(app => {
                          const sel = selectedApps.has(app.path);
                          return (
                            <button key={app.path} onClick={() => toggleApp(app.path)} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 12px',
                              background: sel ? `${GG.magenta}14` : GG.bg1,
                              border: `1px solid ${sel ? GG.magenta + '44' : GG.lineStrong}`,
                              borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                            }}>
                              <div style={{
                                width: 16, height: 16, borderRadius: 4,
                                border: `2px solid ${sel ? GG.magenta : GG.fg4}`,
                                background: sel ? GG.magenta : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}>
                                {sel && <Check size={10} color={GG.bg} strokeWidth={3} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: sel ? GG.magenta : GG.fg, fontWeight: 600, fontSize: 13, fontFamily: GG.mono }}>{app.label}</div>
                                <div style={{ color: GG.fg4, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: GG.mono }}>{app.path}</div>
                              </div>
                              <span style={{ color: GG.fg4, fontSize: 11, flexShrink: 0, fontFamily: GG.mono }}>{app.filePaths.length}f</span>
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => setSelectedApps(new Set(appFolders.map(f => f.path)))} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${GG.lineStrong}`, borderRadius: 6, color: GG.fg3, fontSize: 11, fontFamily: GG.mono, cursor: 'pointer' }}>all</button>
                        <button onClick={() => setSelectedApps(new Set())} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${GG.lineStrong}`, borderRadius: 6, color: GG.fg3, fontSize: 11, fontFamily: GG.mono, cursor: 'pointer' }}>none</button>
                      </div>
                      {repoStatus && (
                        <div style={{ color: GG.fg3, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, fontFamily: GG.mono }}>
                          <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> {repoStatus}
                        </div>
                      )}
                      {error && <GGErrorBanner msg={error} />}
                      <button
                        onClick={parseSelectedApps}
                        disabled={loading || selectedApps.size === 0}
                        style={{
                          height: 40,
                          background: loading || selectedApps.size === 0 ? GG.fg4 + '22' : GG.accent,
                          border: 'none', borderRadius: 8,
                          color: loading || selectedApps.size === 0 ? GG.fg4 : GG.bg,
                          fontFamily: GG.mono, fontSize: 12, fontWeight: 700,
                          cursor: loading || selectedApps.size === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                      >
                        {loading ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> parsing…</> : <><ChevronRight size={14} /> Visualize {selectedApps.size} app{selectedApps.size !== 1 ? 's' : ''}</>}
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </div>

            {/* ── Right: Preview ── */}
            <div style={{ background: GG.panel, padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Schema Preview
              </div>

              {/* Mini static SVG preview */}
              <div style={{ background: GG.bg2, borderRadius: 10, border: `1px solid ${GG.line}`, padding: '14px', overflow: 'hidden' }}>
                <MiniSchemaPreview />
              </div>

              {/* What we read checklist */}
              <div style={{ background: GG.bg2, borderRadius: 8, border: `1px solid ${GG.line}`, padding: '12px 14px' }}>
                <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  What we read
                </div>
                {[
                  { label: 'table metadata', ok: true },
                  { label: 'foreign keys', ok: true },
                  { label: 'view definitions', ok: true },
                  { label: 'row data', ok: false },
                  { label: 'stored procedures', ok: true },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: GG.mono, fontSize: 12, color: item.ok ? GG.accent : GG.fg4 }}>
                      {item.ok ? '✓' : '✗'}
                    </span>
                    <span style={{
                      fontFamily: GG.mono, fontSize: 12,
                      color: item.ok ? GG.fg2 : GG.fg4,
                      textDecoration: item.ok ? 'none' : 'line-through',
                    }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Security info */}
              <div style={{
                background: `${GG.info}0d`,
                border: `1px solid ${GG.info}33`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.info, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Security
                </div>
                <p style={{ margin: 0, fontFamily: GG.sans, fontSize: 11, color: GG.fg3, lineHeight: 1.6 }}>
                  Credentials are never stored. Connections run server-side over a local tunnel. Schema metadata only — no row data is read.
                </p>
              </div>
            </div>
          </div>

          {/* ── Keyboard hints bar ── */}
          <div style={{
            marginTop: 12, display: 'flex', gap: 20, alignItems: 'center',
            padding: '8px 16px',
            background: GG.bg1, borderRadius: 8, border: `1px solid ${GG.line}`,
          }}>
            {[
              { key: 'tab', desc: 'next field' },
              { key: '⌘↵', desc: 'connect' },
              { key: '⌘,', desc: 'settings' },
              { key: 'esc', desc: 'cancel' },
            ].map(h => (
              <span key={h.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: GG.mono, fontSize: 11, color: GG.fg4 }}>
                <kbd style={{ background: GG.bg2, border: `1px solid ${GG.lineStrong}`, borderRadius: 4, padding: '1px 6px', color: GG.fg3, fontSize: 10 }}>{h.key}</kbd>
                {h.desc}
              </span>
            ))}
          </div>
        </div>
      ) : (
        /* ── Schema loaded: full-screen ER diagram ── */
        <motion.div key="diagram" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, padding: '0 32px 32px', maxWidth: 1400, width: '100%', margin: '0 auto', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '0 0 260px' }}>
              <input
                value={graphSearch}
                onChange={e => { setGraphSearch(e.target.value); setFocusedTable(null); }}
                placeholder="search tables or columns…"
                style={{ ...ggInput, paddingLeft: 12, fontSize: 12 }}
              />
            </div>
            {appOptions.length > 0 && (
              <select
                value={selectedApp}
                onChange={e => { setSelectedApp(e.target.value); setFocusedTable(null); }}
                style={{ ...ggInput, width: 180, fontSize: 12 }}
              >
                <option value="all">all apps</option>
                {appOptions.map(app => <option key={app} value={app}>{app}</option>)}
              </select>
            )}
            <span style={{ fontFamily: GG.mono, fontSize: 11, color: GG.fg4 }}>
              {visibleSchema?.tables.length ?? 0} visible · {schema.tables.length} total · {fkCount} FK
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(visibleSchema?.tables || schema.tables).slice(0, 6).map(t => (
                <button
                  key={t.name}
                  onClick={() => setFocusedTable(prev => prev === t.name ? null : t.name)}
                  style={{
                    padding: '4px 10px',
                    background: focusedTable === t.name ? `${GG.accent}1a` : GG.bg1,
                    border: `1px solid ${focusedTable === t.name ? GG.accent + '55' : GG.lineStrong}`,
                    borderRadius: 6, fontSize: 11,
                    color: focusedTable === t.name ? GG.accent : GG.fg3,
                    fontFamily: GG.mono, cursor: 'pointer',
                  }}
                >
                  {t.name}
                </button>
              ))}
              {(visibleSchema?.tables.length || 0) > 6 && (
                <span style={{ padding: '4px 10px', color: GG.fg4, fontSize: 11, fontFamily: GG.mono }}>
                  +{(visibleSchema?.tables.length || 0) - 6} more
                </span>
              )}
            </div>
          </div>

          {/* ER Diagram panel */}
          <div style={{ flex: 1, background: GG.panel, borderRadius: 12, border: `1px solid ${GG.lineStrong}`, overflow: 'hidden', position: 'relative', minHeight: 600, height: 'calc(100vh - 220px)' }}>
            {/* Search bar above diagram */}
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8 }}>
              <input
                value={graphSearch}
                onChange={e => { setGraphSearch(e.target.value); setFocusedTable(null); }}
                placeholder="search schema…"
                style={{
                  ...ggInput,
                  width: 200,
                  height: 32,
                  fontSize: 11,
                  background: `${GG.bg}cc`,
                  backdropFilter: 'blur(8px)',
                }}
              />
            </div>
            <ERDiagramGraph schema={visibleSchema || schema} selectedTable={focusedTable} isRealSchema={true} />
          </div>

          {/* Keyboard hints bar */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', padding: '8px 16px', background: GG.bg1, borderRadius: 8, border: `1px solid ${GG.line}` }}>
            {[
              { key: 'tab', desc: 'next field' },
              { key: '⌘↵', desc: 'connect' },
              { key: '⌘,', desc: 'settings' },
              { key: 'esc', desc: 'cancel' },
            ].map(h => (
              <span key={h.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: GG.mono, fontSize: 11, color: GG.fg4 }}>
                <kbd style={{ background: GG.bg2, border: `1px solid ${GG.lineStrong}`, borderRadius: 4, padding: '1px 6px', color: GG.fg3, fontSize: 10 }}>{h.key}</kbd>
                {h.desc}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Migration editor modal ── */}
      {showMigrationEditor && schema && (
        <div
          onClick={() => setShowMigrationEditor(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 'min(980px, 94vw)', height: 'min(760px, 88vh)', background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 28px 90px rgba(0,0,0,0.6)' }}
          >
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${GG.lineStrong}`, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Wand2 size={17} color={GG.accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: GG.fg, fontWeight: 700, fontSize: 14, fontFamily: GG.mono }}>Django migration editor</div>
                <div style={{ color: GG.fg3, fontSize: 12, fontFamily: GG.sans }}>Drafted from the parsed model schema. Review it before running it in your Django project.</div>
              </div>
              <button onClick={() => setShowMigrationEditor(false)} style={{ background: 'none', border: 'none', color: GG.fg3, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${GG.lineStrong}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ color: GG.fg3, fontSize: 12, fontFamily: GG.mono }}>App</label>
              <select
                value={migrationApp}
                onChange={e => setMigrationApp(e.target.value)}
                style={{ ...ggInput, width: 180, height: 32, fontSize: 12 }}
              >
                <option value="all">All parsed apps</option>
                {migrationApps.map(app => <option key={app} value={app}>{app}</option>)}
              </select>
              <label style={{ color: GG.fg3, fontSize: 12, fontFamily: GG.mono }}>Name</label>
              <input
                value={migrationName}
                onChange={e => setMigrationName(e.target.value.replace(/[^\w]/g, '_'))}
                style={{ ...ggInput, width: 240, height: 32, fontSize: 12 }}
              />
              <code style={{ marginLeft: 'auto', color: GG.fg3, fontSize: 11, background: GG.bg2, padding: '4px 8px', borderRadius: 6, fontFamily: GG.mono }}>
                python manage.py makemigrations{migrationApp !== 'all' ? ` ${migrationApp}` : ''}
              </code>
            </div>
            <textarea
              value={migrationDraft}
              onChange={e => setMigrationDraft(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1, width: '100%', resize: 'none', border: 'none', outline: 'none',
                background: GG.bg, color: GG.accent,
                padding: '1rem', fontFamily: GG.mono, fontSize: 12,
                lineHeight: 1.55, boxSizing: 'border-box',
                whiteSpace: 'pre', overflowWrap: 'normal',
              }}
            />
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Toggle component ─────────────────────────────────────────────────────────
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}
    >
      <div style={{
        width: 32, height: 18, borderRadius: 9,
        background: value ? GG.accent : GG.fg4 + '55',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 12, height: 12, borderRadius: '50%',
          background: 'white',
          position: 'absolute', top: 3,
          left: value ? 17 : 3,
          transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontFamily: GG.mono, fontSize: 12, color: GG.fg3 }}>{label}</span>
    </button>
  );
}

// ── MiniSchemaPreview SVG ────────────────────────────────────────────────────
function MiniSchemaPreview() {
  const tables = [
    { x: 10,  y: 10,  w: 90, label: 'users',    color: GG.info,    cols: ['id', 'email', 'name'] },
    { x: 120, y: 10,  w: 90, label: 'posts',     color: GG.accent,  cols: ['id', 'user_id', 'title'] },
    { x: 10,  y: 110, w: 90, label: 'sessions',  color: GG.magenta, cols: ['id', 'user_id', 'token'] },
    { x: 120, y: 110, w: 90, label: 'tags',      color: GG.cyan,    cols: ['id', 'post_id', 'name'] },
  ];
  const rowH = 16;
  const headerH = 20;
  return (
    <svg viewBox="0 0 220 180" style={{ width: '100%', height: 'auto' }}>
      {/* Connection lines */}
      <line x1="100" y1="30" x2="120" y2="30" stroke={GG.lineStrong} strokeWidth="1.5" />
      <line x1="55" y1="55" x2="55" y2="110" stroke={GG.lineStrong} strokeWidth="1.5" />
      <line x1="165" y1="55" x2="165" y2="110" stroke={GG.lineStrong} strokeWidth="1.5" />
      {tables.map(t => (
        <g key={t.label}>
          <rect x={t.x} y={t.y} width={t.w} height={headerH + t.cols.length * rowH} rx="5" fill={GG.bg1} stroke={GG.lineStrong} strokeWidth="1" />
          <rect x={t.x} y={t.y} width={t.w} height={headerH} rx="5" fill={t.color + '33'} />
          <rect x={t.x} y={t.y + headerH - 5} width={t.w} height={5} fill={t.color + '33'} />
          <text x={t.x + t.w / 2} y={t.y + 14} textAnchor="middle" fill={t.color} fontSize="8" fontFamily="monospace" fontWeight="bold">{t.label}</text>
          {t.cols.map((col, i) => (
            <text key={col} x={t.x + 6} y={t.y + headerH + 11 + i * rowH} fill={GG.fg3} fontSize="7" fontFamily="monospace">{col}</text>
          ))}
        </g>
      ))}
    </svg>
  );
}

// ── Error banner ─────────────────────────────────────────────────────────────
function GGErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '10px 12px',
      background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)',
      borderRadius: 8, color: '#f85149', fontSize: 12, fontFamily: GG.mono,
    }}>
      <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      {msg}
    </div>
  );
}

// ── Migration helpers (unchanged) ────────────────────────────────────────────
function normalizeMigrationName(name: string) {
  const cleaned = (name || 'auto_model_update').replace(/[^\w]/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'auto_model_update';
}

function djangoFieldType(type: string, isPrimary: boolean) {
  const t = (type || '').toLowerCase();
  if (isPrimary) return 'models.BigAutoField(primary_key=True, serialize=False)';
  if (t.includes('char') || t.includes('varchar') || t === 'string') return 'models.CharField(max_length=255)';
  if (t.includes('text')) return 'models.TextField()';
  if (t.includes('bool')) return 'models.BooleanField(default=False)';
  if (t.includes('date') && t.includes('time')) return 'models.DateTimeField()';
  if (t === 'date') return 'models.DateField()';
  if (t.includes('decimal') || t.includes('numeric')) return 'models.DecimalField(max_digits=12, decimal_places=2)';
  if (t.includes('float') || t.includes('double')) return 'models.FloatField()';
  if (t.includes('json')) return 'models.JSONField()';
  if (t.includes('uuid')) return 'models.UUIDField()';
  if (t.includes('bigint')) return 'models.BigIntegerField()';
  if (t.includes('int') || t === 'auto') return 'models.IntegerField()';
  return 'models.TextField()';
}

function modelLiteral(tableName: string) {
  const parts = tableName.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return tableName;
}

interface Schema2 { tables: SchemaTable[]; }

function generateDjangoMigration(schema: Schema2, app: string, name: string) {
  const tables = (schema.tables ?? []).filter(t => app === 'all' || t.app === app);
  const migrationName = normalizeMigrationName(name);
  const apps = Array.from(new Set(tables.map(t => t.app).filter(Boolean))).join(', ') || 'parsed apps';
  const operations = tables.map(table => {
    const fkByColumn = new Map(table.foreignKeys.map(fk => [fk.column, fk]));
    const fields = table.columns.map(col => {
      const fk = fkByColumn.get(col.name);
      const fieldName = fk && col.name.endsWith('_id') ? col.name.slice(0, -3) : col.name;
      if (fk) {
        const nullFlag = col.nullable ? ', null=True, blank=True' : '';
        return `                ('${fieldName}', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='${modelLiteral(fk.referencedTable).toLowerCase()}'${nullFlag})),`;
      }
      const nullFlag = !col.isPrimary && col.nullable ? ', null=True, blank=True' : '';
      const rendered = djangoFieldType(col.type, col.isPrimary).replace(/\)$/, `${nullFlag})`);
      return `                ('${col.name}', ${rendered}),`;
    }).join('\n');
    const options = table.dbTableName ? `,\n            options={'db_table': '${table.dbTableName}'}` : '';
    const modelName = table.modelName || table.name.split('.').pop() || table.name;
    return `        migrations.CreateModel(
            name='${modelName}',
            fields=[
${fields}
            ]${options},
        ),`;
  }).join('\n');

  return `# Generated by CodeFlow migration editor.
# Suggested file name: ${migrationName}.py
# Scope: ${apps}

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = False

    dependencies = [
        # Add the previous migration for each app here.
    ]

    operations = [
${operations || '        # No parsed Django models available for this scope.'}
    ]
`;
}
