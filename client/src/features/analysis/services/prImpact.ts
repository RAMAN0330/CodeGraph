// Pure pull-request impact rules: blast radius, risk score, test impact and
// downstream dependency chains, computed from an analysis result plus a PR's
// changed files. Zero imports on purpose — the server's PR review job imports
// this file directly across the client/server boundary (see
// server/src/analysis/sharedRules.ts), the same way it shares
// analysisRules.ts, so both sides score a pull request identically.

export interface PrFile { filename: string; status?: string; additions?: number; deletions?: number }
export interface PrLike { files?: PrFile[]; additions?: number; deletions?: number }
export interface AnalysisLike { files: any[]; connections: any[] }

export interface BlastRadius {
  affected: string[]; transitive: string[]; count: number; transitiveCount: number; percent: number;
  level: 'low' | 'medium' | 'high' | 'critical'; depth: number; fnsUsed: number; totalCalls: number;
  dependencies: string[]; impactScore: number; centrality: number;
}

export interface PrRisk {
  score: number; level: 'low' | 'medium' | 'high' | 'critical'; factors: string[];
  totalBlast?: number; hotspots?: Array<{ file: string; blast: number }>;
}

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

export function calcBlast(fileId: string, conns: any[], files: any[]): BlastRadius {
  var exportedTo: any = {}, importedFrom: any = {}, exportedFns: any = {};
  conns.forEach(function (c) {
    var src = endpoint(c.source);
    var tgt = endpoint(c.target);
    if (!exportedTo[src]) exportedTo[src] = new Set();
    exportedTo[src].add(tgt);
    if (!importedFrom[tgt]) importedFrom[tgt] = new Set();
    importedFrom[tgt].add(src);
    if (!exportedFns[src]) exportedFns[src] = new Map();
    var fnMap = exportedFns[src];
    fnMap.set(c.fn, (fnMap.get(c.fn) || 0) + (c.count || 1));
  });
  var directDeps: string[] = exportedTo[fileId] ? Array.from(exportedTo[fileId]) : [];
  var transitive = new Map<string, number>();
  var queue = directDeps.map(function (f) { return { file: f, depth: 1 }; });
  var visited = new Set([fileId].concat(directDeps));
  while (queue.length > 0) {
    var item = queue.shift()!;
    if (item.depth > 3) continue;
    transitive.set(item.file, item.depth);
    var nextDeps = exportedTo[item.file] || new Set();
    nextDeps.forEach(function (f: string) { if (!visited.has(f)) { visited.add(f); queue.push({ file: f, depth: item.depth + 1 }); } });
  }
  var fnUsage = exportedFns[fileId] || new Map();
  var fnsUsed = fnUsage.size;
  var totalCalls = 0;
  fnUsage.forEach(function (cnt: number) { totalCalls += cnt; });
  var dependencies: string[] = importedFrom[fileId] ? Array.from(importedFrom[fileId]) : [];
  var impactScore = directDeps.length;
  transitive.forEach(function (depth) { if (depth > 1) impactScore += 1 / depth; });
  var centrality = directDeps.length + dependencies.length + fnsUsed;
  var connectedFiles = files.filter(function (f) { return exportedTo[f.path] || importedFrom[f.path]; }).length;
  var relativePct = connectedFiles > 0 ? Math.round(directDeps.length / connectedFiles * 100) : 0;
  var level: BlastRadius['level'] = 'low';
  if (directDeps.length >= 8 || fnsUsed >= 5) level = 'critical';
  else if (directDeps.length >= 4 || fnsUsed >= 3) level = 'high';
  else if (directDeps.length >= 2 || fnsUsed >= 1) level = 'medium';
  return { affected: directDeps, transitive: Array.from(transitive.keys()), count: directDeps.length, transitiveCount: transitive.size, percent: relativePct, level: level, depth: transitive.size > 0 ? Math.max(...Array.from(transitive.values())) : 0, fnsUsed: fnsUsed, totalCalls: totalCalls, dependencies: dependencies, impactScore: Math.round(impactScore * 10) / 10, centrality: centrality };
}

