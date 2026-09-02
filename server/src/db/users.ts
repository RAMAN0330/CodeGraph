import { pool } from './pool';

export type UserRow = {
  id: number;
  organization_id: number;
  organization_name: string;
  username: string;
  password_hash: string;
  role: string;
  github_login: string | null;
  github_avatar_url: string | null;
  github_token: string | null;
};

export type PublicUser = {
  id: number;
  username: string;
  organizationId: number;
  organizationName: string;
  role: string;
  github: { login: string; avatarUrl: string } | null;
};

export class UsernameTakenError extends Error {
  constructor() { super('That username is already taken.'); }
}

const USER_SELECT = `
  SELECT u.id, u.organization_id, o.name AS organization_name, u.username, u.password_hash,
         u.role, u.github_login, u.github_avatar_url, u.github_token
  FROM users u
  JOIN organizations o ON o.id = u.organization_id
`;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    role: row.role,
    github: row.github_login ? { login: row.github_login, avatarUrl: row.github_avatar_url ?? '' } : null,
  };
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(`${USER_SELECT} WHERE u.username = $1`, [username]);
  return result.rows[0] ?? null;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createOrganizationWithAdmin(organizationName: string, username: string, passwordHash: string): Promise<UserRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const org = await client.query<{ id: number }>('INSERT INTO organizations (name) VALUES ($1) RETURNING id', [organizationName]);
    const organizationId = org.rows[0].id;
    let userId: number;
    try {
      const user = await client.query<{ id: number }>(
        'INSERT INTO users (organization_id, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [organizationId, username, passwordHash, 'admin'],
      );
      userId = user.rows[0].id;
    } catch (error: any) {
      if (error?.code === '23505') throw new UsernameTakenError();
      throw error;
    }
    await client.query('COMMIT');
    const created = await findUserById(userId);
    if (!created) throw new Error('Failed to load the newly created account.');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function setGithubConnection(userId: number, github: { login: string; avatarUrl: string; token: string }): Promise<UserRow> {
  await pool.query(
    'UPDATE users SET github_login = $1, github_avatar_url = $2, github_token = $3 WHERE id = $4',
    [github.login, github.avatarUrl, github.token, userId],
  );
  const updated = await findUserById(userId);
  if (!updated) throw new Error('User not found after updating GitHub connection.');
  return updated;
}

export async function clearGithubConnection(userId: number): Promise<UserRow> {
  await pool.query('UPDATE users SET github_login = NULL, github_avatar_url = NULL, github_token = NULL WHERE id = $1', [userId]);
  const updated = await findUserById(userId);
  if (!updated) throw new Error('User not found after clearing GitHub connection.');
  return updated;
}
