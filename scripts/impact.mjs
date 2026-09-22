#!/usr/bin/env node
// Change-impact analysis for client/src: "if I edit this file, what else is
// affected, and which tests actually exercise it?"
//
// The import graph is built with dependency-cruiser (already resolves this
// repo's `@/*` tsconfig path alias with zero extra config, and computes
// reverse dependents natively — no graph inversion needed here). Test
// coverage is cross-referenced two ways, because this repo's tests don't
// statically `import` the modules they test — they load them at runtime
// through a headless Vite server with the path as a string literal:
//   const { fn } = await vite.ssrLoadModule('/src/features/x/y.ts');
// A plain "grep test files for an import of X" pass finds nothing; this
// script scans for that ssrLoadModule(...) call shape explicitly.
//
// Usage:
//   node scripts/impact.mjs <path-relative-to-client-src>
//   node scripts/impact.mjs --json <path-relative-to-client-src>
//
// Example:
//   node scripts/impact.mjs features/workspace/legacy/LegacyWorkspaceEngine.tsx

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIR = join(REPO_ROOT, 'client');
const TESTS_DIR = join(REPO_ROOT, 'tests');

// dependency-cruiser lives in client/node_modules (it needs to sit next to
// this repo's `typescript` install to parse .ts/.tsx — a copy hoisted to the
// repo root can't see client's typescript and silently cruises 0 files).
// It's ESM-only with no `require`/CJS export condition at all, so the
// createRequire(...).resolve() trick tests/*.test.mjs use for `vite` doesn't
// work here — that throws ERR_PACKAGE_PATH_NOT_EXPORTED. Read the package's
// own declared entry point instead and import that path directly.
const dcPkgDir = join(CLIENT_DIR, 'node_modules', 'dependency-cruiser');
const dcPkg = JSON.parse(await readFile(join(dcPkgDir, 'package.json'), 'utf8'));
const dcEntry = dcPkg.exports?.['.']?.import ?? dcPkg.main;
const { cruise } = await import(pathToFileURL(join(dcPkgDir, dcEntry)).href);

function parseArgs(argv) {
  const json = argv.includes('--json');
  const target = argv.find(arg => arg !== '--json');
  return { json, target };
}

async function buildGraph() {
  // dependency-cruiser has no cwd/baseDir option — resolve `src` and the
  // tsconfig relative to the process's own working directory, so run from
  // inside client/ regardless of where this script was invoked from.
  const originalCwd = process.cwd();
  process.chdir(CLIENT_DIR);
  try {
    const result = await cruise(['src'], {
      tsPreCompilationDeps: true,
      tsConfig: { fileName: 'tsconfig.app.json' },
      exclude: 'node_modules',
      doNotFollow: { path: 'node_modules' },
    });
    return result.output.modules;
  } finally {
    process.chdir(originalCwd);
  }
}

// BFS outward through `dependents`, recording the shortest hop count from the
// queried file to each affected file — depth is what makes a large blast
// radius legible at a glance instead of a flat, unordered list.
function findTransitiveDependents(modules, targetSource) {
  const bySource = new Map(modules.map(module => [module.source, module]));
  if (!bySource.has(targetSource)) return null;

  const depth = new Map([[targetSource, 0]]);
  const queue = [targetSource];
  while (queue.length) {
    const current = queue.shift();
    const module = bySource.get(current);
    const currentDepth = depth.get(current);
    for (const dependent of module?.dependents ?? []) {
      if (depth.has(dependent)) continue;
      depth.set(dependent, currentDepth + 1);
      queue.push(dependent);
    }
  }
  depth.delete(targetSource);
  return [...depth.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([source, hops]) => ({ source, hops }));
}

