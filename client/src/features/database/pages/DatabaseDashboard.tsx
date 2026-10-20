import { useCallback, useState } from 'react';
import { usePersistentState, writePersisted } from '../../../shared/hooks/usePersistentState';
import SqlWorkspacePage from '../components/sql/SqlWorkspacePage';
import { qualifiedName } from '../services/sqlApi';
import DataBrowserPage from '../components/sql/DataBrowserPage';
import DbSidebar from '../components/shell/DbSidebar';
import DbHeader from '../components/shell/DbHeader';
import '../components/shell/DatabaseDashboard.css';
import OverviewPage from '../components/pages/OverviewPage';
import PerformancePage from '../components/pages/PerformancePage';
import QueriesPage from '../components/pages/QueriesPage';
import StoragePage from '../components/pages/StoragePage';
import ReplicationPage from '../components/pages/ReplicationPage';
import ActivityPage from '../components/pages/ActivityPage';
import SecurityPage from '../components/pages/SecurityPage';
import AlertsPage from '../components/pages/AlertsPage';
import SchemaExplorer from '../components/schema/SchemaExplorer';
import { Network } from 'lucide-react';
import { Page, PageHeader } from '../../../shared/components/Page';
import { dbTelemetryApi, useDbTelemetry } from '../services/dbTelemetryApi';
import { DB_NAV_IDS, DB_NAV_LABELS, type DbNavId, type Schema, type SchemaTable, type TimeRange } from '../types';

interface DatabaseDashboardProps {
  projectId: number;
  projectName: string;
  workspaceName: string;
  schema: Schema;
  onOpenWorkspace: () => void;
  onBackToProjects: () => void;
  onOpenSettings: () => void;
  onOpenMigration?: () => void;
}

export default function DatabaseDashboard({
  projectId, projectName, workspaceName, schema, onOpenWorkspace, onBackToProjects, onOpenSettings, onOpenMigration,
}: DatabaseDashboardProps) {
  const [storedSection, setSection] = usePersistentState<DbNavId>(`cg.db.${projectId}.section`, 'overview');
  const section: DbNavId = (DB_NAV_IDS as readonly string[]).includes(storedSection) ? storedSection : 'overview';
  const [pendingSql, setPendingSql] = useState<string | null>(null);
  const clearPendingSql = useCallback(() => setPendingSql(null), []);
  const openSql = useCallback((sql: string) => { setPendingSql(sql); setSection('sql'); }, [setSection]);
  const browseTable = useCallback((table: SchemaTable) => { writePersisted(`cg.db.${projectId}.browseTable`, qualifiedName(table)); setSection('data'); }, [projectId, setSection]);
  const browseByName = useCallback((name: string) => { writePersisted(`cg.db.${projectId}.browseTable`, name); setSection('data'); }, [projectId, setSection]);
  const queryTable = useCallback((table: SchemaTable) => openSql(`SELECT *\nFROM ${qualifiedName(table)}\nLIMIT 100`), [openSql]);
  const [range, setRange] = useState<TimeRange>('live');
  const [paused, setPaused] = useState(false);

  const overviewFetcher = useCallback(() => dbTelemetryApi.overview(projectId), [projectId]);
  const { data: overview, refresh } = useDbTelemetry(overviewFetcher, [projectId], { pollMs: paused ? 0 : 10000, paused });

  return (
    <div className="db-shell">
      <DbHeader
        workspaceName={workspaceName}
        onOpenWorkspace={onOpenWorkspace}
        projectName={projectName}
        onBackToProjects={onBackToProjects}
        currentSectionLabel={DB_NAV_LABELS[section]}
        identity={overview?.identity ?? null}
        healthStatus={overview?.healthStatus ?? 'unknown'}
        range={range}
        onRangeChange={setRange}
        paused={paused}
        onTogglePause={() => setPaused(p => !p)}
        onRefresh={refresh}
        onOpenSettings={onOpenSettings}
        onOpenMigration={onOpenMigration}
      />
      <DbSidebar active={section} onChange={setSection} />
      <div className={`db-content${section === 'overview' ? ' db-content-fit' : ''}`}>
        {/* A definite height here (matching db-content, which itself stretches
            to the sidebar's height via the shell grid) lets a full-height page
            like Schema fill exactly that space; pages with more natural
            content simply overflow past it and the panel scrolls as before. */}
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {section === 'overview' && <OverviewPage projectId={projectId} schema={schema} paused={paused} onNavigate={setSection} />}
          {section === 'performance' && <PerformancePage projectId={projectId} paused={paused} />}
          {section === 'queries' && <QueriesPage projectId={projectId} paused={paused} onOpenSql={openSql} />}
          {section === 'sql' && <SqlWorkspacePage projectId={projectId} schema={schema} pendingSql={pendingSql} onPendingSqlConsumed={clearPendingSql} />}
          {section === 'data' && <DataBrowserPage projectId={projectId} schema={schema} onOpenSql={openSql} />}
          {section === 'schema' && (
            <Page>
              <PageHeader icon={Network} tone="database" title="Schema" description="Tables, relationships and indexes, and which code reads or writes each table." />
              <SchemaExplorer projectId={projectId} schema={schema} onBrowse={browseTable} onQuery={queryTable} />
            </Page>
          )}
          {section === 'storage' && <StoragePage projectId={projectId} paused={paused} onBrowseTable={browseByName} />}
          {section === 'replication' && <ReplicationPage projectId={projectId} paused={paused} />}
          {section === 'activity' && <ActivityPage projectId={projectId} paused={paused} onNavigate={setSection} />}
          {section === 'security' && <SecurityPage projectId={projectId} paused={paused} />}
          {section === 'alerts' && <AlertsPage projectId={projectId} paused={paused} onNavigate={setSection} />}
        </div>
      </div>
    </div>
  );
}
