import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GitBranch, ChevronDown, Check } from 'lucide-react';
import { organizationStore } from '../../organization/services/organizationStore';
import { moduleForSection } from '../config/workspaceModules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface WorkspaceHeaderProps {
  repoInfo?: { owner: string; repo: string } | null;
  hasData: boolean;
  onPaletteOpen: () => void;
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
      <Button variant="ghost" className={open ? 'open' : ''} onClick={() => setOpen(value => !value)}>
        <span className="icon icon-m"><GitBranch size={14} strokeWidth={1.7} /></span>
        <span>{loading ? 'Switching…' : current}</span>
        <span className="icon icon-s chevron"><ChevronDown size={12} strokeWidth={1.9} /></span>
      </Button>
      {open && (
        <div className="workspace-branch-menu">
          <Input autoFocus value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter branches…" />
          <div>
            {filtered.length ? filtered.map(branch => (
              <Button
                variant="ghost"
                key={branch.name}
                className={branch.name === current ? 'active' : ''}
                onClick={() => { onSwitch(branch.name); setOpen(false); setFilter(''); }}
              >
                <span className="icon icon-s">{branch.name === current ? <Check size={12} strokeWidth={2} /> : null}</span>{branch.name}
              </Button>
            )) : <p>No branches found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

const SEARCH_PHRASE = 'Search files, functions, patterns…';

function SearchControl({ disabled, onOpen }: { disabled: boolean; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) { setTyped(''); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTyped(SEARCH_PHRASE); return; }
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setTyped(SEARCH_PHRASE.slice(0, count));
      if (count >= SEARCH_PHRASE.length) window.clearInterval(timer);
    }, 26);
    return () => window.clearInterval(timer);
  }, [open]);

  return (
    <Button
      variant="ghost"
      className={`workspace-search-bar${open ? ' open' : ''}`}
      onClick={onOpen}
      disabled={disabled}
      aria-label="Search"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span className="icon icon-m"><Search size={14} strokeWidth={1.8} /></span>
      <span className="workspace-search-reveal">
        <span className="workspace-search-placeholder">
          {typed}
          {typed.length < SEARCH_PHRASE.length && <i className="workspace-search-caret" />}
        </span>
        <kbd>⌘ K</kbd>
      </span>
    </Button>
  );
}

export default function WorkspaceHeader({
  repoInfo, hasData, onPaletteOpen, onGoHome,
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
        <Button variant="ghost" className="workspace-brand" onClick={onGoHome} title="Structrace home">
          <GitGraphMark />
          <span><strong>structrace</strong><small>workspace</small></span>
        </Button>
        <nav className="workspace-breadcrumb" aria-label="Breadcrumb">
          <Button variant="ghost" onClick={() => navigate('/workspaces')}>Workspace</Button>
          <span className="workspace-breadcrumb-sep">/</span>
          <Button variant="ghost" onClick={() => navigate(projectLink)}>Project</Button>
          <span className="workspace-breadcrumb-sep">/</span>
          <span className="workspace-breadcrumb-current">{activeModule.label}</span>
        </nav>
      </div>

      {repoInfo && <span className="workspace-repo-identity workspace-repo-identity-center">{repoInfo.owner}<b>/</b>{repoInfo.repo}</span>}

      <div className="workspace-header-utilities">
        <SearchControl disabled={!hasData} onOpen={onPaletteOpen} />
        {hasData && onBranchSwitch && (
          <BranchPicker current={currentBranch || 'main'} branches={branches || []} loading={!!branchLoading} onSwitch={onBranchSwitch} />
        )}
      </div>
    </header>
  );
}
