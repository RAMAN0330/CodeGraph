import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CalendarDays, Check, CheckCircle2, Database, FolderKanban, GitBranch, Loader, Plus, ShieldAlert, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { appConfig } from '../../../app/config';
import { Avatar } from '../../../components/ui/avatar';
import { organizationStore, type DbConnectionInput, type OrganizationState, type Project, type ProjectType } from '../services/organizationStore';
import { TopbarSearch } from '../components/TopbarSearch';
import { TopbarAccount } from '../components/TopbarAccount';
import { GG, ggInput, ggLabel, MiniSchemaPreview, GGErrorBanner } from '../../database/components/dbConnectTheme';
import './OrganizationPages.css';

const gg = {
  panel: (): React.CSSProperties => ({ background: GG.bg, color: GG.fg, fontFamily: GG.sans, margin: -26, padding: 26, borderRadius: 14 }),
  backLink: (): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${GG.lineStrong}`, borderRadius: 8, color: GG.fg3, font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '8px 13px', flex: '0 0 auto' }),
  mark: (): React.CSSProperties => ({ display: 'grid', placeItems: 'center', width: 44, height: 44, flex: '0 0 auto', color: GG.accent, border: `1px solid ${GG.lineStrong}`, borderRadius: 12, background: `${GG.accent}0d` }),
  headerRow: (): React.CSSProperties => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 14 }),
  titleBlock: (): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }),
  titleCopy: (): React.CSSProperties => ({ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }),
  h2: (): React.CSSProperties => ({ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: GG.fg, fontFamily: GG.mono, whiteSpace: 'nowrap' }),
  p: (): React.CSSProperties => ({ margin: 0, color: GG.fg3, fontSize: 13, lineHeight: 1.55 }),
  fieldRow: (): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '18px 0' }),
  gridWrap: (): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: '228px 1fr 288px', gap: 1, background: GG.lineStrong, borderRadius: 12, overflow: 'hidden', border: `1px solid ${GG.lineStrong}` }),
  col: (bg: string): React.CSSProperties => ({ background: bg, padding: '22px 19px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, overflow: 'hidden' }),
  kicker: (): React.CSSProperties => ({ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '0.1em' }),
  tile: (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
    background: active ? `${GG.accent}18` : 'transparent',
    border: `1px solid ${active ? GG.accent + '44' : 'transparent'}`,
    borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', font: 'inherit', width: '100%', minWidth: 0, boxSizing: 'border-box',
  }),
  tileDisabled: (): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
    background: 'transparent', border: '1px solid transparent', borderRadius: 8,
    cursor: 'not-allowed', textAlign: 'left', font: 'inherit', width: '100%', opacity: 0.45,
  }),
  actionButton: (disabled: boolean): React.CSSProperties => ({
    height: 40, border: disabled ? `1px solid ${GG.lineStrong}` : 'none', borderRadius: 8, fontFamily: GG.mono, fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: disabled ? GG.bg1 : GG.accent, color: disabled ? GG.fg2 : '#181a1f', cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  sideCard: (): React.CSSProperties => ({ background: GG.bg2, borderRadius: 8, border: `1px solid ${GG.line}`, padding: '12px 14px' }),
  sideCardTitle: (): React.CSSProperties => ({ fontFamily: GG.mono, fontSize: 10, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }),
};

type Repository = { full_name: string };
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;

function projectSubtitle(project: Project): string {
  if (project.projectType === 'database' && project.dbConnectionSummary) {
    const { dbType, host, database } = project.dbConnectionSummary;
    return `${dbType}://${host}/${database}`;
  }
  return project.repositoryFullName || '—';
}

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
  const numericWorkspaceId = Number(workspaceId);
  const [state, setState] = useState<OrganizationState>({ workspaces: [], projects: [] }); const [query, setQuery] = useState(''); const [name, setName] = useState(''); const [instructions, setInstructions] = useState(''); const [repositoryFullName, setRepositoryFullName] = useState(''); const [repositories, setRepositories] = useState<Repository[]>([]); const [verified, setVerified] = useState(false); const [message, setMessage] = useState('');
  const [projectTypeStep, setProjectTypeStep] = useState<ProjectType | null>(null);
  const [dbType, setDbType] = useState<'postgres' | 'mysql'>('postgres'); const [dbHost, setDbHost] = useState('localhost'); const [dbPort, setDbPort] = useState('5432'); const [dbDatabase, setDbDatabase] = useState(''); const [dbUser, setDbUser] = useState(''); const [dbPassword, setDbPassword] = useState(''); const [dbSsl, setDbSsl] = useState(false);
  const [dbTesting, setDbTesting] = useState(false); const [dbVerified, setDbVerified] = useState(false); const [dbMessage, setDbMessage] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null); const [deleteConfirmText, setDeleteConfirmText] = useState(''); const [deleteError, setDeleteError] = useState('');
  const [inviteEmail, setInviteEmail] = useState(''); const [inviteMessage, setInviteMessage] = useState(''); const [inviteError, setInviteError] = useState(false);
  const workspace = state.workspaces.find(item => item.id === numericWorkspaceId); const projects = state.projects.filter(project => project.workspaceId === numericWorkspaceId); const visible = useMemo(() => projects.filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);
  const selected = projects.find(project => project.id === selectedProjectId) || projects[0];
  const refresh = () => organizationStore.load().then(setState);
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (state.workspaces.length && !workspace) navigate('/workspaces', { replace: true }); }, [navigate, workspace, state.workspaces.length]);
  useEffect(() => { if (selected && selected.id !== selectedProjectId) setSelectedProjectId(selected.id); }, [selected, selectedProjectId]);
  const openDialog = async () => {
    setMessage(''); setVerified(false); setProjectTypeStep(null); setName(''); setInstructions(''); setRepositoryFullName('');
    setDbType('postgres'); setDbHost('localhost'); setDbPort('5432'); setDbDatabase(''); setDbUser(''); setDbPassword(''); setDbSsl(false); setDbTesting(false); setDbVerified(false); setDbMessage('');
    dialog.current?.showModal();
    try { const response = await fetch(`${appConfig.apiUrl}/api/github/repos`, { credentials: 'include' }); const data = response.ok ? await response.json() : { repos: [] }; setRepositories(data.repos ?? []); } catch { setRepositories([]); }
  };
  const verifyRepository = () => { const candidate = repositoryFullName.trim(); if (!repositoryPattern.test(candidate)) { setMessage('Enter the repository as owner/repository.'); setVerified(false); return; } if (repositories.length && !repositories.some(repo => repo.full_name.toLowerCase() === candidate.toLowerCase())) { setMessage('That repository is not available from your GitHub connection.'); setVerified(false); return; } setMessage(`Verified ${candidate}`); setVerified(true); };
  const buildDbConnection = (): DbConnectionInput => ({ dbType, host: dbHost.trim(), port: dbPort.trim(), database: dbDatabase.trim(), user: dbUser.trim(), password: dbPassword, ssl: dbSsl });
  const testDbConnection = async () => {
    setDbTesting(true); setDbMessage(''); setDbVerified(false);
    try {
      const response = await fetch(`${appConfig.apiUrl}/api/db/connect/${dbType}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildDbConnection()) });
      const data = await response.json().catch(() => ({ success: false, error: 'Unexpected response.' }));
      if (!data.success) { setDbMessage(data.error || 'Could not connect.'); setDbVerified(false); return; }
      setDbMessage(`Connected — ${data.schema?.tables?.length ?? 0} tables found`); setDbVerified(true);
    } catch (cause) {
      setDbMessage(cause instanceof Error ? cause.message : 'Could not connect.'); setDbVerified(false);
    } finally {
      setDbTesting(false);
    }
  };
  const createProject = (event: React.FormEvent) => {
    event.preventDefault();
    if (projectTypeStep === 'database') {
      if (!dbVerified) { setDbMessage('Test the connection before creating this project.'); return; }
      organizationStore.createProject({ workspaceId: numericWorkspaceId, name, instructions, projectType: 'database', dbConnection: buildDbConnection() })
        .then(project => { refresh(); setSelectedProjectId(project.id); dialog.current?.close(); })
        .catch(cause => setDbMessage(cause instanceof Error ? cause.message : 'Could not create project.'));
      return;
    }
    if (!verified) { setMessage('Verify a repository before creating this project.'); return; }
    organizationStore.createProject({ workspaceId: numericWorkspaceId, name, instructions, projectType: 'codebase', repositoryFullName })
      .then(project => { refresh(); setSelectedProjectId(project.id); dialog.current?.close(); setName(''); setInstructions(''); setRepositoryFullName(''); })
      .catch(cause => setMessage(cause instanceof Error ? cause.message : 'Could not create project.'));
  };
  const openProject = (project: Project) => project.projectType === 'database' ? navigate(`/db?projectId=${project.id}`) : navigate(`/workspace?repo=${encodeURIComponent(project.repositoryFullName ?? '')}&run=1`);
  const deleteProject = (project: Project) => {
    setPendingDelete(project); setDeleteConfirmText(''); setDeleteError('');
    deleteDialog.current?.showModal();
  };
  const cancelDeleteProject = () => { deleteDialog.current?.close(); setPendingDelete(null); setDeleteConfirmText(''); setDeleteError(''); };
  const confirmDeleteProject = (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingDelete) return;
    if (deleteConfirmText.trim() !== pendingDelete.name) { setDeleteError('That name doesn’t match. Type it exactly to confirm.'); return; }
    organizationStore.removeProject(pendingDelete.id).then(() => {
      refresh();
      if (selectedProjectId === pendingDelete.id) setSelectedProjectId(null);
      deleteDialog.current?.close();
      setPendingDelete(null); setDeleteConfirmText(''); setDeleteError('');
    });
  };
  const inviteMember = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    organizationStore.inviteMember(selected.id, inviteEmail)
      .then(() => { refresh(); setInviteEmail(''); setInviteMessage('Invited.'); setInviteError(false); })
      .catch(cause => { setInviteMessage(cause instanceof Error ? cause.message : 'Could not invite this person.'); setInviteError(true); });
  };
  const removeMember = (memberId: number) => { if (!selected) return; organizationStore.removeMember(selected.id, memberId).then(refresh); };
  if (!workspace) return null;
  return <main className="organization-page project-picker-page">
    <header className="organization-topbar"><div className="organization-brand"><span className="organization-brand-mark"><GitBranch size={20} /></span><button className="picker-back" onClick={() => navigate('/workspaces')}>Workspaces</button><span className="organization-brand-divider">/</span><strong>Projects</strong></div><div className="topbar-actions"><TopbarSearch value={query} onChange={setQuery} placeholder="Search projects" className="topbar-search-slot" /><TopbarAccount /></div></header>
    {!projects.length ? <section className="workspace-empty-page"><span><FolderKanban size={34} /></span><h1>Start your first project</h1><p>Attach a verified GitHub repository to begin organizing work inside {workspace.name}.</p><button className="projects-primary-action" onClick={() => void openDialog()}><Plus size={16} /> Create project</button></section> : <section className="project-workspace-layout">
      <aside className="project-list-panel">
        <div className="project-list-heading"><h2>Projects</h2><button className="project-create-pill" aria-label="Create project" onClick={() => void openDialog()}><Plus size={16} /><span className="project-create-pill-label">New project</span></button></div>
        <nav className="project-list" aria-label="Your projects">{visible.map(project => <div key={project.id} className="project-list-row">
          <button className={`project-list-item${project.id === selected?.id ? ' is-selected' : ''}`} onClick={() => setSelectedProjectId(project.id)} aria-current={project.id === selected?.id}>
            <span className="project-list-icon">{project.projectType === 'database' ? <Database size={20} /> : <FolderKanban size={20} />}</span>
            <span className="project-list-copy"><strong>{project.name}</strong><small>{projectSubtitle(project)}</small></span>
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
          <div className="project-detail-title"><span className="organization-card-mark">{selected.projectType === 'database' ? <Database size={21} /> : <FolderKanban size={21} />}</span><div><h1>{selected.name}</h1><p>{projectSubtitle(selected)}</p></div></div>
          <button className="projects-primary-action" onClick={() => openProject(selected)}>{selected.projectType === 'database' ? 'Open database' : 'Open workspace'} <ArrowRight size={16} /></button>
        </header>
        <div className="project-meta-grid">
          <div><CalendarDays size={18} /><span><small>Created</small><strong>{relativeTime(selected.createdAt)}</strong></span></div>
          <div>{selected.projectType === 'database' ? <Database size={18} /> : <GitBranch size={18} />}<span><small>{selected.projectType === 'database' ? 'Database' : 'Repository'}</small><strong>{projectSubtitle(selected)}</strong></span></div>
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
          <span className="project-list-icon">{pendingDelete?.projectType === 'database' ? <Database size={18} /> : <FolderKanban size={18} />}</span>
          <span className="project-list-copy"><strong>{pendingDelete?.name}</strong><small>{pendingDelete ? projectSubtitle(pendingDelete) : ''}</small></span>
        </div>
        <div className="delete-dialog-warning"><ShieldAlert size={16} /><span>Deleting this project removes it, its members, and its link to <strong>{pendingDelete ? projectSubtitle(pendingDelete) : ''}</strong> from this workspace.</span></div>
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
    <dialog ref={dialog} className={`organization-dialog project-create-dialog${projectTypeStep ? ' project-create-dialog-wide' : ''}`}>
      {projectTypeStep === null ? <>
        <div className="project-dialog-header">
          <span className="project-dialog-mark"><FolderKanban size={22} /></span>
          <div className="project-dialog-header-copy">
            <h2>Create project</h2>
            <p>What are you connecting?</p>
          </div>
        </div>
        <div className="project-type-grid">
          <button type="button" className="project-type-card" onClick={() => setProjectTypeStep('codebase')}>
            <span className="project-type-icon"><GitBranch size={20} /></span>
            <strong>Codebase</strong>
            <small>Attach a GitHub repository for GraphKeep analysis — architecture, insights, security, and more.</small>
          </button>
          <button type="button" className="project-type-card" onClick={() => setProjectTypeStep('database')}>
            <span className="project-type-icon"><Database size={20} /></span>
            <strong>Database</strong>
            <small>Connect a PostgreSQL or MySQL database to explore its schema as an ER diagram.</small>
          </button>
        </div>
        <div className="organization-dialog-actions"><button className="dialog-cancel" type="button" onClick={() => dialog.current?.close()}>Cancel</button></div>
      </> : projectTypeStep === 'codebase' ? <form onSubmit={createProject} style={gg.panel()}>
        <div style={gg.headerRow()}>
          <div style={gg.titleBlock()}>
            <span style={gg.mark()}><FolderKanban size={20} /></span>
            <div style={gg.titleCopy()}>
              <h2 style={gg.h2()}>Create project</h2>
              <p style={gg.p()}>Attach a verified GitHub repository before opening GraphKeep analysis.</p>
            </div>
          </div>
          <button type="button" className="gg-change-type" style={gg.backLink()} onClick={() => setProjectTypeStep(null)}>Change type</button>
        </div>
        <div style={gg.fieldRow()}>
          <div><label style={ggLabel}>Project name</label><input style={ggInput} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="My project" /></div>
          <div><label style={ggLabel}>Instructions (optional)</label><input style={ggInput} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="What is this for?" /></div>
        </div>

        <div style={gg.gridWrap()}>
          <div style={gg.col(GG.panel)}>
            <span style={gg.kicker()}>Your repositories</span>
            <div className="gg-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 264, width: '100%', minWidth: 0, overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}>
              {repositories.length ? repositories.map(repo => {
                const active = repositoryFullName.toLowerCase() === repo.full_name.toLowerCase();
                const slash = repo.full_name.indexOf('/');
                const owner = slash === -1 ? '' : repo.full_name.slice(0, slash);
                const repoName = slash === -1 ? repo.full_name : repo.full_name.slice(slash + 1);
                return (
                  <button type="button" key={repo.full_name} className="gg-repo-tile" style={gg.tile(active)} onClick={() => { setRepositoryFullName(repo.full_name); setVerified(false); setMessage(''); }}>
                    <GitBranch size={14} color={active ? GG.accent : GG.fg3} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontFamily: GG.sans, fontSize: 12.5, color: active ? GG.accent : GG.fg2, fontWeight: active ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repoName}</span>
                      {owner && <span style={{ fontFamily: GG.mono, fontSize: 9.5, color: GG.fg4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{owner}</span>}
                    </span>
                    {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GG.accent, flexShrink: 0 }} />}
                  </button>
                );
              }) : <p style={{ color: GG.fg4, fontSize: 11.5, fontStyle: 'italic', margin: 0, padding: '4px 2px' }}>No repositories found — type one below.</p>}
            </div>
          </div>

          <div style={gg.col(GG.bg2)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GitBranch size={20} color={GG.accent} />
              <div>
                <div style={{ fontFamily: GG.mono, fontSize: 14, color: GG.fg, fontWeight: 700 }}>connect a repository</div>
                <div style={{ fontFamily: GG.sans, fontSize: 12, color: GG.fg3, marginTop: 2 }}>Pick one on the left, or type owner/repository below</div>
              </div>
            </div>
            <div>
              <label style={ggLabel}>Repository</label>
              <input style={ggInput} list="project-repositories" placeholder="owner/repository" value={repositoryFullName} onChange={event => { setRepositoryFullName(event.target.value); setVerified(false); setMessage(''); }} />
              <datalist id="project-repositories">{repositories.map(repo => <option key={repo.full_name} value={repo.full_name} />)}</datalist>
            </div>
            {message && <GGErrorBanner msg={message} />}
            <button type="button" style={gg.actionButton(false)} onClick={verifyRepository}><Check size={14} /> Verify repository</button>
            {verified && <span style={{ color: '#98c379', fontSize: 12, fontFamily: GG.mono, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> {message}</span>}
          </div>

          <div style={gg.col(GG.panel)}>
            <div style={gg.sideCard()}>
              <div style={gg.sideCardTitle()}>What we read</div>
              {[{ label: 'files & folder structure', ok: true }, { label: 'commit & branch history', ok: true }, { label: 'dependency graph', ok: true }, { label: 'secrets or env files', ok: false }].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: GG.mono, fontSize: 12, color: item.ok ? GG.accent : GG.fg4 }}>{item.ok ? '✓' : '✗'}</span>
                  <span style={{ fontFamily: GG.mono, fontSize: 12, color: item.ok ? GG.fg2 : GG.fg4, textDecoration: item.ok ? 'none' : 'line-through' }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ background: `${GG.info}0d`, border: `1px solid color-mix(in srgb, ${GG.info} 20%, transparent)`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.info, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Security</div>
              <p style={{ margin: 0, fontFamily: GG.sans, fontSize: 11, color: GG.fg3, lineHeight: 1.6 }}>Read-only access via your connected GitHub account. Nothing is pushed or modified in your repository.</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" style={{ border: `1px solid ${GG.lineStrong}`, borderRadius: 8, padding: '9px 14px', background: 'transparent', color: GG.fg2, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => dialog.current?.close()}>Cancel</button>
          <button style={gg.actionButton(!verified)} disabled={!verified}>Create project</button>
        </div>
      </form> : <form onSubmit={createProject} style={gg.panel()}>
        <div style={gg.headerRow()}>
          <div style={gg.titleBlock()}>
            <span style={gg.mark()}><Database size={20} /></span>
            <div style={gg.titleCopy()}>
              <h2 style={gg.h2()}>Create project</h2>
              <p style={gg.p()}>Connect a database to explore its schema. Credentials are encrypted before they're stored.</p>
            </div>
          </div>
          <button type="button" className="gg-change-type" style={gg.backLink()} onClick={() => setProjectTypeStep(null)}>Change type</button>
        </div>
        <div style={gg.fieldRow()}>
          <div><label style={ggLabel}>Project name</label><input style={ggInput} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="My database" /></div>
          <div><label style={ggLabel}>Instructions (optional)</label><input style={ggInput} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="What is this for?" /></div>
        </div>

        <div style={gg.gridWrap()}>
          <div style={gg.col(GG.panel)}>
            <span style={gg.kicker()}>Data sources</span>
            <button type="button" style={gg.tile(dbType === 'postgres')} onClick={() => { setDbType('postgres'); setDbPort('5432'); setDbVerified(false); }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>🐘</span>
              <span style={{ flex: 1, fontFamily: GG.sans, fontSize: 13, color: dbType === 'postgres' ? GG.accent : GG.fg2, fontWeight: dbType === 'postgres' ? 600 : 400 }}>PostgreSQL</span>
              {dbType === 'postgres' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GG.accent, flexShrink: 0 }} />}
            </button>
            <button type="button" style={gg.tile(dbType === 'mysql')} onClick={() => { setDbType('mysql'); setDbPort('3306'); setDbVerified(false); }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>🐬</span>
              <span style={{ flex: 1, fontFamily: GG.sans, fontSize: 13, color: dbType === 'mysql' ? GG.accent : GG.fg2, fontWeight: dbType === 'mysql' ? 600 : 400 }}>MySQL</span>
              {dbType === 'mysql' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: GG.accent, flexShrink: 0 }} />}
            </button>
            <div style={{ height: 1, background: GG.line, margin: '4px 0' }} />
            {[{ icon: '🗃', label: 'SQLite' }, { icon: '🍃', label: 'MongoDB' }, { icon: '📄', label: 'SQL Dump' }, { icon: '🗂', label: 'From Repo' }, { icon: '❄️', label: 'Snowflake' }].map(src => (
              <button type="button" key={src.label} style={gg.tileDisabled()} disabled>
                <span style={{ fontSize: 16, lineHeight: 1 }}>{src.icon}</span>
                <span style={{ flex: 1, fontFamily: GG.sans, fontSize: 13, color: GG.fg3 }}>{src.label}</span>
                <span style={{ fontFamily: GG.mono, fontSize: 9, color: GG.fg4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Soon</span>
              </button>
            ))}
          </div>

          <div style={gg.col(GG.bg2)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{dbType === 'postgres' ? '🐘' : '🐬'}</span>
              <div>
                <div style={{ fontFamily: GG.mono, fontSize: 14, color: GG.fg, fontWeight: 700 }}>connect to {dbType === 'postgres' ? 'postgresql' : 'mysql'}</div>
                <div style={{ fontFamily: GG.sans, fontSize: 12, color: GG.fg3, marginTop: 2 }}>Enter your database credentials below</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 2 }}><label style={ggLabel}>Host</label><input style={ggInput} value={dbHost} onChange={event => { setDbHost(event.target.value); setDbVerified(false); }} placeholder="localhost" /></div>
              <div style={{ flex: 1 }}><label style={ggLabel}>Port</label><input style={ggInput} value={dbPort} onChange={event => { setDbPort(event.target.value); setDbVerified(false); }} /></div>
            </div>
            <div><label style={ggLabel}>Database</label><input style={ggInput} value={dbDatabase} onChange={event => { setDbDatabase(event.target.value); setDbVerified(false); }} placeholder="my_database" /></div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}><label style={ggLabel}>Username</label><input style={ggInput} value={dbUser} onChange={event => { setDbUser(event.target.value); setDbVerified(false); }} placeholder={dbType === 'postgres' ? 'postgres' : 'root'} /></div>
              <div style={{ flex: 1 }}><label style={ggLabel}>Password</label><input type="password" style={ggInput} value={dbPassword} onChange={event => { setDbPassword(event.target.value); setDbVerified(false); }} /></div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: GG.mono, fontSize: 12, color: GG.fg3, cursor: 'pointer' }}>
              <input type="checkbox" checked={dbSsl} onChange={event => { setDbSsl(event.target.checked); setDbVerified(false); }} /> Require SSL
            </label>
            <div style={{ background: GG.bg1, border: `1px solid ${GG.line}`, borderRadius: 8, padding: '8px 12px', fontFamily: GG.mono, fontSize: 11, color: GG.fg3, wordBreak: 'break-all' }}>
              <span style={{ color: GG.fg4, marginRight: 6 }}>$</span>{dbType === 'postgres' ? 'postgresql' : 'mysql'}://{dbUser || '<user>'}:••••@{dbHost || '<host>'}:{dbPort}/{dbDatabase || '<database>'}
            </div>
            {dbMessage && (dbVerified ? <span style={{ color: '#98c379', fontSize: 12, fontFamily: GG.mono, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={14} /> {dbMessage}</span> : <GGErrorBanner msg={dbMessage} />)}
            <button type="button" style={gg.actionButton(dbTesting || !dbHost.trim() || !dbDatabase.trim() || !dbUser.trim())} onClick={() => void testDbConnection()} disabled={dbTesting || !dbHost.trim() || !dbDatabase.trim() || !dbUser.trim()}>
              {dbTesting ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> testing…</> : <>test connection</>}
            </button>
          </div>

          <div style={gg.col(GG.panel)}>
            <div style={gg.sideCard()}>
              <div style={gg.sideCardTitle()}>Schema preview</div>
              <MiniSchemaPreview />
            </div>
            <div style={gg.sideCard()}>
              <div style={gg.sideCardTitle()}>What we read</div>
              {[{ label: 'table metadata', ok: true }, { label: 'foreign keys', ok: true }, { label: 'view definitions', ok: true }, { label: 'row data', ok: false }].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: GG.mono, fontSize: 12, color: item.ok ? GG.accent : GG.fg4 }}>{item.ok ? '✓' : '✗'}</span>
                  <span style={{ fontFamily: GG.mono, fontSize: 12, color: item.ok ? GG.fg2 : GG.fg4, textDecoration: item.ok ? 'none' : 'line-through' }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ background: `${GG.info}0d`, border: `1px solid color-mix(in srgb, ${GG.info} 20%, transparent)`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontFamily: GG.mono, fontSize: 10, color: GG.info, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Security</div>
              <p style={{ margin: 0, fontFamily: GG.sans, fontSize: 11, color: GG.fg3, lineHeight: 1.6 }}>Credentials are encrypted before storage. Connections run server-side — your password never reaches the browser again after saving.</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" style={{ border: `1px solid ${GG.lineStrong}`, borderRadius: 8, padding: '9px 14px', background: 'transparent', color: GG.fg2, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => dialog.current?.close()}>Cancel</button>
          <button style={gg.actionButton(!dbVerified)} disabled={!dbVerified}>Create project</button>
        </div>
      </form>}
    </dialog>
  </main>;
}
