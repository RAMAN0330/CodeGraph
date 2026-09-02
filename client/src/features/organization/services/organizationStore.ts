export const organizationStorageKey = 'codegraph.organization.v1';

export type Workspace = { id: string; name: string; createdAt: string };
export type Member = { id: string; email: string; invitedAt: string };
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  instructions: string;
  repositoryFullName: string;
  createdAt: string;
  members: Member[];
};
export type OrganizationState = { workspaces: Workspace[]; projects: Project[] };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const emptyState = (): OrganizationState => ({ workspaces: [], projects: [] });
const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function browserStorage(): StorageLike | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}

export function createOrganizationStore(storage = browserStorage()) {
  const load = (): OrganizationState => {
    if (!storage) return emptyState();
    try {
      const value = JSON.parse(storage.getItem(organizationStorageKey) ?? '');
      if (Array.isArray(value?.workspaces) && Array.isArray(value?.projects)) {
        return { ...value, projects: value.projects.map((project: Project) => ({ ...project, members: Array.isArray(project.members) ? project.members : [] })) };
      }
    } catch { /* browser storage is optional */ }
    return emptyState();
  };
  const save = (state: OrganizationState) => {
    try { storage?.setItem(organizationStorageKey, JSON.stringify(state)); } catch { /* keep the current in-memory interaction usable */ }
    return state;
  };
  return {
    load,
    createWorkspace(name: string) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Workspace name is required.');
      const workspace: Workspace = { id: id(), name: trimmed, createdAt: new Date().toISOString() };
      save({ ...load(), workspaces: [workspace, ...load().workspaces] });
      return workspace;
    },
    createProject(input: Omit<Project, 'id' | 'createdAt' | 'members'>) {
      const name = input.name.trim();
      const repositoryFullName = input.repositoryFullName.trim();
      if (!name) throw new Error('Project name is required.');
      if (!repositoryPattern.test(repositoryFullName)) throw new Error('Repository must use owner/repository.');
      const state = load();
      if (!state.workspaces.some(workspace => workspace.id === input.workspaceId)) throw new Error('Workspace was not found.');
      const project: Project = { ...input, name, repositoryFullName, instructions: input.instructions.trim(), id: id(), createdAt: new Date().toISOString(), members: [] };
      save({ ...state, projects: [project, ...state.projects] });
      return project;
    },
    removeProject(projectId: string) {
      const state = load();
      save({ ...state, projects: state.projects.filter(project => project.id !== projectId) });
    },
    inviteMember(projectId: string, email: string) {
      const trimmed = email.trim();
      if (!emailPattern.test(trimmed)) throw new Error('Enter a valid email address.');
      const state = load();
      const project = state.projects.find(item => item.id === projectId);
      if (!project) throw new Error('Project was not found.');
      if (project.members.some(member => member.email.toLowerCase() === trimmed.toLowerCase())) throw new Error('That person is already a member.');
      const member: Member = { id: id(), email: trimmed, invitedAt: new Date().toISOString() };
      save({ ...state, projects: state.projects.map(item => item.id === projectId ? { ...item, members: [...item.members, member] } : item) });
      return member;
    },
    removeMember(projectId: string, memberId: string) {
      const state = load();
      save({ ...state, projects: state.projects.map(item => item.id === projectId ? { ...item, members: item.members.filter(member => member.id !== memberId) } : item) });
    },
    removeWorkspace(workspaceId: string) {
      const state = load();
      save({
        workspaces: state.workspaces.filter(workspace => workspace.id !== workspaceId),
        projects: state.projects.filter(project => project.workspaceId !== workspaceId),
      });
    },
  };
}

export const organizationStore = createOrganizationStore();
