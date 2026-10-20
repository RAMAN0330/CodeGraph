import { useEffect, useMemo, useState } from 'react';
import { Loader, Check, Wand2, Settings2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DatabaseDashboard from './DatabaseDashboard';
import { organizationStore } from '../../organization/services/organizationStore';
import { GG, ggInput, ggLabel, GGErrorBanner } from '../components/dbConnectTheme';
import AnalysisLoader, { type AnalysisStage } from '../../../shared/components/AnalysisLoader';
import '../../organization/pages/OrganizationPages.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const DATABASE_STAGES: AnalysisStage[] = [
  { id: 'restore', label: 'Restore project' },
  { id: 'connect', label: 'Open connection' },
  { id: 'schema', label: 'Read schema' },
  { id: 'diagram', label: 'Build diagram' },
];

const DB_STAGE_DETAIL = [
  'Reading the saved project record…',
  'Authenticating with your stored credentials…',
  'Listing tables, columns and keys…',
  'Resolving relations for the diagram…',
];

interface SchemaColumn { name: string; type: string; nullable: boolean; isPrimary: boolean; }
interface SchemaFK { column: string; referencedTable: string; referencedColumn: string; }
interface SchemaTable { name: string; columns: SchemaColumn[]; foreignKeys: SchemaFK[]; app?: string; file?: string; modelName?: string; dbTableName?: string; }
interface Schema { tables: SchemaTable[]; }

