import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Upload, ArrowLeft, Play, LayoutDashboard, AlertCircle, Loader, FolderOpen, GitBranch, ChevronRight, Check, FileCode, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ERDiagramGraph from '../components/ERDiagramGraph';
import { GitHub } from '../lib/github';
import { dbSchemaToFlowSchema, parseDjangoModels } from '../lib/dbParser';

const API = 'http://localhost:5000';

interface SchemaColumn { name: string; type: string; nullable: boolean; isPrimary: boolean; }
interface SchemaFK { column: string; referencedTable: string; referencedColumn: string; }
interface SchemaTable { name: string; columns: SchemaColumn[]; foreignKeys: SchemaFK[]; app?: string; file?: string; modelName?: string; dbTableName?: string; }
interface Schema { tables: SchemaTable[]; }

interface AppFolder { path: string; label: string; filePaths: string[]; }

// Convert DbTable[] from dbParser to SchemaTable[] for ERDiagramGraph
function dbTablesToSchema(tables: ReturnType<typeof parseDjangoModels>): SchemaTable[] {
  return dbSchemaToFlowSchema({ tables, relations: tables.flatMap(t => t.relations) }).tables;
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Repo tab state
  const [repoUrl, setRepoUrl] = useState('');
  const [repoToken, setRepoToken] = useState('');
  const [repoStatus, setRepoStatus] = useState('');
  const [appFolders, setAppFolders] = useState<AppFolder[]>([]);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [repoStep, setRepoStep] = useState<'input' | 'select' | 'done'>('input');
  // store fetched file contents keyed by path for local repos
  const localFilesRef = useRef<Map<string, string>>(new Map());
  // for GitHub repos
  const repoOwnerRef = useRef('');
  const repoNameRef = useRef('');
  const repoBranchRef = useRef('main');

  const fkCount = schema?.tables.reduce((s, t) => s + t.foreignKeys.length, 0) ?? 0;
  const appOptions = useMemo(() => {
    const apps = new Set<string>();
    schema?.tables.forEach(t => { if (t.app) apps.add(t.app); });
    return Array.from(apps).sort();
  }, [schema]);
  const visibleSchema = useMemo(() => {
    if (!schema) return null;
    const q = graphSearch.trim().toLowerCase();
    const tables = schema.tables.filter(t => {
      if (selectedApp !== 'all' && t.app !== selectedApp) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
    });
    return { tables };
  }, [schema, graphSearch, selectedApp]);
  const migrationApps = useMemo(() => {
    const apps = new Set<string>();
    schema?.tables.forEach(t => { if (t.app) apps.add(t.app); });
    return Array.from(apps).sort();
  }, [schema]);
  const migrationSource = useMemo(() => {
    if (!schema) return '';
    return generateDjangoMigration(schema, migrationApp, migrationName);
  }, [schema, migrationApp, migrationName]);

  useEffect(() => {
    if (showMigrationEditor) setMigrationDraft(migrationSource);
  }, [showMigrationEditor, migrationSource]);

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
      if (!data.schema.tables.length) throw new Error('No CREATE TABLE statements found in file');
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

  // ── Repo: scan GitHub repo for models.py files ──────────────────────────
  async function scanGitHubRepo() {
    setError(null);
    setLoading(true);
    setRepoStatus('Connecting to GitHub…');
    try {
      // Parse owner/repo from URL
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

      // Group by app folder (parent directory)
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

  // ── Repo: scan local folder ──────────────────────────────────────────────
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

  // ── Repo: parse selected apps ────────────────────────────────────────────
  async function parseSelectedApps() {
    setError(null);
    setLoading(true);
    setRepoStatus('Parsing models…');
    try {
      const selected = appFolders.filter(f => selectedApps.has(f.path));
      const allPaths = selected.flatMap(f => f.filePaths);
      const contents: { path: string; content: string }[] = [];

      if (repoOwnerRef.current) {
        // GitHub
        await Promise.all(allPaths.map(async (fp) => {
          const text = await (GitHub as any).getFile(repoOwnerRef.current, repoNameRef.current, fp, repoBranchRef.current);
          if (text) contents.push({ path: fp, content: text });
        }));
      } else {
        // Local
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

      // Deduplicate by model name
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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: 6, color: 'white', fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: 13 };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      <button
        onClick={() => navigate('/workspace')}
        style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 1000,
          background: '#21262d',
          border: '1px solid #30363d',
          color: '#f0f6fc',
          padding: '8px 16px',
          borderRadius: '6px',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        ← Workspace
      </button>
      {/* Header */}
      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
            <ArrowLeft size={18} /> Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderLeft: '1px solid var(--border-glass)', paddingLeft: '1rem' }}>
            <Database size={22} color="var(--accent-purple)" />
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Database Visualizer</h2>
          </div>
        </div>
        {schema && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{schema.tables.length} tables · {fkCount} relationships</span>
            {migrationApps.length > 0 && (
              <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setMigrationApp(selectedApp !== 'all' ? selectedApp : migrationApps[0] || 'all'); setShowMigrationEditor(true); }}>
                <FileCode size={16} /> Migration
              </button>
            )}
            <button className="btn-secondary" style={{ padding: '7px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setSchema(null); setError(null); setSqlFileName(''); resetRepo(); }}>
              <LayoutDashboard size={16} /> New Connection
            </button>
          </div>
        )}
      </header>

      <main style={{ flex: 1, display: 'flex', alignItems: schema ? 'stretch' : 'center', justifyContent: 'center', padding: schema ? 0 : '2rem', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {!schema ? (
            <motion.div key="form" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="glass-panel" style={{ width: '100%', maxWidth: 560, padding: '2rem' }}>
              {/* Tab switcher */}
              <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
                {(['credentials', 'file', 'repo'] as const).map(t => (
                  <button key={t} onClick={() => { setConnectType(t); setError(null); }} style={{ flex: 1, background: connectType === t ? 'rgba(167,139,250,0.15)' : 'transparent', color: connectType === t ? 'var(--accent-purple)' : 'var(--text-secondary)', border: connectType === t ? '1px solid rgba(167,139,250,0.3)' : '1px solid transparent', padding: '0.65rem', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s' }}>
                    {t === 'credentials' ? '🔌 Credentials' : t === 'file' ? '📄 SQL Dump' : '🗂 Repository'}
                  </button>
                ))}
              </div>

              {connectType === 'credentials' && (
                <motion.div key="creds" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(['postgres', 'mysql'] as const).map(t => (
                      <button key={t} onClick={() => { setDbType(t); setPort(t === 'postgres' ? '5432' : '3306'); }} style={{ flex: 1, padding: '0.55rem', background: dbType === t ? 'rgba(77,159,255,0.15)' : 'rgba(0,0,0,0.2)', border: dbType === t ? '1px solid rgba(77,159,255,0.4)' : '1px solid var(--border-glass)', borderRadius: 6, color: dbType === t ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {t === 'postgres' ? '🐘 PostgreSQL' : '🐬 MySQL'}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div style={{ flex: 2 }}>
                      <label style={labelStyle}>Host</label>
                      <input style={inputStyle} value={host} onChange={e => setHost(e.target.value)} placeholder="localhost" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Port</label>
                      <input style={inputStyle} value={port} onChange={e => setPort(e.target.value)} placeholder={dbType === 'postgres' ? '5432' : '3306'} />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Database Name</label>
                    <input style={inputStyle} value={database} onChange={e => setDatabase(e.target.value)} placeholder="my_database" />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Username</label>
                      <input style={inputStyle} value={user} onChange={e => setUser(e.target.value)} placeholder={dbType === 'postgres' ? 'postgres' : 'root'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Password</label>
                      <input type="password" style={inputStyle} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                  </div>
                  {error && <ErrorBanner msg={error} />}
                  <button className="btn-primary" style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} onClick={connect} disabled={loading || !database}>
                    {loading ? <><Loader size={16} className="spin" /> Connecting...</> : <><Play size={16} /> Connect & Analyze</>}
                  </button>
                </motion.div>
              )}

              {connectType === 'file' && (
                <motion.div key="file" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div
                    style={{ padding: '2.5rem', border: `2px dashed ${error ? 'rgba(255,95,95,0.5)' : 'var(--border-glass)'}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleFileDrop}
                  >
                    <Upload size={40} color="var(--text-secondary)" />
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>{sqlFileName || 'Drop your .sql file here'}</p>
                      <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: 13 }}>or click to browse — supports PostgreSQL & MySQL dumps</p>
                    </div>
                    <input ref={fileInputRef} type="file" accept=".sql,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) parseSqlFile(f); }} />
                  </div>
                  {error && <ErrorBanner msg={error} />}
                  {loading && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}><Loader size={16} className="spin" /> Parsing SQL…</div>}
                </motion.div>
              )}

              {connectType === 'repo' && (
                <motion.div key="repo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {repoStep === 'input' && (
                    <>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                        Scan a GitHub repo or local folder for Django <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>models.py</code> files, then pick which apps to visualize.
                      </p>
                      <div>
                        <label style={labelStyle}>GitHub Repository</label>
                        <input style={inputStyle} value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="owner/repo or https://github.com/owner/repo" />
                      </div>
                      <div>
                        <label style={labelStyle}>Personal Access Token <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(optional, for private repos)</span></label>
                        <input type="password" style={inputStyle} value={repoToken} onChange={e => setRepoToken(e.target.value)} placeholder="ghp_..." />
                      </div>
                      {repoStatus && <div style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Loader size={13} className="spin" /> {repoStatus}</div>}
                      {error && <ErrorBanner msg={error} />}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} onClick={scanGitHubRepo} disabled={loading || !repoUrl.trim()}>
                          {loading ? <><Loader size={16} className="spin" /> Scanning…</> : <><GitBranch size={16} /> Scan GitHub Repo</>}
                        </button>
                        <button className="btn-secondary" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} onClick={scanLocalFolder} disabled={loading}>
                          <FolderOpen size={16} /> Local Folder
                        </button>
                      </div>
                    </>
                  )}

                  {repoStep === 'select' && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Found {appFolders.length} app{appFolders.length !== 1 ? 's' : ''} with models — select which to visualize:</span>
                        <button onClick={resetRepo} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>← back</button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                        {appFolders.map(app => {
                          const sel = selectedApps.has(app.path);
                          return (
                            <button key={app.path} onClick={() => toggleApp(app.path)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.9rem', background: sel ? 'rgba(167,139,250,0.12)' : 'rgba(0,0,0,0.2)', border: sel ? '1px solid rgba(167,139,250,0.4)' : '1px solid var(--border-glass)', borderRadius: 7, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: sel ? '2px solid var(--accent-purple)' : '2px solid var(--border-glass)', background: sel ? 'var(--accent-purple)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {sel && <Check size={11} color="#0d0d1a" strokeWidth={3} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ color: sel ? 'var(--accent-purple)' : 'var(--text-primary)', fontWeight: 600, fontSize: 13 }}>{app.label}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.path}</div>
                              </div>
                              <span style={{ color: 'var(--text-secondary)', fontSize: 11, flexShrink: 0 }}>{app.filePaths.length} file{app.filePaths.length !== 1 ? 's' : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setSelectedApps(new Set(appFolders.map(f => f.path)))}>All</button>
                        <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setSelectedApps(new Set())}>None</button>
                      </div>
                      {repoStatus && <div style={{ color: 'var(--text-secondary)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Loader size={13} className="spin" /> {repoStatus}</div>}
                      {error && <ErrorBanner msg={error} />}
                      <button className="btn-primary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} onClick={parseSelectedApps} disabled={loading || selectedApps.size === 0}>
                        {loading ? <><Loader size={16} className="spin" /> Parsing…</> : <><ChevronRight size={16} /> Visualize {selectedApps.size} App{selectedApps.size !== 1 ? 's' : ''}</>}
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div key="diagram" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={graphSearch} onChange={e => { setGraphSearch(e.target.value); setFocusedTable(null); }} placeholder="Search tables or columns" style={{ ...inputStyle, width: 260, padding: '0.5rem 0.65rem', fontSize: 12 }} />
                {appOptions.length > 0 && (
                  <select value={selectedApp} onChange={e => { setSelectedApp(e.target.value); setFocusedTable(null); }} style={{ ...inputStyle, width: 180, padding: '0.5rem 0.65rem', fontSize: 12 }}>
                    <option value="all">All apps</option>
                    {appOptions.map(app => <option key={app} value={app}>{app}</option>)}
                  </select>
                )}
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{visibleSchema?.tables.length ?? 0} visible</span>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {(visibleSchema?.tables || schema.tables).slice(0, 8).map(t => (
                  <button key={t.name} onClick={() => setFocusedTable(prev => prev === t.name ? null : t.name)} style={{ padding: '4px 10px', background: focusedTable === t.name ? 'rgba(0,255,157,0.12)' : 'rgba(167,139,250,0.1)', border: focusedTable === t.name ? '1px solid rgba(0,255,157,0.4)' : '1px solid rgba(167,139,250,0.25)', borderRadius: 6, fontSize: 12, color: focusedTable === t.name ? 'var(--accent-green)' : 'var(--accent-purple)', cursor: 'pointer' }}>
                    {t.name} <span style={{ color: 'var(--text-secondary)' }}>({t.columns.length} cols)</span>
                  </button>
                ))}
                {(visibleSchema?.tables.length || 0) > 8 && <div style={{ padding: '4px 10px', color: 'var(--text-secondary)', fontSize: 12 }}>+{(visibleSchema?.tables.length || 0) - 8} more</div>}
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <ERDiagramGraph schema={visibleSchema || schema} selectedTable={focusedTable} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      {showMigrationEditor && schema && (
        <div onClick={() => setShowMigrationEditor(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(980px, 94vw)', height: 'min(760px, 88vh)', background: 'var(--bg-secondary)', border: '1px solid var(--border-glass)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 28px 90px rgba(0,0,0,0.55)' }}>
            <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <Wand2 size={18} color="var(--accent-green)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 14 }}>Django migration editor</div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Drafted from the parsed model schema. Review it before running it in your Django project.</div>
              </div>
              <button onClick={() => setShowMigrationEditor(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>App</label>
              <select value={migrationApp} onChange={e => setMigrationApp(e.target.value)} style={{ ...inputStyle, width: 180, padding: '0.45rem 0.6rem', fontSize: 12 }}>
                <option value="all">All parsed apps</option>
                {migrationApps.map(app => <option key={app} value={app}>{app}</option>)}
              </select>
              <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Name</label>
              <input value={migrationName} onChange={e => setMigrationName(e.target.value.replace(/[^\w]/g, '_'))} style={{ ...inputStyle, width: 240, padding: '0.45rem 0.6rem', fontSize: 12 }} />
              <code style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: 12, background: 'rgba(255,255,255,0.06)', padding: '5px 8px', borderRadius: 6 }}>
                python manage.py makemigrations{migrationApp !== 'all' ? ` ${migrationApp}` : ''}
              </code>
            </div>
            <textarea
              value={migrationDraft}
              onChange={e => setMigrationDraft(e.target.value)}
              spellCheck={false}
              style={{ flex: 1, width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'rgba(0,0,0,0.28)', color: 'var(--accent-green)', padding: '1rem', fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 12, lineHeight: 1.55, boxSizing: 'border-box', whiteSpace: 'pre', overflowWrap: 'normal' }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

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

function generateDjangoMigration(schema: Schema, app: string, name: string) {
  const tables = schema.tables.filter(t => app === 'all' || t.app === app);
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

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '0.75rem', background: 'rgba(255,95,95,0.12)', border: '1px solid rgba(255,95,95,0.3)', borderRadius: 7, color: '#ff5f5f', fontSize: 13 }}>
      <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      {msg}
    </div>
  );
}
