import { pool } from './pool';
import { encryptJson, decryptJson, encryptSecret, revealSecret } from '../services/credentialCipher';
import { webhookKind } from '../services/alertNotifier';

// Workspaces belong to an organization: everyone in it can see every workspace
// and project. Editing a project (its connection, webhook, members, alert
// rules, deleting it) is limited to its creator, its members and org admins.
export type Actor = { id: number; organizationId: number; role: string };
export class AccessError extends Error {}
export class NotFoundError extends Error {}

export type WorkspaceRow = { id: number; name: string; createdAt: string; canDelete: boolean };
// userId is null for a legacy email-only entry that matches no account; such
// an entry grants nothing and only shows so it can be removed.
export type MemberRow = { id: number; userId: number | null; username: string | null; email: string | null; invitedAt: string };
export type ProjectType = 'codebase' | 'database';
export type DbConnectionInput = { dbType: 'postgres' | 'mysql'; host: string; port: string | number; database: string; user: string; password: string; ssl?: boolean };
export type DbConnectionSummary = Omit<DbConnectionInput, 'password'>;
export type ProjectRow = {
  id: number;
  workspaceId: number;
  name: string;
  instructions: string;
  projectType: ProjectType;
  repositoryFullName: string | null;
  dbConnectionSummary: DbConnectionSummary | null;
  // Never the URL itself: it is a credential for the channel.
  alertWebhookConfigured: boolean;
  createdAt: string;
  members: MemberRow[];
  createdBy: string | null;
  canEdit: boolean;
};

const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;

const isAdmin = (actor: Actor) => actor.role === 'admin';

function toWorkspace(row: any, actor: Actor): WorkspaceRow {
  return { id: row.id, name: row.name, createdAt: row.created_at, canDelete: isAdmin(actor) || row.user_id === actor.id };
}

function toMember(row: any): MemberRow {
  return { id: row.id, userId: row.user_id ?? null, username: row.username ?? null, email: row.email ?? null, invitedAt: row.invited_at };
}

// SQL fragment: project p is in the actor's organization ($org).
const IN_ORG = 'p.workspace_id IN (SELECT id FROM workspaces WHERE organization_id = $org)';
// SQL fragment: the actor may edit project p ($uid, $admin).
const CAN_EDIT = `($admin OR p.user_id = $uid OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $uid))`;

function scoped(sql: string, actor: Actor, firstIndex: number): { text: string; values: unknown[] } {
  const text = sql.replace(/\$org/g, `$${firstIndex}`).replace(/\$uid/g, `$${firstIndex + 1}`).replace(/\$admin/g, `$${firstIndex + 2}`);
  return { text, values: [actor.organizationId, actor.id, isAdmin(actor)] };
}

async function findProject(actor: Actor, projectId: number, needEdit: boolean, projectType?: ProjectType): Promise<any> {
  const typeClause = projectType ? ` AND p.project_type = '${projectType}'` : '';
  const query = scoped(`SELECT p.*, ${CAN_EDIT} AS can_edit FROM projects p WHERE p.id = $1 AND ${IN_ORG}${typeClause}`, actor, 2);
  const result = await pool.query(query.text, [projectId, ...query.values]);
  const label = projectType === 'database' ? 'Database project' : projectType === 'codebase' ? 'Codebase project' : 'Project';
  if (result.rowCount === 0) throw new NotFoundError(`${label} was not found.`);
  if (needEdit && !result.rows[0].can_edit) throw new AccessError('Only the project creator, its members or an admin can change this project.');
  return result.rows[0];
}

export async function assertCanEditProject(actor: Actor, projectId: number): Promise<void> {
  await findProject(actor, projectId, true);
}

function summarizeConnection(encrypted: string | null): DbConnectionSummary | null {
  if (!encrypted) return null;
  const { password: _password, ...summary } = decryptJson<DbConnectionInput>(encrypted);
  return summary;
}

function toProject(row: any, members: MemberRow[], canEdit: boolean): ProjectRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    instructions: row.instructions,
    projectType: row.project_type,
    repositoryFullName: row.repository_full_name,
    dbConnectionSummary: summarizeConnection(row.db_connection_encrypted),
    alertWebhookConfigured: Boolean(row.alert_webhook_encrypted),
    createdAt: row.created_at,
    members,
    createdBy: row.created_by ?? null,
    canEdit,
  };
}

