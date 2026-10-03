// Team-defined architecture rules, read from `structrace.rules.json` at the
// repository root so they are versioned and reviewed with the code. Zero
// imports: the server's analysis job evaluates the same rules (see
// server/src/analysis/sharedRules.ts).
//
// {
//   "rules": [
//     { "name": "UI never touches the database", "from": "src/ui/**", "disallow": ["src/db/**"] },
//     { "name": "Only services use the API client", "to": "src/api/client.ts", "allowOnlyFrom": ["src/services/**"], "severity": "warning" }
//   ]
// }

export const RULES_FILE = 'structrace.rules.json';
const MAX_RULES = 50;

export type RuleSeverity = 'error' | 'warning';
export type ArchitectureRule =
  | { kind: 'forbidden'; name: string; severity: RuleSeverity; from: string[]; disallow: string[] }
  | { kind: 'only'; name: string; severity: RuleSeverity; to: string[]; allowOnlyFrom: string[] };

export interface RuleViolation { rule: string; severity: RuleSeverity; from: string; to: string }
export interface ParsedRules { rules: ArchitectureRule[]; errors: string[] }

// Repo-relative globs: ** spans folders, * and ? stay within one. A plain
// path names that file or everything under that folder; a trailing slash
// means the folder's contents.
export function globToRegExp(pattern: string): RegExp {
  let p = pattern.trim().replace(/^\.?\//, '');
  if (p.endsWith('/')) p += '**';
  const escape = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  if (!/[*?]/.test(p)) return new RegExp(`^${escape(p)}(?:/.*)?$`);
  let out = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += escape(c);
  }
  return new RegExp(`^${out}$`);
}

function patterns(value: unknown): string[] | null {
  const list = typeof value === 'string' ? [value] : Array.isArray(value) ? value : null;
  if (!list || !list.length || list.some(v => typeof v !== 'string' || !v.trim() || v.length > 300)) return null;
  return list.map(v => v.trim());
}

export function parseRulesFile(text: string): ParsedRules {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (error: any) {
    return { rules: [], errors: [`${RULES_FILE} is not valid JSON: ${error.message}`] };
  }
  const list = Array.isArray(json?.rules) ? json.rules : null;
  if (!list) return { rules: [], errors: [`${RULES_FILE} needs a "rules" array.`] };
  const rules: ArchitectureRule[] = [];
  const errors: string[] = [];
  list.slice(0, MAX_RULES).forEach((raw: any, i: number) => {
    const label = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 120) : `Rule ${i + 1}`;
    const severity: RuleSeverity = raw?.severity === 'warning' ? 'warning' : 'error';
    const from = patterns(raw?.from), disallow = patterns(raw?.disallow), to = patterns(raw?.to), allowOnlyFrom = patterns(raw?.allowOnlyFrom);
    if (from && disallow && !raw.to) rules.push({ kind: 'forbidden', name: label, severity, from, disallow });
    else if (to && allowOnlyFrom && !raw.from) rules.push({ kind: 'only', name: label, severity, to, allowOnlyFrom });
    else errors.push(`${label}: use either "from" + "disallow", or "to" + "allowOnlyFrom" (each a path pattern or a list of them).`);
  });
  if (list.length > MAX_RULES) errors.push(`Only the first ${MAX_RULES} rules are checked.`);
  return { rules, errors };
}

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

// Dependencies are file-level: `from` calls into `to` (runAnalysis records a
// connection as source = defining file, target = calling file).
export function evaluateRules(rules: ArchitectureRule[], connections: any[]): RuleViolation[] {
  if (!rules.length) return [];
  const edges = new Map<string, { from: string; to: string }>();
  (connections || []).forEach(c => {
    const to = endpoint(c.source);
    const from = endpoint(c.target);
    if (from && to && from !== to) edges.set(`${from}\u0000${to}`, { from, to });
  });
  const compiled = rules.map(rule => rule.kind === 'forbidden'
    ? { rule, a: rule.from.map(globToRegExp), b: rule.disallow.map(globToRegExp) }
    : { rule, a: rule.to.map(globToRegExp), b: rule.allowOnlyFrom.map(globToRegExp) });
  const any = (res: RegExp[], path: string) => res.some(re => re.test(path));
  const violations: RuleViolation[] = [];
  for (const { from, to } of edges.values()) {
    for (const { rule, a, b } of compiled) {
      const broken = rule.kind === 'forbidden'
        ? any(a, from) && any(b, to)
        : any(a, to) && !any(a, from) && !any(b, from);
      if (broken) violations.push({ rule: rule.name, severity: rule.severity, from, to });
    }
  }
  return violations.sort((x, y) => x.rule.localeCompare(y.rule) || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}
