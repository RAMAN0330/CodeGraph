import {
  LayoutDashboard, Activity, Terminal, Network, SquareTerminal, Rows3, HardDrive, GitCompare, Radio, ShieldCheck, AlertTriangle,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistentState } from '../../../../shared/hooks/usePersistentState';
import { DB_NAV_GROUPS, DB_PAGES, type DbNavId } from '../../types';

const ICONS: Record<DbNavId, typeof LayoutDashboard> = {
  overview: LayoutDashboard, sql: SquareTerminal, data: Rows3, schema: Network,
  performance: Activity, queries: Terminal, storage: HardDrive, replication: GitCompare, activity: Radio,
  security: ShieldCheck, alerts: AlertTriangle,
};

interface DbSidebarProps {
  active: DbNavId;
  onChange: (section: DbNavId) => void;
  alertCount?: number;
}

// Docked navigation: it takes its own column, so it never covers the page.
// Collapsing to icons is a deliberate choice that is remembered.
export default function DbSidebar({ active, onChange, alertCount = 0 }: DbSidebarProps) {
  const [collapsed, setCollapsed] = usePersistentState<boolean>('cg.db.sidebarCollapsed', false);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside className={cn('db-sidebar flex min-h-0 flex-col border-r bg-card transition-[width] duration-200', collapsed ? 'w-14' : 'w-56')}>
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3" aria-label="Database dashboard sections">
        {DB_NAV_GROUPS.map(group => (
          <div key={group.label}>
            {collapsed
              ? <div className="mx-2 mb-2 border-t first:hidden" aria-hidden="true" />
              : <p className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group.label}</p>}
            <ul className="space-y-0.5">
              {group.ids.map(id => {
                const Icon = ICONS[id];
                const isActive = id === active;
                const badge = id === 'alerts' && alertCount > 0 ? alertCount : null;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onChange(id)}
                      aria-current={isActive ? 'page' : undefined}
                      title={collapsed ? DB_PAGES[id].label : undefined}
                      className={cn(
                        'relative flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md border-0 px-2 text-left text-[13px] transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                        isActive ? 'bg-primary/10 font-medium text-primary' : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                        collapsed && 'justify-center px-0',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{DB_PAGES[id].label}</span>}
                      {badge !== null && (
                        <span className={cn('rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-4 text-white', collapsed ? 'absolute top-0.5 right-0.5' : 'ml-auto')}>{badge}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn('flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground', collapsed && 'justify-center px-0')}
        >
          <ToggleIcon className="size-4" />
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
