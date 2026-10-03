import { appConfig } from '../../../app/config';

export type Workspace = { id: number; name: string; createdAt: string; canDelete: boolean };
// userId is null for an older email-only entry that matches no account.
export type Member = { id: number; userId: number | null; username: string | null; email: string | null; invitedAt: string };
export type OrganizationPerson = { id: number; username: string; role: string };
export type ProjectType = 'codebase' | 'database';
export type DbConnectionInput = { dbType: 'postgres' | 'mysql'; host: string; port: string | number; database: string; user: string; password: string; ssl?: boolean };
export type DbConnectionSummary = Omit<DbConnectionInput, 'password'>;
export type Project = {
  id: number;
  workspaceId: number;
  name: string;
  instructions: string;
  projectType: ProjectType;
  repositoryFullName: string | null;
  dbConnectionSummary: DbConnectionSummary | null;
  alertWebhookConfigured: boolean;
  createdAt: string;
  members: Member[];
  createdBy: string | null;
  // Creator, project members and admins; everyone else in the org can view.
  canEdit: boolean;
};
export type CreateProjectInput = {
  workspaceId: number;
  name: string;
  instructions: string;
  projectType: ProjectType;
  repositoryFullName?: string;
  dbConnection?: DbConnectionInput;
};
export type OrganizationState = { workspaces: Workspace[]; projects: Project[] };

const emptyState = (): OrganizationState => ({ workspaces: [], projects: [] });

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${appConfig.apiUrl}${path}`, {
    credentials: 'include',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data && data.error) || 'Request failed.');
  return data as T;
}

export function createOrganizationStore() {
  return {
    async load(): Promise<OrganizationState> {
      try {
        return await request<OrganizationState>('/api/projects');
      } catch {
        return emptyState();
      }
    },
    createWorkspace(name: string): Promise<Workspace> {
      return request<Workspace>('/api/workspaces', { method: 'POST', body: JSON.stringify({ name }) });
    },
    createProject(input: CreateProjectInput): Promise<Project> {
      return request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(input) });
    },
    removeProject(projectId: number): Promise<void> {
      return request<void>(`/api/projects/${projectId}`, { method: 'DELETE' });
    },
    fetchProjectSchema(projectId: number): Promise<{ success: boolean; schema?: any; error?: string }> {
      return request(`/api/projects/${projectId}/schema`, { method: 'POST' });
    },
    updateProjectDbConnection(projectId: number, dbConnection: DbConnectionInput): Promise<DbConnectionSummary> {
      return request<DbConnectionSummary>(`/api/projects/${projectId}/db-connection`, { method: 'PUT', body: JSON.stringify({ dbConnection }) });
    },
    addMember(projectId: number, username: string): Promise<Member> {
      return request<Member>(`/api/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ username }) });
    },
    listPeople(): Promise<OrganizationPerson[]> {
      return request<{ members: OrganizationPerson[] }>('/api/organization/members').then(body => body.members);
    },
    removeMember(projectId: number, memberId: number): Promise<void> {
      return request<void>(`/api/projects/${projectId}/members/${memberId}`, { method: 'DELETE' });
    },
    // null removes it. The saved URL is never sent back, only whether one is set.
    setAlertWebhook(projectId: number, url: string | null): Promise<{ configured: boolean }> {
      return request(`/api/projects/${projectId}/alert-webhook`, { method: 'PUT', body: JSON.stringify({ url }) });
    },
    testAlertWebhook(projectId: number): Promise<void> {
      return request<void>(`/api/projects/${projectId}/alert-webhook/test`, { method: 'POST' });
    },
    removeWorkspace(workspaceId: number): Promise<void> {
      return request<void>(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });
    },
  };
}

export const organizationStore = createOrganizationStore();
