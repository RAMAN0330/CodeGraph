import { RULES_FILE, calcBlast, calcPRRisk, evaluateRules, findDependencyChains, findTestImpact, type AnalysisLike, type PrRisk, type RuleViolation, type TableUse } from '../analysis/sharedRules';
import { compareAnalyses, type ArchitectureDiff } from '../analysis/compareAnalyses';
import { runAnalysis } from '../analysis/runAnalysis';
import { getAnalysis } from '../db/analysisStore';
import { persistAnalysis } from './analysisHistory';
import { workspaceUrlFor } from './appLinks';
import { createCompletedCheckRun, fetchPathCommitAuthors, fetchPullRequest, fetchPullRequestFiles, upsertMarkedIssueComment, type PullRequestFile } from './githubService';
import { isValidRepoSegment } from './repoAccess';

export const REVIEW_MARKER = '<!-- structrace-pr-review -->';
const CHECK_NAME = 'Structrace impact';
const REVIEWABLE_ACTIONS = new Set(['opened', 'reopened', 'synchronize', 'ready_for_review']);

export interface PrReviewJobData {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  installationId: number;
}

export interface SuggestedReviewer { login: string; commits: number }

export interface PrReviewReport {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string | null;
  headSha: string;
  baseRef: string;
  analyzedCommit: string;
  additions: number;
  deletions: number;
  files: Array<PullRequestFile & { dependents: number | null }>;
  risk: PrRisk;
  testImpact: Array<{ file: string; path: string; suggested?: boolean }>;
  chains: string[][];
  reviewers: SuggestedReviewer[];
  // Changed files that are hotspots (complex and frequently changed) on the base.
  hotspotsTouched?: Array<{ path: string; score: number; churn: number }>;
  // Endpoints whose handler or reach includes a changed file (from the base analysis).
  endpointsAffected?: Array<{ method: string; path: string; via: string }>;
  // What merging would change structurally. Only for 'fresh' reviews, which
  // also analyze the PR's head commit.
  changes?: {
    cycles: ArchitectureDiff['cycles'];
    violations: ArchitectureDiff['violations'];
    largeFiles: ArchitectureDiff['largeFiles'];
    // Head checked against the *base* branch's rules, so a PR can't pass by
    // editing the rule it breaks.
    rules: { introduced: RuleViolation[]; resolved: RuleViolation[]; rulesFileChanged: boolean };
    database: DatabaseChange[];
  };
}

export interface DatabaseChange { table: string; via: 'migration' | 'schema'; usedBy: string[]; total: number }

// Tables a PR changes — through a migration that touches them, or by editing
// the file that defines them — and the existing code that queries them.
export function databaseChanges(base: any, head: any, changedFiles: string[]): DatabaseChange[] {
  const changed = new Set(changedFiles);
  const touched = new Map<string, DatabaseChange['via']>();
  for (const [table, uses] of Object.entries((head?.tableUsage ?? {}) as Record<string, TableUse[]>)) {
    if (uses.some(u => u.kinds.includes('migration') && changed.has(u.file))) touched.set(table, 'migration');
  }
  for (const t of head?.dbTables ?? []) if (changed.has(t.file) && !touched.has(t.name)) touched.set(t.name, 'schema');
  return [...touched].map(([table, via]) => {
    const uses: TableUse[] = base?.tableUsage?.[table] ?? head?.tableUsage?.[table] ?? [];
    const users = uses.filter(u => !u.kinds.includes('migration') && !changed.has(u.file)).map(u => u.file);
    return { table, via, usedBy: users.slice(0, 8), total: users.length };
  }).sort((a, b) => b.total - a.total || a.table.localeCompare(b.table));
}

export function endpointsAffectedBy(endpoints: any[], changedFiles: string[]): Array<{ method: string; path: string; via: string }> {
  const changed = new Set(changedFiles);
  return endpoints
    .map(e => ({ e, via: changed.has(e.file) ? e.file : (e.reach ?? []).find((f: string) => changed.has(f)) }))
    .filter(x => x.via)
    .map(({ e, via }) => ({ method: e.method, path: e.path, via }));
}

