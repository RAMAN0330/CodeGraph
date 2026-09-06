import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Building2, GitBranch, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { organizationStore, type Workspace } from '../services/organizationStore';
import { TopbarSearch } from '../components/TopbarSearch';
import { TopbarAccount } from '../components/TopbarAccount';
import './OrganizationPages.css';

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const reduceMotion = useReducedMotion();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [query, setQuery] = useState(''); const [name, setName] = useState(''); const [error, setError] = useState('');
  const refresh = () => organizationStore.load().then(state => setWorkspaces(state.workspaces));
  useEffect(() => { refresh(); }, []);
  const visible = useMemo(() => workspaces.filter(workspace => workspace.name.toLowerCase().includes(query.trim().toLowerCase())), [query, workspaces]);
  const createWorkspace = (event: React.FormEvent) => {
    event.preventDefault();
    organizationStore.createWorkspace(name)
      .then(workspace => { refresh(); dialog.current?.close(); navigate(`/workspaces/${workspace.id}/projects`); })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Could not create workspace.'));
  };
  const deleteWorkspace = (workspace: { id: number; name: string }) => {
    if (!window.confirm(`Delete “${workspace.name}” and all of its projects? This can't be undone.`)) return;
    organizationStore.removeWorkspace(workspace.id).then(refresh);
  };
  return <main className="organization-page workspace-details-page">
    <header className="organization-topbar workspace-details-topbar"><div className="organization-brand"><span className="organization-brand-mark"><GitBranch size={20} /></span><strong>GraphKeep</strong><span className="organization-brand-divider" /><em>Workspaces</em></div><div className="topbar-actions"><TopbarSearch value={query} onChange={setQuery} placeholder="Search workspaces" className="topbar-search-slot" /><TopbarAccount /></div></header>
    {!workspaces.length ? <section className="workspace-empty-page"><span><Building2 size={34} /></span><h1>Start your first workspace</h1><p>Create a focused home for your projects and repository analysis.</p><button className="projects-primary-action" onClick={() => dialog.current?.showModal()}><Plus size={16} /> Create workspace</button></section> : <section className="workspace-catalog"><div className="workspace-catalog-heading"><div><h1>Your workspaces</h1><p>Select a workspace to view its projects and connected repositories.</p></div><button className="workspace-create-button" aria-label="Create workspace" onClick={() => dialog.current?.showModal()}><Plus size={18} /><span>Create workspace</span></button></div><div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }} aria-label="Workspace list">{visible.map((workspace, index) => <motion.div key={workspace.id} className="project-list-row" style={{ width: '100%' }} initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .28, delay: index * .04 }}>
      <button className="project-list-item" onClick={() => navigate(`/workspaces/${workspace.id}/projects`)}>
        <span className="project-list-icon"><Building2 size={20} /></span>
        <span className="project-list-copy"><strong>{workspace.name}</strong><small>Project workspace</small></span>
      </button>
      <span className="project-row-actions">
        <button className="project-delete-button" aria-label={`Delete ${workspace.name}`} onClick={() => deleteWorkspace(workspace)}><Trash2 size={16} /></button>
        <button className="project-row-open-button" aria-label={`Open ${workspace.name}`} onClick={() => navigate(`/workspaces/${workspace.id}/projects`)}>Open <ArrowRight size={15} /></button>
      </span>
    </motion.div>)}</div>{!visible.length && <p className="organization-empty">No workspace matches “{query}”.</p>}</section>}
    <dialog ref={dialog} className="organization-dialog"><form onSubmit={createWorkspace}><h2>New workspace</h2><p>Create a home for projects and their connected repositories.</p><label className="organization-field">Workspace name<input autoFocus value={name} onChange={event => setName(event.target.value)} /></label>{error && <p className="organization-error">{error}</p>}<div className="organization-dialog-actions"><button className="dialog-cancel" type="button" onClick={() => dialog.current?.close()}>Cancel</button><button className="projects-primary-action">Create workspace</button></div></form></dialog>
  </main>;
}