export function calcPRRisk(prData: PrLike | null, repoData: AnalysisLike | null): PrRisk {
  if (!prData || !repoData) return { score: 0, level: 'low', factors: [] };
  var score = 0, factors: string[] = [], changedFiles = prData.files || [], totalBlast = 0, hotspots: Array<{ file: string; blast: number }> = [];
  changedFiles.forEach(function (f) {
    var existing = repoData.files.find(function (df: any) { return df.path === f.filename; });
    if (existing) { var blast = calcBlast(f.filename, repoData.connections, repoData.files); totalBlast += blast.count; if (blast.count > 5) hotspots.push({ file: f.filename, blast: blast.count }); }
  });
  if (totalBlast > 50) { score += 30; factors.push('High blast radius (' + totalBlast + ' files)'); } else if (totalBlast > 20) { score += 15; factors.push('Moderate blast radius'); }
  if (changedFiles.length > 10) { score += 20; factors.push('Many files changed (' + changedFiles.length + ')'); } else if (changedFiles.length > 5) { score += 10; factors.push('Several files changed'); }
  var totalChanges = (prData.additions || 0) + (prData.deletions || 0);
  if (totalChanges > 500) { score += 25; factors.push('Large changeset (' + totalChanges + ' lines)'); } else if (totalChanges > 200) { score += 12; factors.push('Moderate changeset'); }
  var coreFiles = changedFiles.filter(function (f) { return f.filename.includes('/core/') || f.filename.includes('/utils/') || f.filename.includes('/lib/'); });
  if (coreFiles.length > 0) { score += 15; factors.push('Core files modified (' + coreFiles.length + ')'); }
  var configFiles = changedFiles.filter(function (f) { return f.filename.match(/\.(json|yaml|yml|toml|env)$/); });
  if (configFiles.length > 0) { score += 10; factors.push('Config files changed'); }
  score = Math.min(100, score);
  var level: PrRisk['level'] = score >= 70 ? 'critical' : score >= 40 ? 'high' : score >= 20 ? 'medium' : 'low';
  return { score, level, factors, totalBlast, hotspots: hotspots.sort(function (a, b) { return b.blast - a.blast; }).slice(0, 5) };
}

export function findTestImpact(prData: PrLike | null, repoData: AnalysisLike | null): Array<{ file: string; path: string; suggested?: boolean }> {
  if (!prData || !repoData) return [];
  var changedFiles = (prData.files || []).map(function (f) { return f.filename; });
  var testFiles = repoData.files.filter(function (f: any) { return f.name.match(/\.test\.|\.spec\.|_test\.|test_/i); });
  var impacted: Array<{ file: string; path: string; suggested?: boolean }> = [];
  testFiles.forEach(function (tf: any) {
    var shouldRun = changedFiles.some(function (cf) { var cfBase = cf.replace(/\.[^.]+$/, '').split('/').pop()!; return tf.name.toLowerCase().includes(cfBase.toLowerCase()); });
    if (shouldRun) impacted.push({ file: tf.name, path: tf.path });
  });
  if (impacted.length === 0 && testFiles.length > 0) impacted = testFiles.slice(0, 3).map(function (tf: any) { return { file: tf.name, path: tf.path, suggested: true }; });
  return impacted;
}

export function findDependencyChains(prData: PrLike | null, repoData: AnalysisLike | null): string[][] {
  if (!prData || !repoData) return [];
  var changedFiles = (prData.files || []).map(function (f) { return f.filename; });
  var chains: string[][] = [];
  changedFiles.slice(0, 3).forEach(function (file) {
    var chain = [file.split('/').pop()!];
    var visited = new Set([file]);
    var queue = [file];
    var depth = 0;
    while (queue.length > 0 && depth < 3) {
      var current = queue.shift()!;
      repoData.connections.forEach(function (c: any) {
        var src = endpoint(c.source);
        var tgt = endpoint(c.target);
        if (tgt === current && !visited.has(src)) { visited.add(src); chain.push(src.split('/').pop()!); queue.push(src); }
      });
      depth++;
    }
    if (chain.length > 1) chains.push(chain.slice(0, 5));
  });
  return chains;
}
