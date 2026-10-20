import { pool } from './pool';

// Who did what, per organization. Written by the gateway after an action
// succeeds; a failure to write never blocks the action itself.

export interface AuditEntry {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  meta: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface AuditActor { id: number | null; username: string | null; organization_id: number }

const MAX_META_BYTES = 2000;

export async function recordAudit(actor: AuditActor, action: string, resource?: { type: string; id?: string | number }, meta: Record<string, unknown> = {}, ip?: string | null): Promise<void> {
  try {
    const json = JSON.stringify(meta);
    await pool.query(
      `INSERT INTO audit_log (organization_id, actor_id, actor_name, action, resource_type, resource_id, meta, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [actor.organization_id, actor.id, actor.username, action, resource?.type ?? null, resource?.id === undefined ? null : String(resource.id), json.length > MAX_META_BYTES ? JSON.stringify({ truncated: true }) : json, ip ?? null],
    );
  } catch (error) {
    console.error('audit log write failed:', error instanceof Error ? error.message : error);
  }
}

export interface AuditFilter { action?: string; actor?: number; before?: number; limit: number }

export function parseAuditFilter(query: Record<string, unknown>): AuditFilter {
  const text = (v: unknown) => (typeof v === 'string' && /^[\w.:-]{1,60}$/.test(v) ? v : undefined);
  const num = (v: unknown) => (typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : undefined);
  return { action: text(query.action), actor: num(query.actor), before: num(query.before), limit: Math.min(500, Math.max(1, num(query.limit) ?? 100)) };
}

export async function listAudit(organizationId: number, filter: AuditFilter): Promise<AuditEntry[]> {
  const where = ['organization_id = $1'];
  const params: unknown[] = [organizationId];
  if (filter.action) { params.push(`${filter.action}%`); where.push(`action LIKE $${params.length}`); }
  if (filter.actor) { params.push(filter.actor); where.push(`actor_id = $${params.length}`); }
  if (filter.before) { params.push(filter.before); where.push(`id < $${params.length}`); }
  params.push(filter.limit);
  const result = await pool.query(
    `SELECT id, actor_id, actor_name, action, resource_type, resource_id, meta, ip, created_at FROM audit_log
     WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT $${params.length}`,
    params,
  );
  return result.rows.map(r => ({ id: r.id, actorId: r.actor_id, actorName: r.actor_name, action: r.action, resourceType: r.resource_type, resourceId: r.resource_id, meta: r.meta ?? {}, ip: r.ip, createdAt: new Date(r.created_at).toISOString() }));
}

// Cells that start with = + - @ are prefixed so a spreadsheet never runs them as formulas.
export function auditCsv(entries: AuditEntry[]): string {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  };
  const rows = entries.map(e => [e.createdAt, e.actorName, e.action, e.resourceType, e.resourceId, JSON.stringify(e.meta), e.ip]);
  return [['time', 'actor', 'action', 'resource_type', 'resource_id', 'details', 'ip'], ...rows].map(r => r.map(cell).join(',')).join('\n');
}
