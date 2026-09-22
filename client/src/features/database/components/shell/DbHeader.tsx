import { useEffect, useRef, useState } from 'react';
import { Database, RefreshCw, Pause, Play, Settings2, MoreVertical, FileCode, LayoutDashboard } from 'lucide-react';
import type { DbIdentity, HealthStatus, TimeRange } from '../../types';
import { Button } from '@/components/ui/button';

const RANGES: { id: TimeRange; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
];

function HealthLabel({ status }: { status: HealthStatus }) {
  const label = status === 'healthy' ? 'Healthy' : status === 'warning' ? 'Warning' : status === 'critical' ? 'Critical' : 'Unknown';
  return <span className={`db-status-dot ${status}`} title={label} />;
}

interface DbHeaderProps {
  workspaceName: string;
  onOpenWorkspace: () => void;
  projectName: string;
  onBackToProjects: () => void;
  currentSectionLabel: string;
  identity: DbIdentity | null;
  healthStatus: HealthStatus;
  range: TimeRange;
  onRangeChange: (range: TimeRange) => void;
  paused: boolean;
  onTogglePause: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onNewConnection?: () => void;
  onOpenMigration?: () => void;
}

export default function DbHeader({
  workspaceName, onOpenWorkspace, projectName, onBackToProjects, currentSectionLabel,
  identity, healthStatus, range, onRangeChange,
  paused, onTogglePause, onRefresh, onOpenSettings, onNewConnection, onOpenMigration,
}: DbHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const engineLabel = identity?.dbType === 'mysql' ? 'MySQL' : 'PostgreSQL';

  return (
    <header className="db-header">
      <div className="db-header-primary">
        <Button variant="ghost" className="db-brand" onClick={onBackToProjects} title="Back to projects">
          <span className="db-brand-mark"><Database size={18} /></span>
        </Button>
        <nav className="db-breadcrumb" aria-label="Breadcrumb">
          <Button variant="ghost" onClick={onOpenWorkspace} title={workspaceName}>Workspace</Button>
          <span className="db-breadcrumb-sep">/</span>
          <Button variant="ghost" onClick={onBackToProjects} title={projectName}>Project</Button>
          <span className="db-breadcrumb-sep">/</span>
          <span className="db-breadcrumb-current">{currentSectionLabel}</span>
        </nav>
      </div>

      <div className="db-identity-pill">
        <HealthLabel status={healthStatus} />
        <span className="db-engine">{engineLabel}{identity?.version ? ` ${identity.version}` : ''}</span>
      </div>

      <div className="db-header-utilities">
        <div className="db-range-group">
          {RANGES.map(r => (
            <Button key={r.id} variant="ghost" className={`db-range-pill${range === r.id ? ' active' : ''}`} onClick={() => onRangeChange(r.id)}>{r.label}</Button>
          ))}
        </div>
        <Button variant="ghost" className="db-header-icon-btn" onClick={onRefresh} title="Refresh now"><RefreshCw size={15} /></Button>
        <Button variant="ghost" className={`db-header-icon-btn${paused ? ' active' : ''}`} onClick={onTogglePause} title={paused ? 'Resume live updates' : 'Pause live updates'}>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </Button>
        <Button variant="ghost" className="db-header-action" onClick={onOpenSettings}><Settings2 size={14} /> Database Settings</Button>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <Button variant="ghost" className="db-header-icon-btn" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} title="More actions"><MoreVertical size={15} /></Button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 40, minWidth: 180, padding: 5, border: '1px solid var(--border-subtle)', borderRadius: 9, background: 'var(--surface-card)', boxShadow: '0 16px 36px rgba(20,24,32,.14)' }}>
              {onOpenMigration && (
                <Button variant="ghost" onClick={() => { setMenuOpen(false); onOpenMigration(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--text-primary)', font: 'inherit', fontSize: 11, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>
                  <FileCode size={14} /> Migration
                </Button>
              )}
              {onNewConnection && (
                <Button variant="ghost" onClick={() => { setMenuOpen(false); onNewConnection(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 8, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--text-primary)', font: 'inherit', fontSize: 11, fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>
                  <LayoutDashboard size={14} /> New Connection
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
