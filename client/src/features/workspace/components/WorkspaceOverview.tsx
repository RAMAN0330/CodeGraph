import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';

interface Suggestion { title: string; desc: string; priority: 'critical' | 'high' | 'medium' | string }
interface Pattern { name: string; isAnti?: boolean; severity?: string; files: any[] }
interface AnalysisSnapshot {
  timestamp: string; healthScore: number; healthGrade: string;
  stats: { files: number; functions: number; connections: number; loc: number; security: number; dead: number; violations: number; duplicates: number; patterns: number };
}
interface ArchitectureSnapshot { layers: number; modules: number; edges: number; circular: number }

interface Props {
  repoInfo: { owner: string; repo: string } | null;
  data: any;
  health: { score: number; grade: string };
  loading: boolean;
  progress?: string;
  error?: string | null;
  vulns?: any[];
  vulnLoading?: boolean;
  dbSchemaDetected?: boolean;
  suggestions?: Suggestion[];
  previousSnapshot?: AnalysisSnapshot | null;
  architecture?: ArchitectureSnapshot | null;
  onOpen: (section: string) => void;
  onOpenUnused: () => void;
}

function ArrowIcon() {
  return <span className="icon icon-m"><ArrowRight size={14} strokeWidth={1.8} /></span>;
}

function Delta({ value }: { value: number }) {
  if (!value) return <em className="ov-delta flat">—</em>;
  return <em className={`ov-delta ${value > 0 ? 'good' : 'bad'}`}>{value > 0 ? '+' : ''}{value}</em>;
}

