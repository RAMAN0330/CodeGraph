#!/usr/bin/env node
// structrace check — enforce structrace.rules.json in any CI, no GitHub App
// needed. Analyzes a local checkout with the same pipeline as the server
// (analysis/analyzeFiles.ts), so results match the workspace and PR review.
//
//   structrace check [dir] [--format text|json|github] [--rules <file>]
//                          [--baseline <file>] [--write-baseline <file>]
//
// Exit codes: 0 no new "error" violations · 1 new "error" violations ·
// 2 setup problem (no rules file, unreadable rules, bad arguments).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { analyzeFiles, selectSourceFiles } from '../analysis/analyzeFiles';
import { RULES_FILE, manifestEcosystem, type RuleViolation } from '../analysis/sharedRules';

const MAX_FILE_BYTES = 1_000_000;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'vendor', '__pycache__', '.venv', 'venv', 'target', 'coverage']);

type Format = 'text' | 'json' | 'github';
interface Options { dir: string; format: Format; rules?: string; baseline?: string; writeBaseline?: string }
interface Baseline { version: 1; violations: Array<Pick<RuleViolation, 'rule' | 'from' | 'to'>> }

export class UsageError extends Error {}

export function parseArgs(argv: string[]): Options {
  const args = [...argv];
  if (args[0] === 'check') args.shift();
  const options: Options = { dir: '.', format: 'text' };
  let dirSet = false;
  while (args.length) {
    const arg = args.shift()!;
    const value = () => { const v = args.shift(); if (!v || v.startsWith('--')) throw new UsageError(`${arg} needs a value.`); return v; };
    if (arg === '--format') {
      const f = value();
      if (f !== 'text' && f !== 'json' && f !== 'github') throw new UsageError('--format must be text, json or github.');
      options.format = f;
    } else if (arg === '--rules') options.rules = value();
    else if (arg === '--baseline') options.baseline = value();
    else if (arg === '--write-baseline') options.writeBaseline = value();
    else if (arg === '--help' || arg === '-h') throw new UsageError('');
    else if (!arg.startsWith('--') && !dirSet) { options.dir = arg; dirSet = true; }
    else throw new UsageError(`Unknown argument: ${arg}`);
  }
  return options;
}

// Tracked and untracked-but-not-ignored files when it's a git checkout,
// otherwise a plain walk that skips dependency and build folders.
function listFiles(root: string): string[] {
  if (existsSync(join(root, '.git'))) {
    try {
      const out = execFileSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { maxBuffer: 256 * 1024 * 1024 });
      return out.toString('utf8').split('\0').filter(Boolean);
    } catch {
      // fall through to the walk
    }
  }
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name)); }
      else if (entry.isFile()) found.push(relative(root, join(dir, entry.name)).split(sep).join('/'));
    }
  };
  walk(root);
  return found;
}

const key = (v: Pick<RuleViolation, 'rule' | 'from' | 'to'>) => `${v.rule}\u0000${v.from}\u0000${v.to}`;

export function splitByBaseline(violations: RuleViolation[], baseline: Baseline | null): { fresh: RuleViolation[]; known: RuleViolation[] } {
  const known = new Set((baseline?.violations ?? []).map(key));
  return { fresh: violations.filter(v => !known.has(key(v))), known: violations.filter(v => known.has(key(v))) };
}

// GitHub Actions workflow commands: shown inline on the PR's changed files.
function githubEscape(value: string, property = false): string {
  let s = value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  if (property) s = s.replace(/:/g, '%3A').replace(/,/g, '%2C');
  return s;
}

