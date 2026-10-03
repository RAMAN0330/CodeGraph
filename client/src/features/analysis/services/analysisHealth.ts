// Health score, compact snapshots and regression rules for an analysis result.
// Zero imports on purpose: the server imports this file directly (see
// server/src/analysis/sharedRules.ts) to snapshot every saved analysis and
// raise regression alerts, so both sides agree on what "got worse" means.

export interface Health { score: number; grade: string }

export interface AnalysisSnapshot {
  commitSha?: string;
  timestamp: string; // ISO string
  healthScore: number;
  healthGrade: string;
  circular: number;
  stats: {
    files: number; functions: number; connections: number; loc: number;
    security: number; dead: number; violations: number; duplicates: number; patterns: number;
    // Absent in snapshots recorded before team rules existed.
    ruleViolations?: number;
  };
}

export interface Regression {
  kind: 'health' | 'circular' | 'security' | 'violations' | 'rules';
  message: string;
  previous: number;
  current: number;
}

const GRADES = ['F', 'D', 'C', 'B', 'A'];
// A score wobble smaller than this isn't worth an alert unless the grade drops.
const HEALTH_DROP_THRESHOLD = 5;

export function calcHealth(data: any): Health {
  if (!data) return { score: 0, grade: 'F' };
  var score = 100;
  var deadPct = data.stats.functions > 0 ? (data.stats.dead / data.stats.functions * 100) : 0;
  score -= Math.min(20, deadPct);
  var circular = data.issues.filter(function (i: any) { return i.title.includes('Circular'); }).length;
  score -= Math.min(20, circular * 5);
  var god = data.issues.filter(function (i: any) { return i.title.includes('Large'); }).length;
  score -= Math.min(15, god * 3);
  var avgCoup = data.stats.files > 0 ? (data.stats.connections / data.stats.files) : 0;
  score -= Math.min(15, Math.max(0, avgCoup - 3) * 2);
  var sec = data.securityIssues ? data.securityIssues.filter(function (i: any) { return i.severity === 'high'; }).length : 0;
  score -= Math.min(20, sec * 5);
  score = Math.max(0, Math.round(score));
  var grade = 'F';
  if (score >= 90) grade = 'A'; else if (score >= 80) grade = 'B'; else if (score >= 70) grade = 'C'; else if (score >= 60) grade = 'D';
  return { score: score, grade: grade };
}

export function snapshotOf(data: any, timestamp: string, commitSha?: string): AnalysisSnapshot {
  const health = calcHealth(data);
  const stats = data.stats || {};
  const circularIssue = (data.issues || []).find((i: any) => String(i.title || '').includes('Circular'));
  return {
    commitSha,
    timestamp,
    healthScore: health.score,
    healthGrade: health.grade,
    circular: circularIssue && Array.isArray(circularIssue.items) ? circularIssue.items.length : 0,
    stats: {
      files: stats.files || 0, functions: stats.functions || 0, connections: stats.connections || 0, loc: stats.loc || 0,
      security: stats.security || 0, dead: stats.dead || 0, violations: stats.violations || 0,
      duplicates: stats.duplicates || 0, patterns: stats.patterns || 0, ruleViolations: stats.ruleViolations || 0,
    },
  };
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function detectRegressions(previous: AnalysisSnapshot | null, current: AnalysisSnapshot): Regression[] {
  if (!previous) return [];
  const found: Regression[] = [];
  const gradeDropped = GRADES.indexOf(current.healthGrade) < GRADES.indexOf(previous.healthGrade);
  if (gradeDropped || previous.healthScore - current.healthScore >= HEALTH_DROP_THRESHOLD) {
    found.push({ kind: 'health', previous: previous.healthScore, current: current.healthScore, message: `Health dropped from ${previous.healthGrade} (${previous.healthScore}) to ${current.healthGrade} (${current.healthScore})` });
  }
  const increase = (kind: Regression['kind'], before: number, after: number, singular: string, plural: string) => {
    if (after > before) found.push({ kind, previous: before, current: after, message: `${count(after - before, singular, plural)} (${before} → ${after})` });
  };
  increase('circular', previous.circular, current.circular, 'new circular dependency', 'new circular dependencies');
  increase('security', previous.stats.security, current.stats.security, 'new high-severity security finding', 'new high-severity security findings');
  increase('violations', previous.stats.violations, current.stats.violations, 'new architecture violation', 'new architecture violations');
  increase('rules', previous.stats.ruleViolations ?? 0, current.stats.ruleViolations ?? 0, 'new rule violation', 'new rule violations');
  return found;
}