// The PR is judged by the rules on its target branch, not by its own copy.
export function ruleChanges(base: any, head: any, rulesFileChanged: boolean): NonNullable<PrReviewReport['changes']>['rules'] {
  const rules = base?.rules?.rules ?? [];
  const key = (v: RuleViolation) => `${v.rule}\u0000${v.from}\u0000${v.to}`;
  const before = new Map(evaluateRules(rules, base.connections || []).map(v => [key(v), v]));
  const after = new Map(evaluateRules(rules, head.connections || []).map(v => [key(v), v]));
  return {
    introduced: [...after].filter(([k]) => !before.has(k)).map(([, v]) => v),
    resolved: [...before].filter(([k]) => !after.has(k)).map(([, v]) => v),
    rulesFileChanged,
  };
}

// Only open, non-draft PRs whose code changed get a review; everything else
// GitHub sends to the webhook (labels, comments, closes) is ignored.
export function prReviewJobFromEvent(event: unknown, payload: any): PrReviewJobData | null {
  if (event !== 'pull_request' || !REVIEWABLE_ACTIONS.has(payload?.action)) return null;
  const pr = payload.pull_request;
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const installationId = payload.installation?.id;
  if (!pr || pr.draft || pr.state !== 'open') return null;
  if (!isValidRepoSegment(owner) || !isValidRepoSegment(repo)) return null;
  if (!Number.isInteger(pr.number) || !Number.isInteger(installationId) || typeof pr.head?.sha !== 'string') return null;
  return { owner, repo, number: pr.number, headSha: pr.head.sha, installationId };
}

// The analysis a PR is scored against must be the base branch at the PR's
// base commit. Reuses the stored one when it already is; otherwise analyzes
// that exact commit (cheap after the first time: file blobs are cached by
// sha) and stores it, which also keeps the workspace for that branch fresh.
async function ensureBaseAnalysis(owner: string, repo: string, baseRef: string, baseSha: string, token: string): Promise<AnalysisLike> {
  const stored = await getAnalysis(owner, repo, baseRef);
  if (stored && stored.commitSha === baseSha) return stored.data as AnalysisLike;
  const data = await runAnalysis({ owner, repo, branch: baseSha, token });
  await persistAnalysis(owner, repo, baseRef, baseSha, data);
  return data;
}

