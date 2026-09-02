import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BarChart3, FolderTree, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { appConfig } from '../../../app/config';
import { WORKSPACE_MODULES, moduleForSection } from '../config/workspaceModules';
import { accountMenuDismissHandlers, selectAccountSettings } from './WorkspaceHeader';

const API = appConfig.apiUrl;

const MODULE_ICONS = {
  overview: LayoutDashboard,
  explore: FolderTree,
  insights: BarChart3,
  quality: ShieldCheck,
  settings: Settings,
};

const SPRING_SNAPPY = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;
const staggerChildren = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } } };

interface WorkspaceSidebarProps {
  login: string;
  avatarUrl: string;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function WorkspaceSidebar({ login, avatarUrl, activeSection, onSectionChange }: WorkspaceSidebarProps) {
  const reduceMotion = useReducedMotion();
  const [signingOut, setSigningOut] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const activeModule = moduleForSection(activeSection);

  useEffect(() => {
    const dismiss = accountMenuDismissHandlers(accountRef, setAccountOpen);
    document.addEventListener('mousedown', dismiss.onMouseDown);
    document.addEventListener('keydown', dismiss.onKeyDown);
    return () => {
      document.removeEventListener('mousedown', dismiss.onMouseDown);
      document.removeEventListener('keydown', dismiss.onKeyDown);
    };
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      window.location.replace('/');
    }
  }

  return (
    <aside className="workspace-sidebar">
      <motion.nav className="workspace-navigation" aria-label="Workspace modules" initial="hidden" animate="show" variants={staggerChildren}>
        {WORKSPACE_MODULES.map(module => {
          const ModuleIcon = MODULE_ICONS[module.icon];
          const active = activeModule.id === module.id;
          return (
            <motion.button
              key={module.id}
              variants={fadeUp}
              className={`workspace-nav-item${active ? ' active' : ''}`}
              onClick={() => onSectionChange(module.defaultSection)}
              aria-current={active ? 'page' : undefined}
              title={module.description}
            >
              {active && <motion.span layoutId="workspace-nav-active" className="workspace-nav-active-indicator" transition={reduceMotion ? { duration: 0 } : SPRING_SNAPPY} />}
              <span className="workspace-nav-item-content">
                <ModuleIcon size={17} strokeWidth={1.8} />
                <span className="sidebar-inline-label">{module.label}</span>
              </span>
            </motion.button>
          );
        })}
      </motion.nav>

      <div className="workspace-sidebar-footer">
        <div className="workspace-account-anchor" ref={accountRef}>
          <button
            className="workspace-account"
            onClick={() => setAccountOpen(open => !open)}
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            aria-label="Open account menu"
          >
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <span aria-hidden="true"><UserRound size={16} /></span>}
            <span className="sidebar-inline-label"><strong>{login || 'Account'}</strong><small>Connected</small></span>
          </button>
          {accountOpen && (
            <div className="workspace-sidebar-account-menu" role="menu" aria-label="Account menu">
              <button role="menuitem" onClick={() => selectAccountSettings(onSectionChange, setAccountOpen)}>Account settings</button>
              <button role="menuitem" onClick={handleSignOut} disabled={signingOut}>
                <LogOut size={14} /> {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