export default function DatabaseVisualizer({ projectId }: { projectId: number }) {
  const navigate = useNavigate();
  const [dbType, setDbType] = useState<'postgres' | 'mysql'>('postgres');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('5432');
  const [database, setDatabase] = useState('');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [schema, setSchema] = useState<Schema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMigrationEditor, setShowMigrationEditor] = useState(false);
  const [migrationApp, setMigrationApp] = useState('all');
  const [migrationName, setMigrationName] = useState('auto_model_update');
  const [migrationDraft, setMigrationDraft] = useState('');
  const [sslEnabled, setSslEnabled] = useState(false);

  // Loads the project's persisted, encrypted connection.
  const [projectName, setProjectName] = useState('');
  const [projectWorkspaceId, setProjectWorkspaceId] = useState<number | null>(null);
  const [projectWorkspaceName, setProjectWorkspaceName] = useState('');
  const [editingConnection, setEditingConnection] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');

  const [dbStage, setDbStage] = useState(0);

  useEffect(() => {
    const id = projectId;
    setLoading(true);
    setError(null);
    setDbStage(0);
    const projectLoad = organizationStore.load();
    projectLoad.then(() => setDbStage(stage => Math.max(stage, 1)));
    Promise.all([organizationStore.fetchProjectSchema(id), projectLoad])
      .then(([schemaRes, state]) => {
        if (!schemaRes.success) throw new Error(schemaRes.error || 'Could not load schema.');
        setDbStage(2);
        setSchema(schemaRes.schema);
        const project = state.projects.find(p => p.id === id);
        if (project) {
          setProjectName(project.name);
          setProjectWorkspaceId(project.workspaceId);
          setProjectWorkspaceName(state.workspaces.find(w => w.id === project.workspaceId)?.name ?? '');
          if (project.dbConnectionSummary) {
            setDbType(project.dbConnectionSummary.dbType);
            setHost(project.dbConnectionSummary.host);
            setPort(String(project.dbConnectionSummary.port));
            setDatabase(project.dbConnectionSummary.database);
            setUser(project.dbConnectionSummary.user);
            setSslEnabled(!!project.dbConnectionSummary.ssl);
          }
        }
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load this database project.'))
      .finally(() => setLoading(false));
  }, [projectId]);

  async function saveConnectionAndReconnect() {
    setSavingConnection(true);
    setConnectionMessage('');
    try {
      await organizationStore.updateProjectDbConnection(projectId, { dbType, host, port, database, user, password, ssl: sslEnabled });
      const res = await organizationStore.fetchProjectSchema(projectId);
      if (!res.success) throw new Error(res.error || 'Could not reconnect with the new credentials.');
      setSchema(res.schema);
      setEditingConnection(false);
      setPassword('');
    } catch (e) {
      setConnectionMessage(e instanceof Error ? e.message : 'Could not save this connection.');
    } finally {
      setSavingConnection(false);
    }
  }

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100dvh', background: GG.bg, color: GG.fg, fontFamily: GG.sans, display: 'flex', flexDirection: 'column' }}>

      {!schema ? (
        <AnalysisLoader
          kind="database"
          subject={projectName || 'this database'}
          facts={[dbType === 'mysql' ? 'MySQL' : 'PostgreSQL', database ? `${database} on ${host}` : `on ${host}`]}
          stages={DATABASE_STAGES}
          activeIndex={dbStage}
          detail={DB_STAGE_DETAIL[dbStage]}
          error={loading ? null : error || 'Could not load this database project.'}
          retryLabel="Edit connection"
          onRetry={() => { setConnectionMessage(''); setPassword(''); setEditingConnection(true); }}
          onWorkspace={() => navigate('/workspaces')}
          onProject={projectWorkspaceId ? () => navigate(`/workspaces/${projectWorkspaceId}/projects`) : undefined}
          onBack={() => navigate(projectWorkspaceId ? `/workspaces/${projectWorkspaceId}/projects` : '/workspaces')}
        />
      ) : (
        /* ── Saved database project: full observability dashboard shell ── */
        <div style={{ flex: 1, minHeight: 0 }}>
          <DatabaseDashboard
            projectId={projectId}
            projectName={projectName || 'Database'}
            workspaceName={projectWorkspaceName || 'Workspace'}
            schema={schema}
            onOpenWorkspace={() => navigate('/workspaces')}
            onBackToProjects={() => navigate(projectWorkspaceId ? `/workspaces/${projectWorkspaceId}/projects` : '/workspaces')}
            onOpenSettings={() => { setConnectionMessage(''); setPassword(''); setEditingConnection(true); }}
            onOpenMigration={() => { setMigrationApp(migrationApps[0] || 'all'); setShowMigrationEditor(true); }}
          />
        </div>
      )}

      {/* ── Edit connection modal (saved database projects only) ── */}
      {editingConnection && (
        <div
          onClick={() => !savingConnection && setEditingConnection(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 'min(440px, 94vw)', background: GG.panel, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 28px 90px rgba(0,0,0,0.6)' }}
          >
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${GG.lineStrong}`, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Settings2 size={17} color={GG.accent} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: GG.fg, fontWeight: 700, fontSize: 14, fontFamily: GG.mono }}>Edit connection</div>
                <div style={{ color: GG.fg3, fontSize: 12, fontFamily: GG.sans }}>Saved encrypted — re-enter the password to change or verify it.</div>
              </div>
              <Button variant="ghost" onClick={() => setEditingConnection(false)} style={{ background: 'none', border: 'none', color: GG.fg3, cursor: 'pointer' }}><X size={18} /></Button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['postgres', 'mysql'] as const).map(t => (
                  <Button key={t} variant="ghost" onClick={() => { setDbType(t); }} style={{
                    flex: 1, padding: '7px 0',
                    background: dbType === t ? `${GG.info}18` : GG.bg1,
                    border: `1px solid ${dbType === t ? GG.info + '55' : GG.lineStrong}`,
                    borderRadius: 8, color: dbType === t ? GG.info : GG.fg3,
                    fontFamily: GG.mono, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                    {t === 'postgres' ? '🐘 PostgreSQL' : '🐬 MySQL'}
                  </Button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 2 }}>
                  <Label htmlFor="dbviz-edit-host" style={ggLabel}>Host</Label>
                  <Input id="dbviz-edit-host" style={ggInput} value={host} onChange={e => setHost(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label htmlFor="dbviz-edit-port" style={ggLabel}>Port</Label>
                  <Input id="dbviz-edit-port" style={ggInput} value={port} onChange={e => setPort(e.target.value)} />
                </div>
              </div>
              <div>
                <Label htmlFor="dbviz-edit-database" style={ggLabel}>Database</Label>
                <Input id="dbviz-edit-database" style={ggInput} value={database} onChange={e => setDatabase(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Label htmlFor="dbviz-edit-user" style={ggLabel}>Username</Label>
                  <Input id="dbviz-edit-user" style={ggInput} value={user} onChange={e => setUser(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <Label htmlFor="dbviz-edit-password" style={ggLabel}>Password</Label>
                  <Input id="dbviz-edit-password" type="password" style={ggInput} value={password} onChange={e => setPassword(e.target.value)} placeholder="Re-enter to change" />
                </div>
              </div>
              <Toggle label="SSL" value={sslEnabled} onChange={setSslEnabled} />
              {connectionMessage && <GGErrorBanner msg={connectionMessage} />}
              <div style={{ display: 'flex', gap: 10 }}>
                <Button
                  onClick={() => void saveConnectionAndReconnect()}
                  disabled={savingConnection || !host.trim() || !database.trim() || !user.trim() || !password}
                  style={{
                    flex: 1, height: 38,
                    background: savingConnection || !host.trim() || !database.trim() || !user.trim() || !password ? GG.fg4 + '33' : GG.accent,
                    border: 'none', borderRadius: 8,
                    color: savingConnection || !host.trim() || !database.trim() || !user.trim() || !password ? GG.fg4 : GG.bg,
                    fontFamily: GG.mono, fontSize: 13, fontWeight: 700,
                    cursor: savingConnection ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {savingConnection ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> saving…</> : <><Check size={14} /> Save & reconnect</>}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setEditingConnection(false)}
                  disabled={savingConnection}
                  style={{ padding: '0 16px', height: 38, background: 'transparent', border: `1px solid ${GG.lineStrong}`, borderRadius: 8, color: GG.fg3, fontFamily: GG.mono, fontSize: 12, cursor: 'pointer' }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
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
              <Button variant="ghost" onClick={() => setShowMigrationEditor(false)} style={{ background: 'none', border: 'none', color: GG.fg3, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</Button>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${GG.lineStrong}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Label htmlFor="dbviz-migration-app" style={{ color: GG.fg3, fontSize: 12, fontFamily: GG.mono }}>App</Label>
              <select
                id="dbviz-migration-app"
                value={migrationApp}
                onChange={e => setMigrationApp(e.target.value)}
                style={{ ...ggInput, width: 180, height: 32, fontSize: 12 }}
              >
                <option value="all">All parsed apps</option>
                {migrationApps.map(app => <option key={app} value={app}>{app}</option>)}
              </select>
              <Label htmlFor="dbviz-migration-name" style={{ color: GG.fg3, fontSize: 12, fontFamily: GG.mono }}>Name</Label>
              <Input
                id="dbviz-migration-name"
                value={migrationName}
                onChange={e => setMigrationName(e.target.value.replace(/[^\w]/g, '_'))}
                style={{ ...ggInput, width: 240, height: 32, fontSize: 12 }}
              />
              <code style={{ marginLeft: 'auto', color: GG.fg3, fontSize: 11, background: GG.bg2, padding: '4px 8px', borderRadius: 6, fontFamily: GG.mono }}>
                python manage.py makemigrations{migrationApp !== 'all' ? ` ${migrationApp}` : ''}
              </code>
            </div>
            <Textarea
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
    <Button
      variant="ghost"
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        height: 'auto',
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
    </Button>
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

  return `# Generated by Structrace migration editor.
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
