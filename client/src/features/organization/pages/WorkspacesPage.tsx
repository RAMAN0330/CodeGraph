import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, Database, FolderKanban, GitBranch, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { organizationStore, type OrganizationState, type Workspace } from '../services/organizationStore';
import { peekPendingRepository } from '../services/pendingRepository';
import { relativeTime } from '../services/relativeTime';
import { TopbarSearch } from '../components/TopbarSearch';
import { TopbarAccount } from '../components/TopbarAccount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import './OrganizationPages.css';

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<OrganizationState>({ workspaces: [], projects: [] });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState(''); const [name, setName] = useState(''); const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pendingRepository = peekPendingRepository();
  const workspaces = state.workspaces;
  const refresh = () => organizationStore.load()
    .then(next => { setState(next); setLoadError(''); })
    .catch(() => setLoadError('Workspaces could not be loaded. Check your connection and try again.'))
    .finally(() => setLoaded(true));
  useEffect(() => { refresh(); }, []);
  const visible = useMemo(() => workspaces.filter(workspace => workspace.name.toLowerCase().includes(query.trim().toLowerCase())), [query, workspaces]);
  const projectsFor = (workspaceId: number) => state.projects.filter(project => project.workspaceId === workspaceId);
  const openCreate = () => { setName(''); setError(''); dialog.current?.showModal(); };
  const createWorkspace = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError('Give the workspace a name.'); return; }
    organizationStore.createWorkspace(name)
      .then(workspace => { dialog.current?.close(); navigate(`/workspaces/${workspace.id}/projects`); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not create workspace.'));
  };
  const askDelete = (workspace: Workspace) => { setPendingDelete(workspace); deleteDialog.current?.showModal(); };
  const closeDelete = () => { deleteDialog.current?.close(); setPendingDelete(null); };
  const confirmDelete = () => {
    if (!pendingDelete) return;
    setDeleting(true);
    organizationStore.removeWorkspace(pendingDelete.id)
      .then(refresh)
      .finally(() => { setDeleting(false); closeDelete(); });
  };
  const pendingProjectCount = pendingDelete ? projectsFor(pendingDelete.id).length : 0;

  return <main className="organization-page workspace-details-page">
    <header className="organization-topbar workspace-details-topbar"><div className="organization-brand"><span className="organization-brand-mark"><GitBranch size={20} /></span><strong>Structrace</strong><span className="organization-brand-divider" /><em>Workspaces</em></div><div className="topbar-actions"><TopbarSearch value={query} onChange={setQuery} placeholder="Search workspaces" className="topbar-search-slot" /><TopbarAccount /></div></header>
    {pendingRepository && workspaces.length > 0 && <p className="pending-repository-banner" role="status"><GitBranch size={15} aria-hidden="true" /><span>Open a workspace to add <strong>{pendingRepository}</strong> as a project.</span></p>}
    {loadError && <p className="organization-error organization-load-error" role="alert">{loadError} <Button variant="link" onClick={() => { setLoaded(false); refresh(); }}>Retry</Button></p>}
    {!loaded ? <section className="workspace-catalog" aria-busy="true"><div className="workspace-grid">{[0, 1, 2].map(key => <div key={key} className="workspace-card workspace-card-skeleton" />)}</div></section>
      : !workspaces.length && !loadError ? <section className="workspace-empty-page"><div className="empty-state-card"><span><Building2 size={34} /></span><h1>Start your first workspace</h1><p>{pendingRepository ? <>Create a workspace, then add <strong>{pendingRepository}</strong> as its first project.</> : 'Create a focused home for your projects and repository analysis.'}</p><Button className="projects-primary-action" onClick={openCreate}><Plus size={16} /> Create workspace</Button><ul className="empty-state-points"><li><CheckCircle2 size={15} /> Group repositories by team or initiative</li><li><CheckCircle2 size={15} /> Track architecture, ownership, and risk in one place</li><li><CheckCircle2 size={15} /> Keep a member list on each project</li></ul></div></section>
      : <section className="workspace-catalog">
        <div className="workspace-catalog-heading">
          <div><h1>Workspaces</h1><p>{plural(workspaces.length, 'workspace')} · {plural(state.projects.length, 'project')} across them.</p></div>
          <Button className="projects-primary-action" onClick={openCreate}><Plus size={16} /> New workspace</Button>
        </div>
        <div className="workspace-grid" aria-label="Workspace list">
          {visible.map((workspace, index) => {
            const projects = projectsFor(workspace.id);
            const codebases = projects.filter(project => project.projectType !== 'database').length;
            const databases = projects.length - codebases;
            return <motion.article key={workspace.id} className="workspace-card" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .28, delay: index * .04, ease: [0.16, 1, 0.3, 1] }}>
              <button type="button" className="workspace-card-link" onClick={() => navigate(`/workspaces/${workspace.id}/projects`)} aria-label={`Open ${workspace.name}, ${plural(projects.length, 'project')}`}>
                <span className="workspace-card-head">
                  <span className="project-list-icon"><Building2 size={19} /></span>
                  <span className="workspace-card-title"><strong>{workspace.name}</strong><small>Created {relativeTime(workspace.createdAt).toLowerCase()}</small></span>
                </span>
                <span className="workspace-card-counts">
                  <span><FolderKanban size={14} aria-hidden="true" />{plural(codebases, 'codebase')}</span>
                  <span><Database size={14} aria-hidden="true" />{plural(databases, 'database')}</span>
                </span>
                <span className="workspace-card-projects">
                  {projects.length
                    ? projects.slice(0, 3).map(project => <span key={project.id}>{project.name}</span>)
                    : <em>No projects yet</em>}
                  {projects.length > 3 && <span>+{projects.length - 3} more</span>}
                </span>
                <span className="workspace-card-open">Open <ArrowRight size={14} aria-hidden="true" /></span>
              </button>
              {workspace.canDelete && <Button className="project-delete-button workspace-card-delete" aria-label={`Delete ${workspace.name}`} onClick={() => askDelete(workspace)}><Trash2 size={15} /></Button>}
            </motion.article>;
          })}
        </div>
        {!visible.length && <p className="organization-empty">No workspace matches “{query}”.</p>}
      </section>}
    <dialog ref={dialog} className="organization-dialog"><form onSubmit={createWorkspace}><h2>New workspace</h2><p>Create a home for projects and their connected repositories.</p><div className="organization-field"><Label htmlFor="workspace-name-input">Workspace name</Label><Input id="workspace-name-input" autoFocus value={name} placeholder="Platform team" onChange={event => { setName(event.target.value); setError(''); }} /></div>{error && <p className="organization-error" role="alert">{error}</p>}<div className="organization-dialog-actions"><Button className="dialog-cancel" type="button" onClick={() => dialog.current?.close()}>Cancel</Button><Button className="projects-primary-action">Create workspace</Button></div></form></dialog>
    <dialog ref={deleteDialog} className="organization-dialog delete-project-dialog" onCancel={closeDelete}>
      <div>
        <Button type="button" className="dialog-close-button" aria-label="Close" onClick={closeDelete}><X size={16} /></Button>
        <div className="delete-dialog-heading">
          <span className="project-dialog-mark project-dialog-mark-danger"><AlertTriangle size={22} /></span>
          <div><h2>Delete workspace</h2><p className="delete-dialog-subtitle">This action is permanent and cannot be undone.</p></div>
        </div>
        <div className="delete-dialog-warning"><AlertTriangle size={16} /><span>Deleting <strong>{pendingDelete?.name}</strong> also deletes {pendingProjectCount ? plural(pendingProjectCount, 'project') : 'its projects'} and their saved connections.</span></div>
        <div className="organization-dialog-actions">
          <Button className="dialog-cancel" type="button" onClick={closeDelete}>Cancel</Button>
          <Button className="dialog-danger-action" type="button" disabled={deleting} onClick={confirmDelete}><Trash2 size={15} /> {deleting ? 'Deleting…' : 'Delete workspace'}</Button>
        </div>
      </div>
    </dialog>
  </main>;
}
