import { snapshotOf, type AnalysisSnapshot, type RuleViolation } from './sharedRules';

// Architecture-level difference between two analyses of the same repository
// (typically base branch vs. feature branch): what the change does to the
// dependency graph, rather than which lines it touches.

const LIST_LIMIT = 50;
const LARGE_FILE_FUNCTIONS = 15; // same threshold as runAnalysis's "Large Files" issue

export interface Dependency { from: string; to: string }
export interface Capped<T> { items: T[]; total: number }

export interface ArchitectureDiff {
  base: AnalysisSnapshot;
  head: AnalysisSnapshot;
  files: { added: Capped<string>; removed: Capped<string> };
  // "from now imports/uses to" — file-level, deduplicated across functions.
  dependencies: { added: Capped<Dependency>; removed: Capped<Dependency> };
  cycles: { introduced: Capped<[string, string]>; resolved: Capped<[string, string]> };
  violations: { introduced: Capped<ViolationRef>; resolved: Capped<ViolationRef> };
  // Violations of the team's structrace.rules.json (each side checked against its own rules file).
  rules: { introduced: Capped<RuleViolation>; resolved: Capped<RuleViolation> };
  largeFiles: { introduced: Capped<{ path: string; functions: number }> };
}

export interface ViolationRef { from: string; to: string; fromLayer?: string; toLayer?: string }

function capped<T>(items: T[]): Capped<T> {
  return { items: items.slice(0, LIST_LIMIT), total: items.length };
}

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

// runAnalysis records a connection as source = file defining the function,
// target = file calling it; flip it so `from` is the file taking the dependency.
function dependencyMap(data: any): Map<string, Dependency> {
  const map = new Map<string, Dependency>();
  (data.connections || []).forEach((c: any) => {
    const to = endpoint(c.source);
    const from = endpoint(c.target);
    if (from && to && from !== to) map.set(`${from}\u0000${to}`, { from, to });
  });
  return map;
}

function cycleMap(data: any): Map<string, [string, string]> {
  const map = new Map<string, [string, string]>();
  const issue = (data.issues || []).find((i: any) => String(i.title || '').includes('Circular'));
  (issue?.items || []).forEach((item: any) => {
    if (!Array.isArray(item.files) || item.files.length !== 2) return;
    const pair = [...item.files].sort() as [string, string];
    map.set(pair.join('\u0000'), pair);
  });
  return map;
}

function violationMap(data: any): Map<string, ViolationRef> {
  const map = new Map<string, ViolationRef>();
  (data.layerViolations || []).forEach((v: any) => {
    if (v.from && v.to) map.set(`${v.from}\u0000${v.to}`, { from: v.from, to: v.to, fromLayer: v.fromLayer, toLayer: v.toLayer });
  });
  return map;
}

function ruleViolationMap(data: any): Map<string, RuleViolation> {
  const map = new Map<string, RuleViolation>();
  (data.ruleViolations || []).forEach((v: RuleViolation) => map.set(`${v.rule}\u0000${v.from}\u0000${v.to}`, v));
  return map;
}

function onlyIn<T>(a: Map<string, T>, b: Map<string, T>): T[] {
  return [...a.entries()].filter(([key]) => !b.has(key)).map(([, value]) => value);
}

export function compareAnalyses(base: any, head: any, at = new Date().toISOString()): ArchitectureDiff {
  const basePaths = new Set<string>((base.files || []).map((f: any) => f.path));
  const headPaths = new Set<string>((head.files || []).map((f: any) => f.path));
  const baseFunctions = new Map<string, number>((base.files || []).map((f: any) => [f.path, (f.functions || []).length]));
  const baseDeps = dependencyMap(base);
  const headDeps = dependencyMap(head);
  const baseCycles = cycleMap(base);
  const headCycles = cycleMap(head);
  const baseViolations = violationMap(base);
  const headViolations = violationMap(head);
  const baseRules = ruleViolationMap(base);
  const headRules = ruleViolationMap(head);
  const newlyLarge = (head.files || [])
    .map((f: any) => ({ path: f.path as string, functions: (f.functions || []).length as number }))
    .filter((f: { path: string; functions: number }) => f.functions > LARGE_FILE_FUNCTIONS && (baseFunctions.get(f.path) ?? 0) <= LARGE_FILE_FUNCTIONS)
    .sort((a: { functions: number }, b: { functions: number }) => b.functions - a.functions);

  return {
    base: snapshotOf(base, at),
    head: snapshotOf(head, at),
    files: {
      added: capped([...headPaths].filter(p => !basePaths.has(p)).sort()),
      removed: capped([...basePaths].filter(p => !headPaths.has(p)).sort()),
    },
    dependencies: { added: capped(onlyIn(headDeps, baseDeps)), removed: capped(onlyIn(baseDeps, headDeps)) },
    cycles: { introduced: capped(onlyIn(headCycles, baseCycles)), resolved: capped(onlyIn(baseCycles, headCycles)) },
    violations: { introduced: capped(onlyIn(headViolations, baseViolations)), resolved: capped(onlyIn(baseViolations, headViolations)) },
    rules: { introduced: capped(onlyIn(headRules, baseRules)), resolved: capped(onlyIn(baseRules, headRules)) },
    largeFiles: { introduced: capped(newlyLarge) },
  };
}
