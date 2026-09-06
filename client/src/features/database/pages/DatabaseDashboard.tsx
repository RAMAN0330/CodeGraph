import { useCallback, useState } from 'react';
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
import { dbTelemetryApi, useDbTelemetry } from '../services/dbTelemetryApi';
import { DB_NAV_LABELS, type DbNavId, type Schema, type TimeRange } from '../types';

interface DatabaseDashboardProps {
  projectId: number;
  projectName: string;
  workspaceName: string;
  schema: Schema;
  onOpenWorkspace: () => void;
  onBackToProjects: () => void;
  onOpenSettings: () => void;
  onNewConnection?: () => void;
  onOpenMigration?: () => void;
}

export default function DatabaseDashboard({
  projectId, projectName, workspaceName, schema, onOpenWorkspace, onBackToProjects, onOpenSettings, onNewConnection, onOpenMigration,
}: DatabaseDashboardProps) {
  const [section, setSection] = useState<DbNavId>('overview');
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
        onNewConnection={onNewConnection}
        onOpenMigration={onOpenMigration}
      />
      <DbSidebar active={section} onChange={setSection} />
      <div className="db-content">
        {/* A definite height here (matching db-content, which itself stretches
            to the sidebar's height via the shell grid) lets a full-height page
            like Schema fill exactly that space; pages with more natural
            content simply overflow past it and the panel scrolls as before. */}
        <div style={{ height: '100%' }}>
          {section === 'overview' && <OverviewPage projectId={projectId} paused={paused} onNavigate={setSection} />}
          {section === 'performance' && <PerformancePage projectId={projectId} paused={paused} />}
          {section === 'queries' && <QueriesPage projectId={projectId} paused={paused} />}
          {section === 'schema' && <SchemaExplorer schema={schema} />}
          {section === 'storage' && <StoragePage projectId={projectId} paused={paused} />}
          {section === 'replication' && <ReplicationPage projectId={projectId} paused={paused} />}
          {section === 'activity' && <ActivityPage projectId={projectId} paused={paused} />}
          {section === 'security' && <SecurityPage projectId={projectId} paused={paused} />}
          {section === 'alerts' && <AlertsPage projectId={projectId} paused={paused} />}
        </div>
      </div>
    </div>
  );
}
