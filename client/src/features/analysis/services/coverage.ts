// Test coverage reports from CI, matched onto the analysis graph. Parsed in
// the browser; only per-file line counts are uploaded (server/src/db/coverage.ts).
//
// Formats: lcov (lcov.info), Cobertura XML (coverage.xml — also what
// coverage.py, JaCoCo converters and many CI tools emit), and Istanbul's
// coverage-summary.json.

export interface LineCounts { found: number; hit: number }
export interface ParsedCoverage { format: 'lcov' | 'cobertura' | 'istanbul-summary'; files: Record<string, LineCounts> }
export interface MatchedCoverage { files: Record<string, LineCounts>; unmatched: number }
export interface CoverageRisk { path: string; percent: number; dependents: number; transitive: number; risk: number }

export class CoverageFormatError extends Error {}

function add(files: Record<string, LineCounts>, path: string, found: number, hit: number) {
  if (!path || !Number.isFinite(found) || !Number.isFinite(hit) || found < 0) return;
  const current = files[path] ?? { found: 0, hit: 0 };
  files[path] = { found: current.found + found, hit: current.hit + Math.min(hit, found) };
}

export function parseCoverage(text: string, fileName = ''): ParsedCoverage {
  const trimmed = text.trimStart();
  const files: Record<string, LineCounts> = {};

  if (/^(TN:|SF:)/m.test(trimmed) && /end_of_record/.test(trimmed)) {
    for (const record of trimmed.split('end_of_record')) {
      const sf = record.match(/^SF:(.+)$/m);
      if (!sf) continue;
      const lf = record.match(/^LF:(\d+)$/m);
      const lh = record.match(/^LH:(\d+)$/m);
      if (lf && lh) { add(files, sf[1].trim(), Number(lf[1]), Number(lh[1])); continue; }
      // Older lcov writers omit LF/LH; count DA lines instead.
      const da = [...record.matchAll(/^DA:\d+,(\d+)/gm)];
      add(files, sf[1].trim(), da.length, da.filter(m => Number(m[1]) > 0).length);
    }
    return { format: 'lcov', files };
  }

  if (trimmed.startsWith('<') && /<coverage[\s>]/.test(trimmed)) {
    const sources = [...trimmed.matchAll(/<source>([^<]+)<\/source>/g)].map(m => m[1].trim().replace(/\/$/, ''));
    const classRe = /<class\b[^>]*\bfilename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g;
    let m: RegExpExecArray | null;
    while ((m = classRe.exec(trimmed))) {
      const lines = [...m[2].matchAll(/<line\b[^>]*\bhits="(\d+)"/g)];
      const path = sources.length && !m[1].startsWith('/') ? `${sources[0]}/${m[1]}` : m[1];
      add(files, path, lines.length, lines.filter(l => Number(l[1]) > 0).length);
    }
    return { format: 'cobertura', files };
  }

  if (trimmed.startsWith('{')) {
    let json: any;
    try { json = JSON.parse(trimmed); } catch { throw new CoverageFormatError(`${fileName || 'This file'} is not valid JSON.`); }
    for (const [path, entry] of Object.entries<any>(json)) {
      if (path === 'total' || !entry?.lines) continue;
      add(files, path, Number(entry.lines.total), Number(entry.lines.covered));
    }
    if (Object.keys(files).length) return { format: 'istanbul-summary', files };
    throw new CoverageFormatError('That JSON has no per-file "lines" totals. Upload coverage-summary.json (Istanbul json-summary reporter).');
  }

  throw new CoverageFormatError('Unrecognised coverage format. Upload lcov.info, a Cobertura coverage.xml, or coverage-summary.json.');
}

// Report paths are usually absolute CI paths or relative to a sub-package;
// a repository file matches when the report path ends with it at a folder
// boundary. The longest (most specific) repository path wins.
export function matchCoverageToRepo(files: Record<string, LineCounts>, repoPaths: string[]): MatchedCoverage {
  const byBase = new Map<string, string[]>();
  repoPaths.forEach(p => {
    const base = p.split('/').pop()!;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(p);
  });
  const matched: Record<string, LineCounts> = {};
  let unmatched = 0;
  for (const [raw, counts] of Object.entries(files)) {
    const path = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    const candidates = (byBase.get(path.split('/').pop()!) ?? []).filter(p => path === p || path.endsWith(`/${p}`));
    if (!candidates.length) { unmatched++; continue; }
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    const current = matched[best] ?? { found: 0, hit: 0 };
    matched[best] = { found: current.found + counts.found, hit: current.hit + counts.hit };
  }
  return { files: matched, unmatched };
}

export function percent(c: LineCounts): number {
  return c.found ? Math.round((c.hit / c.found) * 100) : 100;
}

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

// Widely used, poorly tested: uncovered share × how much depends on the file
// (direct dependents count fully, transitive ones half). Files the report
// doesn't mention at all are left out, not assumed untested.
export function coverageRisk(data: any, coverage: Record<string, LineCounts>, limit = 25): CoverageRisk[] {
  const usedBy = new Map<string, Set<string>>();
  (data?.connections || []).forEach((c: any) => {
    const definer = endpoint(c.source);
    const caller = endpoint(c.target);
    if (definer === caller) return;
    if (!usedBy.has(definer)) usedBy.set(definer, new Set());
    usedBy.get(definer)!.add(caller);
  });
  const closure = (start: string) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) for (const next of usedBy.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    return seen.size - 1;
  };
  return Object.entries(coverage)
    .filter(([, c]) => c.found > 0)
    .map(([path, c]) => {
      const dependents = usedBy.get(path)?.size ?? 0;
      const transitive = Math.max(0, closure(path) - dependents);
      const reach = dependents + transitive / 2;
      const pct = percent(c);
      return { path, percent: pct, dependents, transitive, risk: Math.round(((100 - pct) / 100) * reach * 10) / 10 };
    })
    .filter(r => r.risk > 0)
    .sort((a, b) => b.risk - a.risk || a.percent - b.percent || a.path.localeCompare(b.path))
    .slice(0, limit);
}
