import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, FolderKanban, GitBranch, Plus, ShieldAlert, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { appConfig } from '../../../app/config';
import { Avatar } from '../../../components/ui/avatar';
import { organizationStore, type Project } from '../services/organizationStore';
import { TopbarSearch } from '../components/TopbarSearch';
import { TopbarAccount } from '../components/TopbarAccount';
import './OrganizationPages.css';

type Repository = { full_name: string };
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;

function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.round(diffMonths / 12)}y ago`;
}

export default function ProjectsPage() {
  const navigate = useNavigate(); const { workspaceId = '' } = useParams(); const dialog = useRef<HTMLDialogElement>(null); const deleteDialog = useRef<HTMLDialogElement>(null); const reduceMotion = useReducedMotion();
  const [state, setState] = useState(() => organizationStore.load()); const [query, setQuery] = useState(''); const [name, setName] = useState(''); const [instructions, setInstructions] = useState(''); const [repositoryFullName, setRepositoryFullName] = useState(''); const [repositories, setRepositories] = useState<Repository[]>([]); const [verified, setVerified] = useState(false); const [message, setMessage] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null); const [deleteConfirmText, setDeleteConfirmText] = useState(''); const [deleteError, setDeleteError] = useState('');
  const [inviteEmail, setInviteEmail] = useState(''); const [inviteMessage, setInviteMessage] = useState(''); const [inviteError, setInviteError] = useState(false);
  const workspace = state.workspaces.find(item => item.id === workspaceId); const projects = state.projects.filter(project => project.workspaceId === workspaceId); const visible = useMemo(() => projects.filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);
  const selected = projects.find(project => project.id === selectedProjectId) || projects[0];
  useEffect(() => { if (!workspace) navigate('/workspaces', { replace: true }); }, [navigate, workspace]);
  useEffect(() => { if (selected && selected.id !== selectedProjectId) setSelectedProjectId(selected.id); }, [selected, selectedProjectId]);
  const refresh = () => setState(organizationStore.load());
  const openDialog = async () => { setMessage(''); setVerified(false); dialog.current?.showModal(); try { const response = await fetch(`${appConfig.apiUrl}/api/github/repos`, { credentials: 'include' }); const data = response.ok ? await response.json() : { repos: [] }; setRepositories(data.repos ?? []); } catch { setRepositories([]); } };
  const verifyRepository = () => { const candidate = repositoryFullName.trim(); if (!repositoryPattern.test(candidate)) { setMessage('Enter the repository as owner/repository.'); setVerified(false); return; } if (repositories.length && !repositories.some(repo => repo.full_name.toLowerCase() === candidate.toLowerCase())) { setMessage('That repository is not available from your GitHub connection.'); setVerified(false); return; } setMessage(`Verified ${candidate}`); setVerified(true); };
  const createProject = (event: React.FormEvent) => { event.preventDefault(); if (!verified) { setMessage('Verify a repository before creating this project.'); return; } try { const project = organizationStore.createProject({ workspaceId, name, instructions, repositoryFullName }); refresh(); setSelectedProjectId(project.id); dialog.current?.close(); setName(''); setInstructions(''); setRepositoryFullName(''); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not create project.'); } };
  const openProject = (project: Project) => navigate(`/workspace?repo=${encodeURIComponent(project.repositoryFullName)}&run=1`);
  const deleteProject = (project: Project) => {
    setPendingDelete(project); setDeleteConfirmText(''); setDeleteError('');
    deleteDialog.current?.showModal();
  };
  const cancelDeleteProject = () => { deleteDialog.current?.close(); setPendingDelete(null); setDeleteConfirmText(''); setDeleteError(''); };
  const confirmDeleteProject = (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingDelete) return;
    if (deleteConfirmText.trim() !== pendingDelete.name) { setDeleteError('That name doesn’t match. Type it exactly to confirm.'); return; }
    organizationStore.removeProject(pendingDelete.id);
    refresh();
    if (selectedProjectId === pendingDelete.id) setSelectedProjectId('');
    deleteDialog.current?.close();
    setPendingDelete(null); setDeleteConfirmText(''); setDeleteError('');
  };
  const inviteMember = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try { organizationStore.inviteMember(selected.id, inviteEmail); refresh(); setInviteEmail(''); setInviteMessage('Invited.'); setInviteError(false); }
    catch (cause) { setInviteMessage(cause instanceof Error ? cause.message : 'Could not invite this person.'); setInviteError(true); }
  };
  const removeMember = (memberId: string) => { if (!selected) return; organizationStore.removeMember(selected.id, memberId); refresh(); };
  if (!workspace) return null;
  return <main className="organization-page project-picker-page">
    <header className="organization-topbar"><div className="organization-brand"><span className="organization-brand-mark"><GitBranch size={20} /></span><button className="picker-back" onClick={() => navigate('/workspaces')}><ArrowLeft size={15} /> Workspaces</button><span className="organization-brand-divider">/</span><strong>Projects</strong></div><div className="topbar-actions"><TopbarSearch value={query} onChange={setQuery} placeholder="Search projects" className="topbar-search-slot" /><TopbarAccount /></div></header>
    {!projects.length ? <section className="workspace-empty-page"><span><FolderKanban size={34} /></span><h1>Start your first project</h1><p>Attach a verified GitHub repository to begin organizing work inside {workspace.name}.</p><button className="projects-primary-action" onClick={() => void openDialog()}><Plus size={16} /> Create project</button></section> : <section className="project-workspace-layout">
      <aside className="project-list-panel">
        <div className="project-list-heading"><h2>Projects</h2><button className="project-create-pill" aria-label="Create project" onClick={() => void openDialog()}><Plus size={16} /><span className="project-create-pill-label">New project</span></button></div>
        <nav className="project-list" aria-label="Your projects">{visible.map(project => <div key={project.id} className="project-list-row">
          <button className={`project-list-item${project.id === selected?.id ? ' is-selected' : ''}`} onClick={() => setSelectedProjectId(project.id)} aria-current={project.id === selected?.id}>
            <span className="project-list-icon"><FolderKanban size={20} /></span>
            <span className="project-list-copy"><strong>{project.name}</strong><small>{project.repositoryFullName}</small></span>
          </button>
          <span className="project-row-actions">
            <button className="project-delete-button" aria-label={`Delete ${project.name}`} onClick={() => deleteProject(project)}><Trash2 size={16} /></button>
            <button className="project-row-open-button" aria-label={`Open ${project.name}`} onClick={() => openProject(project)}>Open <ArrowRight size={15} /></button>
          </span>
        </div>)}</nav>
        {!visible.length && <p className="organization-empty">No project matches “{query}”.</p>}
      </aside>
      {selected && <motion.article className="project-detail-panel" key={selected.id} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .22 }}>
        <header className="project-detail-header">
          <div className="project-detail-title"><span className="organization-card-mark"><FolderKanban size={21} /></span><div><h1>{selected.name}</h1><p>{selected.repositoryFullName}</p></div></div>
          <button className="projects-primary-action" onClick={() => openProject(selected)}>Open workspace <ArrowRight size={16} /></button>
        </header>
        <div className="project-meta-grid">
          <div><CalendarDays size={18} /><span><small>Created</small><strong>{relativeTime(selected.createdAt)}</strong></span></div>
          <div><GitBranch size={18} /><span><small>Repository</small><strong>{selected.repositoryFullName}</strong></span></div>
          <div><Users size={18} /><span><small>Members</small><strong>{selected.members.length + 1}</strong></span></div>
        </div>
        <div className="project-members-section">
          <div className="project-section-title"><h2>Project members</h2></div>
          <div className="project-member-stack">
            <Avatar seed="you" className="project-member-avatar" />
            {selected.members.map(member => <span key={member.id} className="project-member-row"><Avatar seed={member.email} className="project-member-avatar" /><small>{member.email}</small><button className="project-delete-button" aria-label={`Remove ${member.email}`} onClick={() => removeMember(member.id)}><Trash2 size={13} /></button></span>)}
          </div>
          <form className="project-invite-form" onSubmit={inviteMember}>
            <UserPlus size={16} />
            <input type="email" placeholder="teammate@company.com" value={inviteEmail} onChange={event => { setInviteEmail(event.target.value); setInviteMessage(''); }} />
            <button className="projects-primary-action" type="submit">Invite</button>
          </form>
          {inviteMessage && <p className={inviteError ? 'organization-error' : 'organization-success'}>{inviteMessage}</p>}
        </div>
      </motion.article>}
    </section>}
    <dialog ref={deleteDialog} className="organization-dialog delete-project-dialog" onCancel={cancelDeleteProject}>
      <form onSubmit={confirmDeleteProject}>
        <button type="button" className="dialog-close-button" aria-label="Close" onClick={cancelDeleteProject}><X size={16} /></button>
        <div className="delete-dialog-heading">
          <span className="project-dialog-mark project-dialog-mark-danger"><AlertTriangle size={22} /></span>
          <div><h2>Delete project</h2><p className="delete-dialog-subtitle">This action is permanent and cannot be undone.</p></div>
        </div>
        <div className="delete-dialog-target">
          <span className="project-list-icon"><FolderKanban size={18} /></span>
          <span className="project-list-copy"><strong>{pendingDelete?.name}</strong><small>{pendingDelete?.repositoryFullName}</small></span>
        </div>
        <div className="delete-dialog-warning"><ShieldAlert size={16} /><span>Deleting this project removes it, its members, and its link to <strong>{pendingDelete?.repositoryFullName}</strong> from this workspace.</span></div>
        <label className="organization-field">Type <strong>{pendingDelete?.name}</strong> to confirm
          <span className="delete-dialog-confirm-input">
            <input autoFocus value={deleteConfirmText} onChange={event => { setDeleteConfirmText(event.target.value); setDeleteError(''); }} placeholder={pendingDelete?.name} autoComplete="off" spellCheck={false} />
            {!!pendingDelete && deleteConfirmText.trim() === pendingDelete.name && <CheckCircle2 size={16} className="delete-dialog-confirm-check" />}
          </span>
        </label>
        {deleteError && <p className="organization-error">{deleteError}</p>}
        <div className="organization-dialog-actions">
          <button className="dialog-cancel" type="button" onClick={cancelDeleteProject}>Cancel</button>
          <button className="dialog-danger-action" type="submit" disabled={!pendingDelete || deleteConfirmText.trim() !== pendingDelete.name}><Trash2 size={15} /> Delete project</button>
        </div>
      </form>
    </dialog>
    <dialog ref={dialog} className="organization-dialog project-create-dialog"><form onSubmit={createProject}><span className="project-dialog-mark"><FolderKanban size={22} /></span><h2>Create project</h2><p>Attach a verified GitHub repository before opening GraphKeep analysis.</p><label className="organization-field">Project name<input autoFocus value={name} onChange={event => setName(event.target.value)} /></label><label className="organization-field">Project instructions <small>Optional</small><textarea value={instructions} onChange={event => setInstructions(event.target.value)} /></label><label className="organization-field">Connect repository<input list="project-repositories" placeholder="owner/repository" value={repositoryFullName} onChange={event => { setRepositoryFullName(event.target.value); setVerified(false); setMessage(''); }} /></label><datalist id="project-repositories">{repositories.map(repo => <option key={repo.full_name} value={repo.full_name} />)}</datalist><button className="verify-repository-button" type="button" onClick={verifyRepository}>Verify repository</button>{message && <p className={verified ? 'organization-success' : 'organization-error'}>{message}</p>}<div className="organization-dialog-actions"><button className="dialog-cancel" type="button" onClick={() => dialog.current?.close()}>Cancel</button><button className="projects-primary-action" disabled={!verified}>Create project</button></div></form></dialog>
  </main>;
}