export function formatReport(format: Format, result: { files: number; rules: number; fresh: RuleViolation[]; known: RuleViolation[]; errors: string[] }): string {
  if (format === 'json') return JSON.stringify(result, null, 2);
  const lines: string[] = [];
  if (format === 'github') {
    result.errors.forEach(e => lines.push(`::error title=${githubEscape(RULES_FILE, true)}::${githubEscape(e)}`));
    result.fresh.forEach(v => lines.push(`::${v.severity === 'error' ? 'error' : 'warning'} file=${githubEscape(v.from, true)},title=${githubEscape(v.rule, true)}::${githubEscape(`${v.from} must not depend on ${v.to}`)}`));
  } else {
    result.errors.forEach(e => lines.push(`! ${e}`));
    const byRule = new Map<string, RuleViolation[]>();
    result.fresh.forEach(v => { if (!byRule.has(v.rule)) byRule.set(v.rule, []); byRule.get(v.rule)!.push(v); });
    for (const [rule, list] of byRule) {
      lines.push('', `${list[0].severity === 'error' ? '✖' : '⚠'} ${rule} (${list.length})`);
      list.forEach(v => lines.push(`    ${v.from} → ${v.to}`));
    }
  }
  const errors = result.fresh.filter(v => v.severity === 'error').length;
  lines.push('', `${result.files} files, ${result.rules} rules: ${errors} new error${errors === 1 ? '' : 's'}, ${result.fresh.length - errors} new warning${result.fresh.length - errors === 1 ? '' : 's'}${result.known.length ? `, ${result.known.length} in baseline` : ''}.`);
  return lines.join('\n').replace(/^\n/, '');
}

export async function check(options: Options): Promise<{ exitCode: number; output: string }> {
  const root = resolve(options.dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`${options.dir} is not a directory.`);
  const rulesPath = resolve(root, options.rules ?? RULES_FILE);
  if (!existsSync(rulesPath)) throw new UsageError(`No ${RULES_FILE} found at ${rulesPath}. Write one (Architecture → Rules in Structrace has a builder) or pass --rules.`);
  const rulesText = readFileSync(rulesPath, 'utf8');

  const all = listFiles(root);
  const files = selectSourceFiles(all.map(path => ({ path })));
  const data = await analyzeFiles({
    files,
    read: async f => {
      const full = join(root, f.path);
      try {
        return statSync(full).size > MAX_FILE_BYTES ? null : readFileSync(full, 'utf8');
      } catch {
        return null;
      }
    },
    readRules: async () => rulesText,
    readManifests: async () => all.filter(p => manifestEcosystem(p)).map(path => {
      try { return { path, content: readFileSync(join(root, path), 'utf8') }; } catch { return null; }
    }).filter((m): m is { path: string; content: string } => m !== null),
  });
  if (data.rules.errors.length && !data.rules.rules.length) throw new UsageError(data.rules.errors.join('\n'));

  const violations: RuleViolation[] = data.ruleViolations;
  if (options.writeBaseline) {
    const baseline: Baseline = { version: 1, violations: violations.map(({ rule, from, to }) => ({ rule, from, to })) };
    writeFileSync(resolve(options.writeBaseline), JSON.stringify(baseline, null, 2) + '\n');
  }
  let baseline: Baseline | null = null;
  if (options.baseline) {
    try {
      baseline = JSON.parse(readFileSync(resolve(options.baseline), 'utf8'));
    } catch (error: any) {
      throw new UsageError(`Could not read baseline ${options.baseline}: ${error.message}`);
    }
  }
  const { fresh, known } = splitByBaseline(violations, baseline);
  const output = formatReport(options.format, { files: data.files.length, rules: data.rules.rules.length, fresh, known, errors: data.rules.errors });
  return { exitCode: fresh.some(v => v.severity === 'error') && !options.writeBaseline ? 1 : 0, output };
}

const USAGE = `Usage: structrace check [dir] [--format text|json|github] [--rules <file>] [--baseline <file>] [--write-baseline <file>]

Checks ${RULES_FILE} against the code in dir (default: current directory).
  --format github     annotate files in GitHub Actions
  --write-baseline f  record today's violations so only new ones fail
  --baseline f        ignore violations recorded in f`;

if (require.main === module) {
  (async () => {
    try {
      const { exitCode, output } = await check(parseArgs(process.argv.slice(2)));
      console.log(output);
      process.exit(exitCode);
    } catch (error: any) {
      if (error instanceof UsageError) {
        console.error(error.message ? `${error.message}\n\n${USAGE}` : USAGE);
        process.exit(error.message ? 2 : 0);
      }
      console.error(error?.stack || error);
      process.exit(2);
    }
  })();
}
