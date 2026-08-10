import { useEffect, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, FolderTree, LayoutDashboard, Settings, ShieldCheck } from 'lucide-react';
import { appConfig } from '../../../app/config';
import { WORKSPACE_MODULES, moduleForSection } from '../config/workspaceModules';

const API = appConfig.apiUrl;

interface WorkspaceHeaderProps {
  login: string;
  avatarUrl: string;
  hasData: boolean;
  onPaletteOpen: () => void;
  onExport?: () => void;
  onGoHome?: () => void;
  currentBranch?: string;
  branches?: { name: string }[];
  branchLoading?: boolean;
  onBranchSwitch?: (branch: string) => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const MODULE_ICONS = {
  overview: LayoutDashboard,
  explore: FolderTree,
  insights: BarChart3,
  quality: ShieldCheck,
  settings: Settings,
};

export function accountMenuDismissHandlers(
  accountRef: RefObject<HTMLDivElement | null>,
  setAccountOpen: (open: boolean) => void,
) {
  return {
    onMouseDown(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountOpen(false);
    },
  };
}

export function selectAccountSettings(
  onSectionChange: (section: string) => void,
  setAccountOpen: (open: boolean) => void,
) {
  onSectionChange('settings');
  setAccountOpen(false);
}

function GitGraphMark() {
  return (
    <span className="workspace-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 28 28" fill="none">
        <path d="M9 7v11.2a3.8 3.8 0 1 0 2 3.3V12l7 4.1v2.1a3.8 3.8 0 1 0 2-3.3L11 9.7V7A3.8 3.8 0 1 0 9 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function BranchPicker({ current, branches, loading, onSwitch }: {
  current: string;
  branches: { name: string }[];
  loading: boolean;
  onSwitch: (branch: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = branches.filter(branch => branch.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="workspace-branch-picker" ref={ref}>
      <button className={open ? 'open' : ''} onClick={() => setOpen(value => !value)}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3v10a3 3 0 0 0 3 3h2M14 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM14 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" /></svg>
        <span>{loading ? 'Switching…' : current}</span>
        <svg className="chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor"><path d="m1 1 4 4 4-4" /></svg>
      </button>
      {open && (
        <div className="workspace-branch-menu">
          <input autoFocus value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter branches…" />
          <div>
            {filtered.length ? filtered.map(branch => (
              <button
                key={branch.name}
                className={branch.name === current ? 'active' : ''}
                onClick={() => { onSwitch(branch.name); setOpen(false); setFilter(''); }}
              >
                <span>{branch.name === current ? '✓' : ''}</span>{branch.name}
              </button>
            )) : <p>No branches found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceHeader({
  login, avatarUrl, hasData, onPaletteOpen, onExport, onGoHome,
  currentBranch, branches, branchLoading, onBranchSwitch,
  activeSection, onSectionChange,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();
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
    <header className="workspace-header">
      <button className="workspace-brand" onClick={onGoHome || (() => navigate('/select-repo'))} title="Choose another repository">
        <GitGraphMark />
        <span><strong>gitgraph</strong><small>/workspace</small></span>
      </button>

      <nav className="workspace-primary-nav" aria-label="Workspace modules">
        {WORKSPACE_MODULES.map(module => {
          const ModuleIcon = MODULE_ICONS[module.icon];
          const active = activeModule.id === module.id;
          return (
            <button
              key={module.id}
              className={`workspace-primary-tab${active ? ' active' : ''}`}
              onClick={() => onSectionChange(module.defaultSection)}
              aria-current={active ? 'page' : undefined}
              title={module.description}
            >
              <ModuleIcon size={16} strokeWidth={1.8} />
              <span>{module.label}</span>
            </button>
          );
        })}
      </nav>

      {hasData && onBranchSwitch && (
        <BranchPicker current={currentBranch || 'main'} branches={branches || []} loading={!!branchLoading} onSwitch={onBranchSwitch} />
      )}

      <div className="workspace-header-spacer" />

      <button className="workspace-command-button" onClick={onPaletteOpen} disabled={!hasData}>
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg>
        <span className="workspace-command-label">Search code</span><kbd>⌘ K</kbd>
      </button>

      {onExport && (
        <button className="workspace-header-action" onClick={onExport}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M10 3v9m-3-3 3 3 3-3M4 13v4h12v-4" /></svg>
          Export
        </button>
      )}

      <div className="workspace-account" ref={accountRef}>
        <button
          className="workspace-account-trigger"
          onClick={() => setAccountOpen(open => !open)}
          aria-expanded={accountOpen}
          aria-haspopup="menu"
        >
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{login?.[0]?.toUpperCase() || 'U'}</span>}
          <strong>{login || 'GitHub user'}</strong>
          <svg className="chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor"><path d="m1 1 4 4 4-4" /></svg>
        </button>
        {accountOpen && (
          <div className="workspace-account-menu" role="menu" aria-label="Account menu">
            <div className="workspace-account-summary">
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{login?.[0]?.toUpperCase() || 'U'}</span>}
              <div><strong>{login || 'GitHub user'}</strong><small>Connected</small></div>
            </div>
            <button role="menuitem" onClick={() => selectAccountSettings(onSectionChange, setAccountOpen)}>Account settings</button>
            <button role="menuitem" className="danger" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
