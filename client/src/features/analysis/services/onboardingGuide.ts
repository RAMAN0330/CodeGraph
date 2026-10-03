// A reading path for someone new to a repository, derived only from its
// analysis: where execution starts, what everything else leans on, how the
// layers stack up, and what to handle with care. Deterministic — the same
// analysis always produces the same guide, and nothing is invented.

export interface GuideStep { path: string; reason: string; layer: string; kind: 'entry' | 'dependency' | 'core' }
export interface OnboardingGuide {
  entryPoints: Array<{ path: string; reach: number }>;
  readingPath: GuideStep[];
  coreModules: Array<{ path: string; dependents: number; layer: string }>;
  layers: Array<{ layer: string; files: number; examples: string[] }>;
  areas: Array<{ folder: string; files: number }>;
  cautions: Array<{ path: string; reason: string }>;
  codeFiles: number;
}

const PATH_LENGTH = 10;
const ENTRY_NAME = /^(main|index|app|server|cli|manage|wsgi|asgi|__main__|program|bootstrap)\.[a-z0-9]+$/i;
const TEST_PATH = /(\.test\.|\.spec\.|_test\.|(^|\/)test_|__tests__|(^|\/)tests?\/)/i;

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

function basename(path: string) {
  return path.split('/').pop() || path;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function buildOnboardingGuide(data: any): OnboardingGuide {
  const files: any[] = (data?.files || []).filter((f: any) => f.isCode !== false && f.layer !== 'note' && !TEST_PATH.test(f.path));
  const byPath = new Map(files.map(f => [f.path as string, f]));
  // runAnalysis: source = file defining the function, target = file calling it.
  const uses = new Map<string, Set<string>>();
  const usedBy = new Map<string, Set<string>>();
  (data?.connections || []).forEach((c: any) => {
    const definer = endpoint(c.source);
    const caller = endpoint(c.target);
    if (definer === caller || !byPath.has(definer) || !byPath.has(caller)) return;
    if (!uses.has(caller)) uses.set(caller, new Set());
    uses.get(caller)!.add(definer);
    if (!usedBy.has(definer)) usedBy.set(definer, new Set());
    usedBy.get(definer)!.add(caller);
  });
  const dependents = (path: string) => usedBy.get(path)?.size ?? 0;
  const layerOf = (path: string) => byPath.get(path)?.layer || 'other';

  const reachCache = new Map<string, number>();
  const reach = (start: string) => {
    if (reachCache.has(start)) return reachCache.get(start)!;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) for (const next of uses.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    reachCache.set(start, seen.size - 1);
    return seen.size - 1;
  };

  // Entry points: nothing in the repo calls them, they call into it. Conventional
  // entry names go first; otherwise the widest reach wins.
  const entryPoints = files
    .filter(f => (uses.get(f.path)?.size ?? 0) > 0 && (dependents(f.path) === 0 || ENTRY_NAME.test(basename(f.path))))
    .map(f => ({ path: f.path as string, reach: reach(f.path), named: ENTRY_NAME.test(basename(f.path)) }))
    .sort((a, b) => Number(b.named) - Number(a.named) || b.reach - a.reach || a.path.localeCompare(b.path))
    .slice(0, 5)
    .map(({ path, reach }) => ({ path, reach }));

  const coreModules = files
    .filter(f => dependents(f.path) > 1)
    .map(f => ({ path: f.path as string, dependents: dependents(f.path), layer: layerOf(f.path) }))
    .sort((a, b) => b.dependents - a.dependents || a.path.localeCompare(b.path))
    .slice(0, 8);

  // Reading path: from the main entry point, keep stepping to the most
  // depended-on file that something already read leans on directly.
  const readingPath: GuideStep[] = [];
  const visited = new Set<string>();
  const introducedBy = new Map<string, string>();
  const add = (step: GuideStep) => { readingPath.push(step); visited.add(step.path); for (const dep of uses.get(step.path) ?? []) if (!introducedBy.has(dep)) introducedBy.set(dep, step.path); };
  if (entryPoints[0]) add({ path: entryPoints[0].path, kind: 'entry', layer: layerOf(entryPoints[0].path), reason: `Entry point — reaches ${plural(entryPoints[0].reach, 'file')} through its dependencies` });
  while (readingPath.length < PATH_LENGTH) {
    const frontier = [...introducedBy.keys()].filter(p => !visited.has(p));
    if (!frontier.length) break;
    frontier.sort((a, b) => dependents(b) - dependents(a) || a.localeCompare(b));
    const next = frontier[0];
    const parent = introducedBy.get(next)!;
    const crossing = layerOf(parent) !== layerOf(next) ? `; crosses ${layerOf(parent)} → ${layerOf(next)}` : '';
    add({ path: next, kind: 'dependency', layer: layerOf(next), reason: `${basename(parent)} depends on it; used by ${plural(dependents(next), 'file')}${crossing}` });
  }
  for (const core of coreModules) {
    if (readingPath.length >= PATH_LENGTH) break;
    if (!visited.has(core.path)) add({ path: core.path, kind: 'core', layer: core.layer, reason: `Shared building block — used by ${plural(core.dependents, 'file')}` });
  }

  const layerGroups = new Map<string, string[]>();
  files.forEach(f => { const l = f.layer || 'other'; if (!layerGroups.has(l)) layerGroups.set(l, []); layerGroups.get(l)!.push(f.path); });
  const layers = [...layerGroups.entries()]
    .map(([layer, paths]) => ({ layer, files: paths.length, examples: [...paths].sort((a, b) => dependents(b) - dependents(a) || a.localeCompare(b)).slice(0, 3) }))
    .sort((a, b) => b.files - a.files);

  const folderCounts = new Map<string, number>();
  files.forEach(f => { const top = f.path.includes('/') ? f.path.split('/')[0] : '(root)'; folderCounts.set(top, (folderCounts.get(top) ?? 0) + 1); });
  const areas = [...folderCounts.entries()].map(([folder, n]) => ({ folder, files: n })).sort((a, b) => b.files - a.files).slice(0, 8);

  const cautions: OnboardingGuide['cautions'] = [];
  const circular = (data?.issues || []).find((i: any) => String(i.title || '').includes('Circular'));
  (circular?.items || []).slice(0, 3).forEach((item: any) => {
    if (Array.isArray(item.files) && item.files.length === 2) cautions.push({ path: item.files[0], reason: `Circular dependency with ${basename(item.files[1])} — changes ripple both ways` });
  });
  files
    .filter(f => f.complexity?.level === 'critical')
    .sort((a, b) => b.complexity.score - a.complexity.score)
    .slice(0, 3)
    .forEach(f => cautions.push({ path: f.path, reason: `High complexity (score ${f.complexity.score}) — read slowly, test before changing` }));
  coreModules.filter(m => m.dependents >= 8).slice(0, 2).forEach(m => {
    if (!cautions.some(c => c.path === m.path)) cautions.push({ path: m.path, reason: `${plural(m.dependents, 'file')} depend on it — a change here has a wide blast radius` });
  });

  return { entryPoints, readingPath, coreModules, layers, areas, cautions, codeFiles: files.length };
}

export function guideToMarkdown(guide: OnboardingGuide, repoName: string, owners?: Array<{ folder: string; people: string[] }>): string {
  const lines = [`# Onboarding: ${repoName}`, '', `_Generated by Structrace from the dependency graph of ${plural(guide.codeFiles, 'code file')}._`, ''];
  if (guide.entryPoints.length) {
    lines.push('## Start here', '');
    guide.entryPoints.forEach(e => lines.push(`- \`${e.path}\` — reaches ${plural(e.reach, 'file')}`));
    lines.push('');
  }
  if (guide.readingPath.length) {
    lines.push('## Reading path', '');
    guide.readingPath.forEach((s, i) => lines.push(`${i + 1}. \`${s.path}\` (${s.layer}) — ${s.reason}`));
    lines.push('');
  }
  if (guide.coreModules.length) {
    lines.push('## Core modules', '');
    guide.coreModules.forEach(m => lines.push(`- \`${m.path}\` — used by ${plural(m.dependents, 'file')}`));
    lines.push('');
  }
  if (guide.layers.length) {
    lines.push('## Layers', '');
    guide.layers.forEach(l => lines.push(`- **${l.layer}** (${plural(l.files, 'file')}): ${l.examples.map(e => `\`${e}\``).join(', ')}`));
    lines.push('');
  }
  if (owners?.length) {
    lines.push('## Who to ask', '');
    owners.forEach(o => lines.push(`- \`${o.folder}/\` — ${o.people.join(', ')}`));
    lines.push('');
  }
  if (guide.cautions.length) {
    lines.push('## Handle with care', '');
    guide.cautions.forEach(c => lines.push(`- \`${c.path}\` — ${c.reason}`));
    lines.push('');
  }
  return lines.join('\n');
}