async function loadMembers(projectIds: number[]): Promise<Map<number, MemberRow[]>> {
  const byProject = new Map<number, MemberRow[]>();
  if (projectIds.length === 0) return byProject;
  const result = await pool.query(
    `SELECT m.id, m.project_id, m.user_id, u.username, m.email, m.invited_at
     FROM project_members m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.project_id = ANY($1) ORDER BY m.invited_at ASC`,
    [projectIds],
  );
  for (const row of result.rows) {
    const list = byProject.get(row.project_id) ?? [];
    list.push(toMember(row));
    byProject.set(row.project_id, list);
  }
  return byProject;
}

export async function listWorkspaces(actor: Actor): Promise<WorkspaceRow[]> {
  const result = await pool.query('SELECT id, user_id, name, created_at FROM workspaces WHERE organization_id = $1 ORDER BY created_at DESC', [actor.organizationId]);
  return result.rows.map(row => toWorkspace(row, actor));
}

export async function createWorkspace(actor: Actor, name: string): Promise<WorkspaceRow> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Workspace name is required.');
  const result = await pool.query(
    'INSERT INTO workspaces (user_id, organization_id, name) VALUES ($1, $2, $3) RETURNING id, user_id, name, created_at',
    [actor.id, actor.organizationId, trimmed],
  );
  return toWorkspace(result.rows[0], actor);
}

export async function removeWorkspace(actor: Actor, workspaceId: number): Promise<void> {
  const result = await pool.query('SELECT user_id FROM workspaces WHERE id = $1 AND organization_id = $2', [workspaceId, actor.organizationId]);
  if (result.rowCount === 0) return;
  if (!isAdmin(actor) && result.rows[0].user_id !== actor.id) throw new AccessError('Only the workspace creator or an admin can delete it.');
  await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
}

export async function listProjects(actor: Actor): Promise<ProjectRow[]> {
  const query = scoped(
    `SELECT p.id, p.workspace_id, p.name, p.instructions, p.project_type, p.repository_full_name, p.db_connection_encrypted, p.alert_webhook_encrypted, p.created_at,
            (SELECT username FROM users WHERE id = p.user_id) AS created_by, ${CAN_EDIT} AS can_edit
     FROM projects p WHERE ${IN_ORG} ORDER BY p.created_at DESC`, actor, 1);
  const result = await pool.query(query.text, query.values);
  const members = await loadMembers(result.rows.map(row => row.id));
  return result.rows.map(row => toProject(row, members.get(row.id) ?? [], row.can_edit));
}

function validateDbConnection(input: DbConnectionInput): void {
  if (input.dbType !== 'postgres' && input.dbType !== 'mysql') throw new Error('Unsupported database type.');
  if (!input.host?.trim()) throw new Error('Database host is required.');
  if (!input.database?.trim()) throw new Error('Database name is required.');
  if (!input.user?.trim()) throw new Error('Database user is required.');
}

export async function createProject(actor: Actor, input: {
  workspaceId: number;
  name: string;
  instructions: string;
  projectType: ProjectType;
  repositoryFullName?: string;
  dbConnection?: DbConnectionInput;
}): Promise<ProjectRow> {
  const name = input.name.trim();
  const instructions = input.instructions.trim();
  const projectType = input.projectType;
  if (!name) throw new Error('Project name is required.');
  const workspace = await pool.query('SELECT id FROM workspaces WHERE id = $1 AND organization_id = $2', [input.workspaceId, actor.organizationId]);
  if (workspace.rowCount === 0) throw new Error('Workspace was not found.');

  let repositoryFullName: string | null = null;
  let dbConnectionEncrypted: string | null = null;

  if (projectType === 'codebase') {
    repositoryFullName = (input.repositoryFullName ?? '').trim();
    if (!repositoryPattern.test(repositoryFullName)) throw new Error('Repository must use owner/repository.');
  } else if (projectType === 'database') {
    if (!input.dbConnection) throw new Error('A database connection is required.');
    validateDbConnection(input.dbConnection);
    dbConnectionEncrypted = encryptJson(input.dbConnection);
  } else {
    throw new Error('Unknown project type.');
  }

  const result = await pool.query(
    `INSERT INTO projects (workspace_id, user_id, name, instructions, project_type, repository_full_name, db_connection_encrypted)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, name, instructions, project_type, repository_full_name, db_connection_encrypted, created_at,
               (SELECT username FROM users WHERE id = $2) AS created_by`,
    [input.workspaceId, actor.id, name, instructions, projectType, repositoryFullName, dbConnectionEncrypted],
  );
  return toProject(result.rows[0], [], true);
}

