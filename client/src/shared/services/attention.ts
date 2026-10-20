// "Needs attention": every signal a workspace already computes, merged into one
// ranked list with a reason, an effort estimate and a place to act on it.
// Score = severity weight + a bonus for reach (files, rows or endpoints affected),
// so a problem that touches more of the system outranks an equal one that touches less.

export type AttentionSeverity = 'critical' | 'high' | 'medium' | 'low';
export interface AttentionItem {
  id: string;
  source: 'code' | 'database';
  severity: AttentionSeverity;
  title: string;
  why: string;
  effort: 'minutes' | 'hours' | 'days';
  reach: number;
  target: string;
  score: number;
}

const WEIGHT: Record<AttentionSeverity, number> = { critical: 100, high: 70, medium: 40, low: 15 };
const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function item(base: Omit<AttentionItem, 'score'>): AttentionItem {
  return { ...base, score: Math.round(WEIGHT[base.severity] + Math.min(30, Math.log2(1 + base.reach) * 6)) };
}

export function rankAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

interface CodeInput {
  data: any;
  vulns?: any[];
  regressions?: Array<{ id: number; kind: string; message: string }>;
  cycleCount?: number;
  cycleFiles?: number;
  suggestions?: Array<{ title: string; desc: string; priority: string }>;
}

export function codeAttention({ data, vulns = [], regressions = [], cycleCount = 0, cycleFiles = 0, suggestions = [] }: CodeInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  const security: any[] = data?.securityIssues ?? [];
  const high = security.filter(i => i.severity === 'high');
  if (high.length) out.push(item({ id: 'code:security-high', source: 'code', severity: 'critical', title: `${plural(high.length, 'high-severity code finding')}`, why: 'Patterns such as injection or hard-coded secrets that attackers look for first.', effort: 'hours', reach: new Set(high.map(i => i.path)).size, target: 'security' }));
  const serious = vulns.filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH');
  if (serious.length) out.push(item({ id: 'code:vulns', source: 'code', severity: 'critical', title: `${plural(serious.length, 'vulnerable dependency')}`, why: 'Known critical or high advisories in packages this repository installs.', effort: 'hours', reach: serious.length, target: 'security' }));
  regressions.slice(0, 2).forEach(r => out.push(item({ id: `code:regression:${r.id}`, source: 'code', severity: 'high', title: `Regression: ${r.message}`, why: 'This got worse between the last two analyzed commits.', effort: 'hours', reach: 1, target: 'trends' })));
  if (cycleCount) out.push(item({ id: 'code:cycles', source: 'code', severity: 'high', title: `${plural(cycleCount, 'dependency cycle')} across ${plural(cycleFiles, 'file')}`, why: 'Files in a cycle cannot be changed, tested or reused on their own.', effort: 'days', reach: cycleFiles, target: 'cycles' }));
  const hotspots: any[] = data?.hotspots?.status === 'ok' ? data.hotspots.items ?? [] : [];
  hotspots.slice(0, 3).forEach((h, i) => out.push(item({ id: `code:hotspot:${h.path}`, source: 'code', severity: i === 0 ? 'high' : 'medium', title: `${h.path.split('/').pop()} is complex and changes often`, why: `Complexity ${h.complexity}, ${h.churn} recent changes${h.authors ? ` by ${plural(h.authors, 'author')}` : ''}. Bugs cluster here.`, effort: 'days', reach: h.churn ?? 1, target: 'hotspots' })));
  const violations: any[] = data?.layerViolations ?? [];
  if (violations.length) out.push(item({ id: 'code:layers', source: 'code', severity: 'medium', title: `${plural(violations.length, 'layer violation')}`, why: 'Imports that go against the layer order make the architecture harder to follow.', effort: 'days', reach: violations.length, target: 'rules' }));
  const dead: any[] = data?.deadFunctions ?? [];
  if (dead.length) out.push(item({ id: 'code:dead', source: 'code', severity: 'low', title: `${plural(dead.length, 'unused function')}`, why: 'Nothing calls them; removing them shrinks what a new reader has to understand.', effort: 'hours', reach: dead.length, target: 'unused' }));
  suggestions.slice(0, 3).forEach(sg => out.push(item({ id: `code:suggestion:${sg.title}`, source: 'code', severity: sg.priority === 'critical' ? 'high' : sg.priority === 'high' ? 'medium' : 'low', title: sg.title, why: sg.desc, effort: 'hours', reach: 1, target: 'debt' })));
  return out;
}

interface DbInput {
  overview: any;
  tables?: Array<{ name: string; columns: Array<{ isPrimary: boolean }>; rowEstimate?: number | null }>;
}

export function databaseAttention({ overview, tables = [] }: DbInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  (overview?.activeAlerts ?? []).forEach((a: any) => out.push(item({ id: `db:alert:${a.rule.id}`, source: 'database', severity: a.severity === 'critical' ? 'critical' : a.severity === 'high' ? 'high' : 'medium', title: `Alert firing: ${a.rule.metric.replace(/_/g, ' ')} ${a.rule.condition === 'gt' ? '>' : '<'} ${a.rule.threshold}`, why: `Currently ${Number(a.currentValue).toFixed(1)} for at least ${a.rule.forMinutes} min.`, effort: 'hours', reach: 1, target: 'alerts' })));
  (overview?.healthMatrix ?? []).filter((r: any) => r.status === 'critical' || r.status === 'warning').forEach((r: any) => out.push(item({ id: `db:health:${r.category}`, source: 'database', severity: r.status === 'critical' ? 'high' : 'medium', title: `${r.category[0].toUpperCase()}${r.category.slice(1)} check is ${r.status}`, why: r.detail ?? 'The database health check reported a problem.', effort: 'hours', reach: 1, target: r.category === 'queries' ? 'queries' : r.category === 'storage' ? 'storage' : r.category === 'replication' ? 'replication' : 'performance' })));
  const slow = Array.isArray(overview?.topQueries) ? overview.topQueries.filter((q: any) => q.impact === 'critical' || q.impact === 'high') : [];
  if (slow.length) out.push(item({ id: 'db:slow-queries', source: 'database', severity: 'high', title: `${plural(slow.length, 'slow, frequent query')}`, why: `The worst takes ${Math.round(Math.max(...slow.map((q: any) => q.avgMs)))} ms on average and runs ${Math.max(...slow.map((q: any) => q.calls)).toLocaleString()} times.`, effort: 'hours', reach: slow.reduce((n: number, q: any) => n + q.calls, 0), target: 'queries' }));
  const noKey = tables.filter(t => t.columns.length && !t.columns.some(c => c.isPrimary));
  if (noKey.length) out.push(item({ id: 'db:no-pk', source: 'database', severity: 'medium', title: `${plural(noKey.length, 'table')} without a primary key`, why: `${noKey.slice(0, 3).map(t => t.name).join(', ')}${noKey.length > 3 ? '…' : ''}: rows cannot be uniquely addressed, replicated safely or edited by tools.`, effort: 'hours', reach: noKey.reduce((n, t) => n + (t.rowEstimate ?? 0), 0), target: 'schema' }));
  if (overview?.connections?.waiting > 0) out.push(item({ id: 'db:waiting', source: 'database', severity: 'medium', title: `${plural(overview.connections.waiting, 'connection')} waiting`, why: 'Clients are queued behind locks or a full pool.', effort: 'hours', reach: overview.connections.waiting, target: 'performance' }));
  return out;
}