export default function WorkspaceOverview({
  repoInfo, data, health, loading, progress, error,
  vulns, vulnLoading, dbSchemaDetected,
  previousSnapshot, architecture,
  onOpen,
}: Props) {
  if (!data) {
    return (
      <main className="workspace-overview workspace-overview-empty">
        <div className={`overview-empty-mark${loading ? ' analyzing' : ''}`}>G</div>
        <p className="overview-eyebrow">{error ? 'Analysis interrupted' : loading ? 'Building your workspace' : 'Preparing workspace'}</p>
        <h1>
          {error
            ? 'We could not finish the analysis'
            : repoInfo
              ? `Analyzing ${repoInfo.owner}/${repoInfo.repo}`
              : 'Loading your selected repository'}
        </h1>
        <p>{error ? error : progress || 'Fetching repository files and mapping dependencies. Your overview will open automatically when it is ready.'}</p>
        {loading ? (
          <div className="overview-analysis-progress" role="status" aria-live="polite">
            <span><i /></span><small>Analysis runs automatically. No second selection is required.</small>
          </div>
        ) : error ? (
          <button onClick={() => window.location.reload()}>Retry analysis <ArrowIcon /></button>
        ) : (
          <div className="overview-analysis-progress waiting" role="status">
            <span><i /></span><small>Restoring the repository selected on the previous page…</small>
          </div>
        )}
      </main>
    );
  }

  const stats = data.stats ?? {};
  const patterns: Pattern[] = data.patterns ?? [];
  const antiPatterns = patterns.filter(p => p.isAnti || p.severity === 'warning');
  const duplicateCount = stats.duplicates ?? data.duplicates?.length ?? 0;
  const vulnCount = vulns?.length ?? 0;
  const securityIssues = data.securityIssues ?? [];
  const securityCount = stats.security ?? securityIssues.length;
  const deadCount = stats.dead ?? data.deadFunctions?.length ?? 0;
  const violations = data.layerViolations ?? [];
  const violationCount = stats.violations ?? violations.length;
  const riskTotal = securityCount + violationCount + vulnCount;
  const languages = (stats.languages ?? []).slice(0, 5);

  const prevStats = previousSnapshot?.stats;
  const delta = (key: keyof NonNullable<typeof prevStats>, current: number) =>
    prevStats ? current - prevStats[key] : 0;

  // Real, deterministic bucketing of every signal type into one severity
  // taxonomy — not a fabricated score, just a shared vocabulary across
  // otherwise-incompatible severity scales (security high/med/low, OSV
  // CRITICAL..UNKNOWN, structural violations with no inherent severity).
  const issueDistribution = useMemo(() => {
    const buckets = { critical: 0, high: 0, medium: 0, low: 0 };
    securityIssues.forEach((i: any) => {
      if (i.severity === 'high') buckets.critical++;
      else if (i.severity === 'medium') buckets.high++;
      else buckets.medium++;
    });
    (vulns ?? []).forEach((v: any) => {
      if (v.severity === 'CRITICAL') buckets.critical++;
      else if (v.severity === 'HIGH') buckets.high++;
      else if (v.severity === 'MEDIUM') buckets.medium++;
      else buckets.low++;
    });
    buckets.high += violationCount;
    buckets.medium += antiPatterns.length + duplicateCount;
    buckets.low += deadCount;
    return buckets;
  }, [securityIssues, vulns, violationCount, antiPatterns.length, duplicateCount, deadCount]);
  const distributionTotal = Math.max(1, issueDistribution.critical + issueDistribution.high + issueDistribution.medium + issueDistribution.low);

  const complexityHotspots = useMemo(() => {
    return [...(data.files ?? [])]
      .filter((f: any) => f.complexity?.score > 0)
      .sort((a: any, b: any) => b.complexity.score - a.complexity.score)
      .slice(0, 6);
  }, [data.files]);
  const maxComplexity = Math.max(1, ...complexityHotspots.map((f: any) => f.complexity.score));

  return (
    <main className="workspace-overview">
      <div className="overview-master-grid ov-grid-v2">
        <article className="overview-health-card ov-area-health">
          <div className={`overview-health-score ${health.score >= 80 ? 'good' : health.score >= 60 ? 'warn' : 'risk'}`}>
            <span>{health.score}</span><small>/100</small>
          </div>
          <div className="overview-health-copy">
            <p>Codebase health</p>
            <h2>Grade {health.grade} {previousSnapshot && <Delta value={health.score - previousSnapshot.healthScore} />}</h2>
            <span>{riskTotal === 0 ? 'No high-priority risks detected.' : `${riskTotal} priority item${riskTotal === 1 ? '' : 's'} deserve attention.`}</span>
          </div>
          <button onClick={() => onOpen(riskTotal ? 'security' : 'debt')}>Review quality <ArrowIcon /></button>
        </article>

        <div className="overview-metrics ov-metrics-6 ov-area-metrics">
          {[
            ['Files', stats.files ?? 0, delta('files', stats.files ?? 0)],
            ['Functions', stats.functions ?? 0, delta('functions', stats.functions ?? 0)],
            ['Lines', (stats.loc ?? 0).toLocaleString(), delta('loc', stats.loc ?? 0)],
            ['Dependencies', stats.connections ?? 0, delta('connections', stats.connections ?? 0)],
            ['Modules', architecture?.modules ?? 0, 0],
            ['Languages', languages.length, 0],
          ].map(([label, value, d]) => (
            <div key={label as string}>
              <span>{label}</span>
              <strong>{value}{previousSnapshot && typeof d === 'number' && d !== 0 && <Delta value={d} />}</strong>
            </div>
          ))}
        </div>

        <article className="ov-area-arch ov-kpi-panel">
          <div className="ov-kpi-grid">
            <div className="ov-kpi-tile"><strong>{architecture?.modules ?? 0}</strong><span>Modules</span></div>
            <div className="ov-kpi-tile"><strong>{architecture?.layers ?? 0}</strong><span>Layers</span></div>
            <div className={`ov-kpi-tile${architecture?.circular ? ' risk' : ''}`}><strong>{architecture?.circular ?? 0}</strong><span>Circular deps</span></div>
            <div className={`ov-kpi-tile${violationCount ? ' risk' : ''}`}><strong>{violationCount}</strong><span>Violations</span></div>
          </div>
        </article>

        <article className="overview-panel ov-area-dist">
          <div className="overview-panel-heading"><div><h2>Issue distribution</h2></div><small>{vulnLoading ? 'Scanning dependencies…' : `${distributionTotal} signals`}</small></div>
          <div className="ov-dist-list">
            {(['critical', 'high', 'medium', 'low'] as const).map(tier => (
              <div key={tier} className="ov-dist-row">
                <span className={`ov-dist-label ${tier}`}>{tier}</span>
                <div className="ov-dist-track"><i className={tier} style={{ width: `${Math.round((issueDistribution[tier] / distributionTotal) * 100)}%` }} /></div>
                <b>{issueDistribution[tier]}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="overview-panel ov-area-lang overview-language-panel">
          <div className="overview-panel-heading"><div><h2>Language composition</h2></div><small>Share of lines</small></div>
          {languages.length ? languages.map((language: any, index: number) => {
            const name = language.name ?? language.language ?? language.ext ?? `Language ${index + 1}`;
            const percent = Math.round(language.percent ?? language.percentage ?? language.pct ?? language.value ?? 0);
            return (
              <div className="overview-language" key={name}>
                <div><span><i style={{ background: ['#61afef', '#c678dd', '#98c379', '#e5c07b', '#56b6c2'][index] }} />{name}</span><b>{percent}%</b></div>
                <div className="overview-language-track"><i style={{ width: `${Math.max(3, Math.min(100, percent))}%` }} /></div>
              </div>
            );
          }) : <p className="overview-panel-empty">Language information is not available.</p>}
          {dbSchemaDetected && <button className="overview-db-callout" onClick={() => onOpen('database')}><span>Database schema detected</span><ArrowIcon /></button>}
        </article>

        <article className="overview-panel ov-area-complexity">
          <div className="overview-panel-heading"><div><h2>Complexity hotspots</h2></div><small>Highest first</small></div>
          {complexityHotspots.length ? (
            <div className="ov-hotspot-list">
              {complexityHotspots.map((f: any) => (
                <button key={f.path} className="ov-hotspot-row" onClick={() => onOpen('explorer')}>
                  <span>{f.path}</span>
                  <div className="ov-hotspot-track"><i style={{ width: `${Math.round((f.complexity.score / maxComplexity) * 100)}%` }} /></div>
                  <b>{f.complexity.score}</b>
                </button>
              ))}
            </div>
          ) : <p className="overview-panel-empty">No high-complexity files detected.</p>}
        </article>
      </div>
    </main>
  );
}
