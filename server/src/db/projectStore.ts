import { pool } from './pool';
import { encryptJson, decryptJson } from '../services/credentialCipher';

export type WorkspaceRow = { id: number; name: string; createdAt: string };
export type MemberRow = { id: number; email: string; invitedAt: string };
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
  createdAt: string;
  members: MemberRow[];
};

const repositoryPattern = /^[^/\s]+\/[^/\s]+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toWorkspace(row: any): WorkspaceRow {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

function toMember(row: any): MemberRow {
  return { id: row.id, email: row.email, invitedAt: row.invited_at };
}

function summarizeConnection(encrypted: string | null): DbConnectionSummary | null {
  if (!encrypted) return null;
  const { password: _password, ...summary } = decryptJson<DbConnectionInput>(encrypted);
  return summary;
}

function toProject(row: any, members: MemberRow[]): ProjectRow {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    instructions: row.instructions,
    projectType: row.project_type,
    repositoryFullName: row.repository_full_name,
    dbConnectionSummary: summarizeConnection(row.db_connection_encrypted),
    createdAt: row.created_at,
    members,
  };
}

async function loadMembers(projectIds: number[]): Promise<Map<number, MemberRow[]>> {
  const byProject = new Map<number, MemberRow[]>();
  if (projectIds.length === 0) return byProject;
  const result = await pool.query(
    'SELECT id, project_id, email, invited_at FROM project_members WHERE project_id = ANY($1) ORDER BY invited_at ASC',
    [projectIds],
  );
  for (const row of result.rows) {
    const list = byProject.get(row.project_id) ?? [];
    list.push(toMember(row));
    byProject.set(row.project_id, list);
  }
  return byProject;
}

export async function listWorkspaces(userId: number): Promise<WorkspaceRow[]> {
  const result = await pool.query('SELECT id, name, created_at FROM workspaces WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return result.rows.map(toWorkspace);
}

export async function createWorkspace(userId: number, name: string): Promise<WorkspaceRow> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Workspace name is required.');
  const result = await pool.query(
    'INSERT INTO workspaces (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at',
    [userId, trimmed],
  );
  return toWorkspace(result.rows[0]);
}

export async function removeWorkspace(userId: number, workspaceId: number): Promise<void> {
  await pool.query('DELETE FROM workspaces WHERE id = $1 AND user_id = $2', [workspaceId, userId]);
}

export async function listProjects(userId: number): Promise<ProjectRow[]> {
  const result = await pool.query(
    'SELECT id, workspace_id, name, instructions, project_type, repository_full_name, db_connection_encrypted, created_at FROM projects WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  const members = await loadMembers(result.rows.map(row => row.id));
  return result.rows.map(row => toProject(row, members.get(row.id) ?? []));
}

function validateDbConnection(input: DbConnectionInput): void {
  if (input.dbType !== 'postgres' && input.dbType !== 'mysql') throw new Error('Unsupported database type.');
  if (!input.host?.trim()) throw new Error('Database host is required.');
  if (!input.database?.trim()) throw new Error('Database name is required.');
  if (!input.user?.trim()) throw new Error('Database user is required.');
}

export async function createProject(userId: number, input: {
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
  const workspace = await pool.query('SELECT id FROM workspaces WHERE id = $1 AND user_id = $2', [input.workspaceId, userId]);
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
     RETURNING id, workspace_id, name, instructions, project_type, repository_full_name, db_connection_encrypted, created_at`,
    [input.workspaceId, userId, name, instructions, projectType, repositoryFullName, dbConnectionEncrypted],
  );
  return toProject(result.rows[0], []);
}

export async function removeProject(userId: number, projectId: number): Promise<void> {
  await pool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
}

export async function getDecryptedConnection(userId: number, projectId: number): Promise<DbConnectionInput> {
  const result = await pool.query(
    'SELECT db_connection_encrypted FROM projects WHERE id = $1 AND user_id = $2 AND project_type = $3',
    [projectId, userId, 'database'],
  );
  if (result.rowCount === 0) throw new Error('Database project was not found.');
  const encrypted = result.rows[0].db_connection_encrypted;
  if (!encrypted) throw new Error('This project has no saved database connection.');
  return decryptJson<DbConnectionInput>(encrypted);
}

export async function updateDbConnection(userId: number, projectId: number, dbConnection: DbConnectionInput): Promise<DbConnectionSummary> {
  validateDbConnection(dbConnection);
  const result = await pool.query(
    `UPDATE projects SET db_connection_encrypted = $1
     WHERE id = $2 AND user_id = $3 AND project_type = 'database'
     RETURNING db_connection_encrypted`,
    [encryptJson(dbConnection), projectId, userId],
  );
  if (result.rowCount === 0) throw new Error('Database project was not found.');
  return summarizeConnection(result.rows[0].db_connection_encrypted)!;
}

export async function addMember(userId: number, projectId: number, email: string): Promise<MemberRow> {
  const trimmed = email.trim();
  if (!emailPattern.test(trimmed)) throw new Error('Enter a valid email address.');
  const project = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
  if (project.rowCount === 0) throw new Error('Project was not found.');
  const existing = await pool.query('SELECT id FROM project_members WHERE project_id = $1 AND lower(email) = lower($2)', [projectId, trimmed]);
  if ((existing.rowCount ?? 0) > 0) throw new Error('That person is already a member.');
  const result = await pool.query(
    'INSERT INTO project_members (project_id, email) VALUES ($1, $2) RETURNING id, email, invited_at',
    [projectId, trimmed],
  );
  return toMember(result.rows[0]);
}

export async function removeMember(userId: number, projectId: number, memberId: number): Promise<void> {
  await pool.query(
    `DELETE FROM project_members WHERE id = $1 AND project_id = $2
     AND project_id IN (SELECT id FROM projects WHERE user_id = $3)`,
    [memberId, projectId, userId],
  );
}
