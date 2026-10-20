import { Database, RefreshCw, Pause, Play, Settings2, MoreVertical, FileCode } from 'lucide-react';
import type { DbIdentity, HealthStatus, TimeRange } from '../../types';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '../../../../shared/components/ThemeToggle';

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
  onOpenMigration?: () => void;
}

export default function DbHeader({
  workspaceName, onOpenWorkspace, projectName, onBackToProjects, currentSectionLabel,
  identity, healthStatus, range, onRangeChange,
  paused, onTogglePause, onRefresh, onOpenSettings, onOpenMigration,
}: DbHeaderProps) {
  const engineLabel = identity?.dbType === 'mysql' ? 'MySQL' : 'PostgreSQL';

  return (
    <header className="db-header">
      <div className="db-header-primary">
        <Button variant="ghost" className="db-brand" onClick={onBackToProjects} title="Back to projects">
          <span className="db-brand-mark"><Database size={18} /></span>
        </Button>
        <nav className="db-breadcrumb" aria-label="Breadcrumb">
          <Button variant="ghost" onClick={onOpenWorkspace} title="All workspaces">{workspaceName}</Button>
          <span className="db-breadcrumb-sep">/</span>
          <Button variant="ghost" onClick={onBackToProjects} title="Back to projects">{projectName}</Button>
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
        <ThemeToggle />
        {onOpenMigration && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="db-header-icon-btn" title="More actions"><MoreVertical size={15} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onOpenMigration}><FileCode size={14} /> Migration</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
