import { pool } from '../db/pool';
import { getAnalysis } from '../db/analysisStore';
import { revealSecret } from './credentialCipher';
import { sendWebhookMessage } from './alertNotifier';
import { workspaceUrlFor } from './appLinks';

// A weekly summary per codebase project, posted to its alert webhook (the same
// Slack/Discord destination as regression alerts). Weeks with nothing to say
// send nothing.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface DigestInput {
  project: string;
  repository: string;
  health: { from: { score: number; grade: string }; to: { score: number; grade: string } } | null;
  analyses: number;
  regressions: string[];
  hotspots: Array<{ path: string; score: number }>;
  notes: { open: number; newThisWeek: number };
  workspaceUrl: string;
}

export function formatDigest(d: DigestInput): string | null {
  const hasNews = d.analyses > 0 || d.regressions.length > 0 || d.notes.newThisWeek > 0;
  if (!hasNews) return null;
  const lines = [`Structrace weekly: ${d.project} (${d.repository})`];
  if (d.health) {
    const delta = d.health.to.score - d.health.from.score;
    const trend = delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : ''}${delta}`;
    lines.push(`• Health ${d.health.from.grade} (${d.health.from.score}) → ${d.health.to.grade} (${d.health.to.score}), ${trend} over ${d.analyses} analyzed commit${d.analyses === 1 ? '' : 's'}`);
  } else if (d.analyses) {
    lines.push(`• ${d.analyses} analyzed commit${d.analyses === 1 ? '' : 's'} this week`);
  }
  if (d.regressions.length) {
    lines.push(`• ${d.regressions.length} regression${d.regressions.length === 1 ? '' : 's'}:`);
    d.regressions.slice(0, 5).forEach(r => lines.push(`    – ${r}`));
    if (d.regressions.length > 5) lines.push(`    – …and ${d.regressions.length - 5} more`);
  } else if (d.analyses) {
    lines.push('• No regressions');
  }
  if (d.hotspots.length) lines.push(`• Top hotspots: ${d.hotspots.slice(0, 3).map(h => `${h.path} (${h.score})`).join(', ')}`);
  if (d.notes.open || d.notes.newThisWeek) lines.push(`• Team notes: ${d.notes.open} open${d.notes.newThisWeek ? `, ${d.notes.newThisWeek} new this week` : ''}`);
  lines.push(d.workspaceUrl);
  return lines.join('\n');
}

interface DigestTarget { projectName: string; repository: string; organizationId: number; webhook: string }

async function digestTargets(): Promise<DigestTarget[]> {
  const result = await pool.query(
    `SELECT p.name, p.repository_full_name, p.alert_webhook_encrypted, u.organization_id
     FROM projects p JOIN users u ON u.id = p.user_id
     WHERE p.project_type = 'codebase' AND p.repository_full_name IS NOT NULL AND p.alert_webhook_encrypted IS NOT NULL`,
  );
  const seen = new Set<string>();
  const targets: DigestTarget[] = [];
  for (const row of result.rows) {
    const webhook = revealSecret(row.alert_webhook_encrypted);
    // Two projects sending the same repository to the same channel get one digest.
    const key = `${webhook}\u0000${String(row.repository_full_name).toLowerCase()}`;
    if (!webhook || seen.has(key)) continue;
    seen.add(key);
    targets.push({ projectName: row.name, repository: row.repository_full_name, organizationId: row.organization_id, webhook });
  }
  return targets;
}

async function digestFor(target: DigestTarget, now: Date): Promise<DigestInput> {
  const [owner, repo] = target.repository.toLowerCase().split('/');
  const since = new Date(now.getTime() - WEEK_MS);
  const snapshots = await pool.query(
    `SELECT snapshot_json, captured_at FROM analysis_snapshots
     WHERE owner = $1 AND repo = $2 AND branch = 'HEAD' ORDER BY captured_at ASC, id ASC`,
    [owner, repo],
  );
  const rows = snapshots.rows as Array<{ snapshot_json: any; captured_at: Date }>;
  const thisWeek = rows.filter(r => new Date(r.captured_at) >= since);
  const before = rows.filter(r => new Date(r.captured_at) < since).pop() ?? thisWeek[0];
  const latest = thisWeek[thisWeek.length - 1];
  const alerts = await pool.query(
    'SELECT message FROM analysis_alerts WHERE owner = $1 AND repo = $2 AND created_at >= $3 ORDER BY created_at ASC',
    [owner, repo, since],
  );
  const notes = await pool.query(
    `SELECT count(*) FILTER (WHERE resolved_at IS NULL)::int AS open, count(*) FILTER (WHERE created_at >= $4)::int AS new
     FROM annotations WHERE organization_id = $1 AND owner = $2 AND repo = $3`,
    [target.organizationId, owner, repo, since],
  );
  const stored = await getAnalysis(owner, repo, 'HEAD');
  const hotspots = ((stored?.data as any)?.hotspots?.status === 'ok' ? (stored!.data as any).hotspots.items : []) as Array<{ path: string; score: number }>;
  return {
    project: target.projectName,
    repository: target.repository,
    health: latest && before ? { from: { score: before.snapshot_json.healthScore, grade: before.snapshot_json.healthGrade }, to: { score: latest.snapshot_json.healthScore, grade: latest.snapshot_json.healthGrade } } : null,
    analyses: thisWeek.length,
    regressions: alerts.rows.map(r => r.message),
    hotspots,
    notes: { open: notes.rows[0]?.open ?? 0, newThisWeek: notes.rows[0]?.new ?? 0 },
    workspaceUrl: workspaceUrlFor(owner, repo),
  };
}

// Digests that have something to say, ready to send.
export async function buildDigests(now = new Date()): Promise<Array<{ webhook: string; repository: string; text: string }>> {
  const out: Array<{ webhook: string; repository: string; text: string }> = [];
  for (const target of await digestTargets()) {
    try {
      const text = formatDigest(await digestFor(target, now));
      if (text) out.push({ webhook: target.webhook, repository: target.repository, text });
    } catch (error: any) {
      console.error(`Weekly digest for ${target.repository} failed:`, error.message);
    }
  }
  return out;
}

export async function sendWeeklyDigests(now = new Date()): Promise<number> {
  let sent = 0;
  for (const digest of await buildDigests(now)) {
    try {
      await sendWebhookMessage(digest.webhook, digest.text);
      sent++;
    } catch (error: any) {
      console.error(`Weekly digest for ${digest.repository} failed:`, error.message);
    }
  }
  return sent;
}
