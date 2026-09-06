import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GitBranch, ChevronDown, Download, Check } from 'lucide-react';
import { organizationStore } from '../../organization/services/organizationStore';
import { moduleForSection } from '../config/workspaceModules';

interface WorkspaceHeaderProps {
  repoInfo?: { owner: string; repo: string } | null;
  hasData: boolean;
  onPaletteOpen: () => void;
  onExport?: () => void;
  onGoHome?: () => void;
  currentBranch?: string;
  branches?: { name: string }[];
  branchLoading?: boolean;
  onBranchSwitch?: (branch: string) => void;
  activeSection: string;
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
        <span className="icon icon-m"><GitBranch size={14} strokeWidth={1.7} /></span>
        <span>{loading ? 'Switching…' : current}</span>
        <span className="icon icon-s chevron"><ChevronDown size={12} strokeWidth={1.9} /></span>
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
                <span className="icon icon-s">{branch.name === current ? <Check size={12} strokeWidth={2} /> : null}</span>{branch.name}
              </button>
            )) : <p>No branches found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkspaceHeader({
  repoInfo, hasData, onPaletteOpen, onExport, onGoHome,
  currentBranch, branches, branchLoading, onBranchSwitch,
  activeSection,
}: WorkspaceHeaderProps) {
  const navigate = useNavigate();
  const activeModule = moduleForSection(activeSection);
  const [projectLink, setProjectLink] = useState('/workspaces');
  useEffect(() => {
    if (!repoInfo) { setProjectLink('/workspaces'); return; }
    const fullName = `${repoInfo.owner}/${repoInfo.repo}`.toLowerCase();
    let cancelled = false;
    organizationStore.load().then(state => {
      if (cancelled) return;
      const project = state.projects.find(item => item.repositoryFullName?.toLowerCase() === fullName);
      setProjectLink(project ? `/workspaces/${project.workspaceId}/projects` : '/workspaces');
    });
    return () => { cancelled = true; };
  }, [repoInfo]);

  return (
    <header className="workspace-header">
      <div className="workspace-header-primary">
        <button className="workspace-brand" onClick={onGoHome} title="Choose another repository">
          <GitGraphMark />
          <span><strong>graphkeep</strong><small>workspace</small></span>
        </button>
        <nav className="workspace-breadcrumb" aria-label="Breadcrumb">
          <button onClick={() => navigate('/workspaces')}>Workspace</button>
          <span className="workspace-breadcrumb-sep">/</span>
          <button onClick={() => navigate(projectLink)}>Project</button>
          <span className="workspace-breadcrumb-sep">/</span>
          <span className="workspace-breadcrumb-current">{activeModule.label}</span>
        </nav>
      </div>

      {repoInfo && <span className="workspace-repo-identity workspace-repo-identity-center">{repoInfo.owner}<b>/</b>{repoInfo.repo}</span>}

      <div className="workspace-header-utilities">
        {hasData && onBranchSwitch && (
          <BranchPicker current={currentBranch || 'main'} branches={branches || []} loading={!!branchLoading} onSwitch={onBranchSwitch} />
        )}
        {onExport && (
          <button className="workspace-header-action" onClick={onExport}>
            <span className="icon icon-m"><Download size={14} strokeWidth={1.7} /></span>
            Export
          </button>
        )}
        <button className="workspace-search-bar" onClick={onPaletteOpen} disabled={!hasData} aria-label="Search">
          <span className="icon icon-m"><Search size={14} strokeWidth={1.8} /></span>
          <span className="workspace-search-placeholder">Search…</span>
          <kbd>⌘ K</kbd>
        </button>
      </div>
    </header>
  );
}