export async function removeProject(actor: Actor, projectId: number): Promise<void> {
  await findProject(actor, projectId, true);
  await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
}

// View access: anyone in the organization. The password never leaves the server.
export async function getDecryptedConnection(actor: Actor, projectId: number): Promise<DbConnectionInput> {
  const project = await findProject(actor, projectId, false, 'database');
  const encrypted = project.db_connection_encrypted;
  if (!encrypted) throw new Error('This project has no saved database connection.');
  return decryptJson<DbConnectionInput>(encrypted);
}

export async function updateDbConnection(actor: Actor, projectId: number, dbConnection: DbConnectionInput): Promise<DbConnectionSummary> {
  validateDbConnection(dbConnection);
  await findProject(actor, projectId, true, 'database');
  const result = await pool.query(
    'UPDATE projects SET db_connection_encrypted = $1 WHERE id = $2 RETURNING db_connection_encrypted',
    [encryptJson(dbConnection), projectId],
  );
  return summarizeConnection(result.rows[0].db_connection_encrypted)!;
}

// Members are people already in the organization, picked by username. Being a
// member grants edit rights on that project.
export async function addMember(actor: Actor, projectId: number, username: string): Promise<MemberRow> {
  const trimmed = username.trim();
  if (!trimmed) throw new Error('Choose someone from your organization.');
  await findProject(actor, projectId, true);
  const person = await pool.query('SELECT id, username FROM users WHERE organization_id = $1 AND lower(username) = lower($2)', [actor.organizationId, trimmed]);
  if (person.rowCount === 0) throw new Error('No one in your organization has that username. Invite them to the organization first.');
  const existing = await pool.query('SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, person.rows[0].id]);
  if ((existing.rowCount ?? 0) > 0) throw new Error('That person is already a member.');
  const result = await pool.query(
    'INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING id, user_id, email, invited_at',
    [projectId, person.rows[0].id],
  );
  return toMember({ ...result.rows[0], username: person.rows[0].username });
}

export async function removeMember(actor: Actor, projectId: number, memberId: number): Promise<void> {
  await findProject(actor, projectId, true);
  await pool.query('DELETE FROM project_members WHERE id = $1 AND project_id = $2', [memberId, projectId]);
}

// null clears it. Only codebase projects have a repository to alert about.
export async function setAlertWebhook(actor: Actor, projectId: number, url: string | null): Promise<boolean> {
  if (url !== null && !webhookKind(url)) throw new Error('Use a Slack (hooks.slack.com) or Discord (discord.com/api/webhooks) incoming webhook URL.');
  await findProject(actor, projectId, true, 'codebase');
  await pool.query('UPDATE projects SET alert_webhook_encrypted = $1 WHERE id = $2', [url === null ? null : encryptSecret(url.trim()), projectId]);
  return url !== null;
}

export async function getAlertWebhook(actor: Actor, projectId: number): Promise<{ url: string | null; repositoryFullName: string | null }> {
  const project = await findProject(actor, projectId, true, 'codebase');
  return { url: revealSecret(project.alert_webhook_encrypted), repositoryFullName: project.repository_full_name };
}

// Every distinct alert destination across projects attached to owner/repo.
export async function listAlertWebhooksForRepository(owner: string, repo: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT alert_webhook_encrypted FROM projects
     WHERE project_type = 'codebase' AND lower(repository_full_name) = lower($1) AND alert_webhook_encrypted IS NOT NULL`,
    [`${owner}/${repo}`],
  );
  const urls = result.rows.map(row => revealSecret(row.alert_webhook_encrypted)).filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}

export interface WatchedRepository { owner: string; repo: string; encryptedToken: string | null }

// Each repository attached to any codebase project, once, preferring an
// owner whose GitHub connection can be used to read it.
export async function listWatchedRepositories(): Promise<WatchedRepository[]> {
  const result = await pool.query(
    `SELECT DISTINCT ON (lower(p.repository_full_name)) p.repository_full_name, u.github_token
     FROM projects p JOIN users u ON u.id = p.user_id
     WHERE p.project_type = 'codebase' AND p.repository_full_name IS NOT NULL
     ORDER BY lower(p.repository_full_name), (u.github_token IS NULL), p.created_at`,
  );
  return result.rows
    .map(row => {
      const [owner, repo] = String(row.repository_full_name).split('/');
      return { owner, repo, encryptedToken: row.github_token };
    })
    .filter(r => r.owner && r.repo);
}
