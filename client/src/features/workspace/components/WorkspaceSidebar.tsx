import { BarChart3, FolderTree, LayoutDashboard, ListChecks, Network, Settings, Shapes, ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import AccountMenu from '../../../shared/components/AccountMenu';
import { WORKSPACE_MODULES, moduleForSection } from '../config/workspaceModules';

const MODULE_ICONS = {
  overview: LayoutDashboard,
  explore: FolderTree,
  insights: BarChart3,
  architecture: Network,
  security: ShieldAlert,
  patterns: Shapes,
  actions: ListChecks,
  quality: ShieldCheck,
  settings: Settings,
};

/** Settings is reachable only via the account menu, not as its own nav icon. */
const NAV_MODULES = WORKSPACE_MODULES.filter(module => module.id !== 'settings');

const SPRING_SNAPPY = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;
const staggerChildren = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } } };

interface WorkspaceSidebarProps {
  login: string;
  avatarUrl: string;
  activeSection: string;
  hasData?: boolean;
  onSectionChange: (section: string) => void;
}

export default function WorkspaceSidebar({ login, avatarUrl, activeSection, hasData, onSectionChange }: WorkspaceSidebarProps) {
  const reduceMotion = useReducedMotion();
  const activeModule = moduleForSection(activeSection);

  return (
    <aside className="workspace-sidebar">
      <motion.nav className="workspace-navigation" aria-label="Workspace modules" initial="hidden" animate="show" variants={staggerChildren}>
        {NAV_MODULES.map(module => {
          const ModuleIcon = MODULE_ICONS[module.icon];
          const active = activeModule.id === module.id;
          const expandable = module.tools.length > 1;
          return (
            <motion.div key={module.id} variants={fadeUp} className="workspace-nav-group">
              <button
                className={`workspace-nav-item${active ? ' active' : ''}`}
                onClick={() => onSectionChange(module.defaultSection)}
                aria-current={active ? 'page' : undefined}
                aria-expanded={expandable ? active : undefined}
                title={module.description}
              >
                {active && <motion.span layoutId="workspace-nav-active" className="workspace-nav-active-indicator" transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY} />}
                <span className="workspace-nav-item-content">
                  <ModuleIcon size={17} strokeWidth={1.8} />
                  <span className="sidebar-inline-label">{module.label}</span>
                </span>
              </button>

              {expandable && active && (
                <div className="workspace-nav-sublist">
                  {module.tools.map(tool => {
                    const disabled = !!tool.requiresData && !hasData;
                    return (
                      <button
                        key={tool.id}
                        className={`workspace-nav-subitem${activeSection === tool.id ? ' active' : ''}`}
                        disabled={disabled}
                        onClick={() => !disabled && onSectionChange(tool.id)}
                        title={disabled ? 'Analyze a repository first' : tool.description}
                      >
                        {tool.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })}
      </motion.nav>

      <div className="workspace-sidebar-footer">
        <AccountMenu
          variant="sidebar"
          login={login}
          avatarUrl={avatarUrl}
          active={activeSection === 'settings'}
          menuItems={[{ label: 'Settings', icon: <Settings size={14} strokeWidth={1.9} />, onClick: () => onSectionChange('settings') }]}
        />
      </div>
    </aside>
  );
}