async function listTestFiles() {
  const entries = await readdir(TESTS_DIR, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs')).map(entry => join(TESTS_DIR, entry.name));
}

// Every test in this repo loads its subject via vite.ssrLoadModule('/src/...')
// as a string literal, not a static import — see the module comment above.
const SSR_LOAD_RE = /ssrLoadModule\(\s*['"]([^'"]+)['"]/g;

async function findCoveringTests(reachableSources) {
  const testFiles = await listTestFiles();
  const covering = [];
  for (const testFile of testFiles) {
    const content = await readFile(testFile, 'utf8');
    const loaded = new Set();
    for (const match of content.matchAll(SSR_LOAD_RE)) {
      loaded.add(match[1].replace(/^\//, ''));
    }
    const hits = [...loaded].filter(path => reachableSources.has(path));
    if (hits.length) covering.push({ test: testFile.replace(REPO_ROOT + '/', ''), loads: hits });
  }
  return covering;
}

function normalizeTarget(target) {
  return target.replace(/^\.?\/?(client\/)?(src\/)?/, '').replace(/^\//, '');
}

// Plain substring matching misses common typos (a single inserted/dropped
// character breaks containment both ways), so a target that's "close enough"
// still needs a real edit-distance comparison to surface as a suggestion.
function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = a[i - 1] === b[j - 1]
        ? rows[i - 1][j - 1]
        : 1 + Math.min(rows[i - 1][j - 1], rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows[a.length][b.length];
}

function suggestModules(modules, target) {
  const wanted = normalizeTarget(target).split('/').pop().toLowerCase();
  return modules
    .map(module => {
      const name = module.source.split('/').pop().toLowerCase();
      const distance = name.includes(wanted) || wanted.includes(name) ? 0 : levenshtein(name, wanted);
      return { source: module.source, distance };
    })
    .filter(entry => entry.distance <= Math.max(2, Math.ceil(wanted.length * 0.3)))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .map(entry => entry.source);
}

async function main() {
  const { json, target } = parseArgs(process.argv.slice(2));
  if (!target) {
    console.error('Usage: node scripts/impact.mjs [--json] <path-relative-to-client-src>');
    console.error('Example: node scripts/impact.mjs features/workspace/legacy/LegacyWorkspaceEngine.tsx');
    process.exitCode = 1;
    return;
  }

  const targetSource = `src/${normalizeTarget(target)}`;
  const modules = await buildGraph();
  const bySource = new Map(modules.map(module => [module.source, module]));
  const targetModule = bySource.get(targetSource);

  if (!targetModule) {
    const suggestions = suggestModules(modules, target);
    if (json) {
      console.log(JSON.stringify({ error: `No such module: ${targetSource}`, suggestions }, null, 2));
    } else {
      console.error(`No such module: ${targetSource}`);
      if (suggestions.length) {
        console.error('Did you mean one of:');
        suggestions.forEach(path => console.error(`  ${path}`));
      }
    }
    process.exitCode = 1;
    return;
  }

  const dependents = findTransitiveDependents(modules, targetSource) ?? [];
  const direct = dependents.filter(entry => entry.hops === 1).map(entry => entry.source);
  const transitive = dependents.filter(entry => entry.hops > 1);

  const reachable = new Set([targetSource, ...dependents.map(entry => entry.source)]);
  const tests = await findCoveringTests(reachable);

  if (json) {
    console.log(JSON.stringify({
      target: targetSource,
      directDependencies: targetModule.dependencies.map(dep => dep.resolved),
      directDependents: direct,
      transitiveDependents: transitive,
      totalAffected: dependents.length,
      coveringTests: tests,
    }, null, 2));
    return;
  }

  console.log(`\nImpact of ${targetSource}\n`);
  console.log(`Direct dependencies (${targetModule.dependencies.length}):`);
  targetModule.dependencies.forEach(dep => console.log(`  → ${dep.resolved}`));

  console.log(`\nDirect importers (${direct.length}):`);
  direct.forEach(path => console.log(`  ← ${path}`));

  if (transitive.length) {
    console.log(`\nTransitive dependents (${transitive.length}):`);
    let lastHops = null;
    for (const entry of transitive) {
      if (entry.hops !== lastHops) { console.log(`  ${entry.hops} hops away:`); lastHops = entry.hops; }
      console.log(`    ← ${entry.source}`);
    }
  }

  console.log(`\nTotal affected: ${dependents.length} file${dependents.length === 1 ? '' : 's'}`);

  if (tests.length) {
    console.log(`\nTests exercising this file or something in its blast radius (${tests.length}):`);
    tests.forEach(entry => console.log(`  ✓ ${entry.test}`));
  } else {
    console.log('\nNo tests found that load this file or anything that depends on it.');
  }
  console.log('');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
