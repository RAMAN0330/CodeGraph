import { ChevronRight, Database, FileCode, MoreHorizontal, Plug, RefreshCw, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { DbIdentity, HealthStatus } from '../../types';

const HEALTH_DOT: Record<HealthStatus, string> = {
  healthy: 'bg-emerald-500', warning: 'bg-amber-500', critical: 'bg-red-500', unknown: 'bg-muted-foreground/50',
};
const HEALTH_LABEL: Record<HealthStatus, string> = {
  healthy: 'Healthy', warning: 'Needs attention', critical: 'Critical', unknown: 'Checking',
};

interface DbHeaderProps {
  workspaceName: string;
  onOpenWorkspace: () => void;
  projectName: string;
  onBackToProjects: () => void;
  identity: DbIdentity | null;
  healthStatus: HealthStatus;
  paused: boolean;
  onTogglePause: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onNewConnection?: () => void;
  onOpenMigration?: () => void;
}

export default function DbHeader({
  workspaceName, onOpenWorkspace, projectName, onBackToProjects,
  identity, healthStatus, paused, onTogglePause, onRefresh, onOpenSettings, onNewConnection, onOpenMigration,
}: DbHeaderProps) {
  const engine = identity?.dbType === 'mysql' ? 'MySQL' : 'PostgreSQL';

  return (
    <header className="db-header flex h-13 items-center gap-3 border-b bg-card px-3">
      <button type="button" onClick={onBackToProjects} title="Back to projects" aria-label="Back to projects"
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-primary text-primary-foreground hover:bg-primary/90">
        <Database className="size-4" />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
        <button type="button" onClick={onOpenWorkspace} className="max-w-40 cursor-pointer truncate rounded border-0 bg-transparent px-1 text-muted-foreground hover:text-foreground">{workspaceName || 'Workspace'}</button>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
        <button type="button" onClick={onBackToProjects} className="max-w-48 cursor-pointer truncate rounded border-0 bg-transparent px-1 font-medium text-foreground hover:text-primary">{projectName || 'Project'}</button>
      </nav>

      {/* The connection this dashboard is reading, and whether it is healthy. */}
      <div className="ml-2 hidden min-w-0 items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-1 text-xs lg:flex" title={HEALTH_LABEL[healthStatus]}>
        <span className={cn('size-2 shrink-0 rounded-full', HEALTH_DOT[healthStatus])} />
        <span className="font-medium">{engine}{identity?.version ? ` ${identity.version}` : ''}</span>
        {identity && <span className="truncate font-mono text-muted-foreground">{identity.database}@{identity.host}</span>}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onTogglePause} aria-pressed={!paused}
          title={paused ? 'Resume live updates' : 'Pause live updates'} className="gap-2">
          <span className={cn('size-2 rounded-full', paused ? 'bg-muted-foreground/50' : 'animate-pulse bg-emerald-500')} />
          {paused ? 'Paused' : 'Live'}
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={onRefresh} title="Refresh now" aria-label="Refresh now">
          <RefreshCw className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenSettings}><Settings2 className="size-4" /> Connection</Button>
        {(onOpenMigration || onNewConnection) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="More actions"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onOpenMigration && <DropdownMenuItem onSelect={onOpenMigration}><FileCode className="size-4" /> Migration</DropdownMenuItem>}
              {onNewConnection && <DropdownMenuItem onSelect={onNewConnection}><Plug className="size-4" /> New connection</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