// Real reviewers: whoever most recently committed to the changed files with
// the widest reach, excluding the PR's author and bots.
async function suggestReviewers(owner: string, repo: string, ref: string, files: PrReviewReport['files'], author: string | null, token?: string): Promise<SuggestedReviewer[]> {
  const candidates = files
    .filter(f => f.status !== 'added')
    .sort((a, b) => (b.dependents ?? 0) - (a.dependents ?? 0) || (b.additions + b.deletions) - (a.additions + a.deletions))
    .slice(0, 5);
  const counts = new Map<string, number>();
  const authorLists = await Promise.all(candidates.map(f => fetchPathCommitAuthors(owner, repo, f.filename, ref, token).catch(() => [] as string[])));
  authorLists.flat().forEach(login => {
    if (login === author || login.endsWith('[bot]')) return;
    counts.set(login, (counts.get(login) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([login, commits]) => ({ login, commits }));
}

export class MissingAnalysisError extends Error {
  constructor(readonly baseRef: string) {
    super(`No analysis of ${baseRef} yet. Analyze the repository first, then review its pull requests.`);
  }
}

// The stored analysis of the PR's base branch, else of the default branch
// (stored as HEAD when the workspace was opened without picking a branch).
async function storedBaseAnalysis(owner: string, repo: string, baseRef: string): Promise<{ data: AnalysisLike; commitSha: string }> {
  const stored = (await getAnalysis(owner, repo, baseRef)) ?? (await getAnalysis(owner, repo, 'HEAD'));
  if (!stored) throw new MissingAnalysisError(baseRef);
  return { data: stored.data as AnalysisLike, commitSha: stored.commitSha };
}

export async function buildPrReview(input: {
  owner: string; repo: string; number: number; token?: string;
  // 'fresh' analyzes the exact base commit (the webhook path, needs a token);
  // 'stored' reuses whatever analysis the workspace already has (in-app).
  analysis: 'fresh' | 'stored';
}): Promise<PrReviewReport> {
  const { owner, repo, number, token } = input;
  const pr = await fetchPullRequest(owner, repo, number, token);
  const prFiles = await fetchPullRequestFiles(owner, repo, number, token);
  let analysis: { data: AnalysisLike; commitSha: string };
  if (input.analysis === 'stored') {
    analysis = await storedBaseAnalysis(owner, repo, pr.base.ref);
  } else {
    if (!token) throw new Error('A token is required to analyze the base branch.');
    analysis = { data: await ensureBaseAnalysis(owner, repo, pr.base.ref, pr.base.sha, token), commitSha: pr.base.sha };
  }
  const data = analysis.data;
  let changes: PrReviewReport['changes'];
  if (input.analysis === 'fresh') {
    // Fork PR heads are readable through the base repository's git API.
    const head = await runAnalysis({ owner, repo, branch: pr.head.sha, token, withHistory: false });
    const diff = compareAnalyses(data, head);
    changes = {
      cycles: diff.cycles,
      violations: diff.violations,
      largeFiles: diff.largeFiles,
      rules: ruleChanges(data, head, prFiles.some(f => f.filename === RULES_FILE)),
      database: databaseChanges(data, head, prFiles.map(f => f.filename)),
    };
  }
  const known = new Set(data.files.map((f: any) => f.path));
  const files = prFiles.map(f => ({ ...f, dependents: known.has(f.filename) ? calcBlast(f.filename, data.connections, data.files).count : null }));
  const prLike = { files: prFiles, additions: pr.additions, deletions: pr.deletions };
  const author = pr.user?.login ?? null;
  return {
    owner, repo, number,
    title: pr.title,
    url: pr.html_url,
    author,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    analyzedCommit: analysis.commitSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files,
    risk: calcPRRisk(prLike, data),
    testImpact: findTestImpact(prLike, data),
    chains: findDependencyChains(prLike, data),
    reviewers: await suggestReviewers(owner, repo, pr.base.sha, files, author, token),
    endpointsAffected: endpointsAffectedBy((data as any).endpoints ?? [], prFiles.map(f => f.filename)),
    hotspotsTouched: ((data as any).hotspots?.items ?? [])
      .filter((h: any) => prFiles.some(f => f.filename === h.path))
      .map((h: any) => ({ path: h.path, score: h.score, churn: h.churn })),
    changes,
  };
}

function code(value: string): string {
  return '`' + value.replace(/`/g, "'") + '`';
}

export function renderPrReviewMarkdown(report: PrReviewReport, workspaceUrl?: string): string {
  const { risk } = report;
  const lines: string[] = [REVIEW_MARKER, '### Structrace impact review', ''];
  lines.push(`**Risk: ${risk.level.toUpperCase()} (${risk.score}/100)** · ${report.files.length} files changed · +${report.additions} −${report.deletions} · blast radius ${risk.totalBlast ?? 0} files`);
  if (risk.factors.length) {
    lines.push('', '**Why**');
    risk.factors.forEach(f => lines.push(`- ${f}`));
  }
  const c = report.changes;
  if (c) {
    const introduced: string[] = [];
    c.rules.introduced.slice(0, 10).forEach(v => introduced.push(`- ${v.severity === 'error' ? '⛔' : '⚠️'} **${v.rule}**: ${code(v.from)} → ${code(v.to)}`));
    c.cycles.introduced.items.slice(0, 5).forEach(([a, b]) => introduced.push(`- New circular dependency: ${code(a)} ↔ ${code(b)}`));
    c.violations.introduced.items.slice(0, 5).forEach(v => introduced.push(`- Layer violation: ${code(v.from)} → ${code(v.to)}${v.fromLayer ? ` (${v.fromLayer} → ${v.toLayer})` : ''}`));
    c.largeFiles.introduced.items.slice(0, 5).forEach(f => introduced.push(`- ${code(f.path)} grew to ${f.functions} functions`));
    const more = c.rules.introduced.length - Math.min(10, c.rules.introduced.length) + c.cycles.introduced.total - Math.min(5, c.cycles.introduced.items.length) + c.violations.introduced.total - Math.min(5, c.violations.introduced.items.length);
    if (introduced.length) {
      lines.push('', '**Introduced by this PR**', ...introduced);
      if (more > 0) lines.push(`- …and ${more} more`);
    }
    const n = (count: number, one: string, many: string) => (count ? [`${count} ${count === 1 ? one : many}`] : []);
    const resolved = [
      ...n(c.rules.resolved.length, 'rule violation', 'rule violations'),
      ...n(c.cycles.resolved.total, 'circular dependency', 'circular dependencies'),
      ...n(c.violations.resolved.total, 'layer violation', 'layer violations'),
    ];
    if (resolved.length) lines.push('', `**Resolved by this PR:** ${resolved.join(', ')}`);
    if (c.database.length) {
      lines.push('', '**Database tables touched**');
      c.database.slice(0, 8).forEach(d => {
        const users = d.total ? ` — queried by ${d.total} file${d.total === 1 ? '' : 's'}: ${d.usedBy.slice(0, 5).map(code).join(', ')}${d.total > 5 ? ', …' : ''}` : ' — no other code queries it';
        lines.push(`- ${code(d.table)} (${d.via === 'migration' ? 'migration' : 'schema change'})${users}`);
      });
      if (c.database.length > 8) lines.push(`- …and ${c.database.length - 8} more tables`);
    }
    if (c.rules.rulesFileChanged) lines.push('', `> This PR edits ${code(RULES_FILE)}. It was checked against the rules on ${code(report.baseRef)}; the new rules apply after merge.`);
  }
  if (report.endpointsAffected?.length) {
    lines.push('', `**Endpoints affected (${report.endpointsAffected.length})**`);
    report.endpointsAffected.slice(0, 10).forEach(e => lines.push(`- \`${e.method} ${e.path.replace(/`/g, "'")}\` — through ${code(e.via)}`));
    if (report.endpointsAffected.length > 10) lines.push(`- …and ${report.endpointsAffected.length - 10} more`);
  }
  if (report.hotspotsTouched?.length) {
    lines.push('', '**Hotspots touched** — complex files that change often; worth a careful review');
    report.hotspotsTouched.slice(0, 5).forEach(h => lines.push(`- ${code(h.path)} — hotspot score ${h.score}, ${h.churn} change${h.churn === 1 ? '' : 's'} in the last 180 days`));
  }
  const reach = report.files.filter(f => (f.dependents ?? 0) > 0).sort((a, b) => (b.dependents ?? 0) - (a.dependents ?? 0)).slice(0, 5);
  if (reach.length) {
    lines.push('', '**Changed files with the most dependents**', '', '| File | Files that depend on it |', '|---|---|');
    reach.forEach(f => lines.push(`| ${code(f.filename)} | ${f.dependents} |`));
  }
  if (report.chains.length) {
    lines.push('', '**Downstream chains**');
    report.chains.forEach(chain => lines.push(`- ${chain.map(code).join(' → ')}`));
  }
  if (report.testImpact.length) {
    const suggested = report.testImpact.every(t => t.suggested);
    lines.push('', suggested ? '**Tests** — none match the changed files by name; closest candidates:' : '**Tests likely affected**');
    report.testImpact.slice(0, 8).forEach(t => lines.push(`- ${code(t.path)}`));
  }
  if (report.reviewers.length) {
    lines.push('', `**Suggested reviewers:** ${report.reviewers.map(r => `@${r.login} (${r.commits} recent commit${r.commits === 1 ? '' : 's'} to these files)`).join(', ')}`);
  }
  const footer = [`Scored against ${code(report.baseRef)} @ ${code(report.analyzedCommit.slice(0, 7))}`];
  if (workspaceUrl) footer.push(`[Open in Structrace](${workspaceUrl})`);
  lines.push('', `<sub>${footer.join(' · ')}</sub>`);
  return lines.join('\n');
}

// Risk alone never blocks a merge: high/critical is "neutral", which stands
// out without failing required checks. The check fails only when the PR
// introduces a violation of a rule the team marked "error" in RULES_FILE.
export function checkConclusion(report: PrReviewReport): { conclusion: 'success' | 'neutral' | 'failure'; title: string } {
  const blocking = report.changes?.rules.introduced.filter(v => v.severity === 'error').length ?? 0;
  if (blocking) return { conclusion: 'failure', title: `${blocking} architecture rule violation${blocking === 1 ? '' : 's'} introduced` };
  const risky = report.risk.level === 'high' || report.risk.level === 'critical';
  return { conclusion: risky ? 'neutral' : 'success', title: `Risk ${report.risk.level} (${report.risk.score}/100)` };
}

export async function publishPrReview(report: PrReviewReport, token: string): Promise<void> {
  const workspaceUrl = workspaceUrlFor(report.owner, report.repo);
  const body = renderPrReviewMarkdown(report, workspaceUrl);
  await upsertMarkedIssueComment(report.owner, report.repo, report.number, REVIEW_MARKER, body, token);
  await createCompletedCheckRun(report.owner, report.repo, token, {
    name: CHECK_NAME,
    headSha: report.headSha,
    ...checkConclusion(report),
    summary: body.replace(REVIEW_MARKER, '').trim(),
    detailsUrl: workspaceUrl,
  });
}
