import crypto from 'node:crypto';
import { pool } from './pool';
import { UsernameTakenError, findUserById, type UserRow } from './users';

const INVITE_TTL_DAYS = 7;

export function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface OrganizationMember { id: number; username: string; role: string; githubLogin: string | null }

export async function listMembers(organizationId: number): Promise<OrganizationMember[]> {
  const result = await pool.query('SELECT id, username, role, github_login FROM users WHERE organization_id = $1 ORDER BY created_at ASC', [organizationId]);
  return result.rows.map(row => ({ id: row.id, username: row.username, role: row.role, githubLogin: row.github_login }));
}

// Returns the raw token exactly once; only its hash is stored.
export async function createInvite(organizationId: number, createdBy: number): Promise<{ token: string; expiresAt: string }> {
  const token = crypto.randomBytes(24).toString('base64url');
  const result = await pool.query(
    `INSERT INTO organization_invites (organization_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4)) RETURNING expires_at`,
    [organizationId, hashInviteToken(token), createdBy, INVITE_TTL_DAYS],
  );
  return { token, expiresAt: result.rows[0].expires_at };
}

export async function findOpenInvite(token: string): Promise<{ organizationName: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const result = await pool.query(
    `SELECT o.name FROM organization_invites i JOIN organizations o ON o.id = i.organization_id
     WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()`,
    [hashInviteToken(token)],
  );
  return result.rows[0] ? { organizationName: result.rows[0].name } : null;
}

export class InviteUnavailableError extends Error {
  constructor() { super('This invite link has expired or was already used.'); }
}

// Claims the invite and creates the member in one transaction, so a link can
// never admit two people even when both submit at the same moment.
export async function joinOrganizationWithInvite(token: string, username: string, passwordHash: string): Promise<UserRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invite = await client.query<{ id: number; organization_id: number }>(
      `SELECT id, organization_id FROM organization_invites
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [hashInviteToken(token)],
    );
    if (!invite.rows[0]) throw new InviteUnavailableError();
    let userId: number;
    try {
      const user = await client.query<{ id: number }>(
        'INSERT INTO users (organization_id, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [invite.rows[0].organization_id, username, passwordHash, 'member'],
      );
      userId = user.rows[0].id;
    } catch (error: any) {
      if (error?.code === '23505') throw new UsernameTakenError();
      throw error;
    }
    await client.query('UPDATE organization_invites SET used_at = now(), used_by = $1 WHERE id = $2', [userId, invite.rows[0].id]);
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
