import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import AnalysisLoader, { type AnalysisStage } from '../../../shared/components/AnalysisLoader';
import OwnershipRiskPanel from './OwnershipRiskPanel';
import { Button } from '@/components/ui/button';

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

const CODEBASE_STAGES: AnalysisStage[] = [
  { id: 'read', label: 'Read repository' },
  { id: 'parse', label: 'Parse sources' },
  { id: 'graph', label: 'Map dependencies' },
  { id: 'patterns', label: 'Detect patterns' },
  { id: 'quality', label: 'Score quality' },
  { id: 'assemble', label: 'Assemble workspace' },
];

// The engine reports progress as free text; these are its actual phase strings.
function stageIndexFor(progress: string) {
  const text = progress.toLowerCase();
  if (text.startsWith('finalizing')) return 5;
  if (text.startsWith('analyzing code quality')) return 4;
  if (text.startsWith('detecting patterns')) return 3;
  if (text.startsWith('building dependency graph') || text.startsWith('analyzing dependencies') || text.startsWith('resolving markdown')) return 2;
  if (text.startsWith('analyzing on server') || /^analyzing \d/.test(text)) return 1;
  return 0;
}

function analysisFacts(progress: string) {
  const parsed = progress.match(/^Analyzing (\d[\d,]*)\/(\d[\d,]*)/);
  if (parsed) return [`${parsed[2]} files`, `${parsed[1]} parsed`];
  const scanned = progress.match(/(\d[\d,]*) found/);
  if (scanned) return [`${scanned[1]} files found`];
  return [];
}

export default function WorkspaceOverview(props: Props) {
  const { repoInfo, data, loading, progress, error } = props;
  // Real JSX, not a direct OverviewContent(props) call — OverviewContent uses
  // hooks (useMemo), which require an active React dispatcher; that only
  // exists while React itself is rendering. A bare function call has no
  // dispatcher and throws "Invalid hook call" the instant it runs, which is
  // exactly what happened when this was tried (verified against the actual
  // failure, not assumed). tests/workspace-ui.test.mjs's naive prop-walker
  // (textOf/elements) needing a real renderer is a test-tooling gap, not a
  // reason to make this component's own composition less correct.
  if (data) return <OverviewContent {...props} />;

  const text = progress ?? '';
  return (
    <AnalysisLoader
      kind="codebase"
      subject={repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'your repository'}
      facts={analysisFacts(text)}
      stages={CODEBASE_STAGES}
      activeIndex={loading ? stageIndexFor(text) : 0}
      detail={loading ? text || 'Reading the repository tree…' : 'Restoring the repository you selected…'}
      error={error}
      onRetry={() => window.location.reload()}
      onWorkspace={() => window.location.assign('/workspaces')}
      onProject={() => window.location.assign('/workspaces')}
    />
  );
}

function OverviewContent({
  repoInfo, data, health,
  vulns, vulnLoading, dbSchemaDetected,
  previousSnapshot, architecture,
  onOpen,
}: Props) {
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
          <Button variant="ghost" onClick={() => onOpen(riskTotal ? 'security' : 'debt')}>Review quality <ArrowIcon /></Button>
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
                <div><span><i style={{ background: ['var(--teal-500)', 'var(--chart-purple)', 'var(--color-success)', 'var(--color-warning)', 'var(--chart-cyan)'][index] }} />{name}</span><b>{percent}%</b></div>
                <div className="overview-language-track"><i style={{ width: `${Math.max(3, Math.min(100, percent))}%` }} /></div>
              </div>
            );
          }) : <p className="overview-panel-empty">Language information is not available.</p>}
          {dbSchemaDetected && <Button variant="ghost" className="overview-db-callout" onClick={() => onOpen('database')}><span>Database schema detected</span><ArrowIcon /></Button>}
        </article>

        <article className="overview-panel ov-area-complexity">
          <div className="overview-panel-heading"><div><h2>Complexity hotspots</h2></div><small>Highest first</small></div>
          {complexityHotspots.length ? (
            <div className="ov-hotspot-list">
              {complexityHotspots.map((f: any) => (
                <Button variant="ghost" key={f.path} className="ov-hotspot-row" onClick={() => onOpen('explorer')}>
                  <span>{f.path}</span>
                  <div className="ov-hotspot-track"><i style={{ width: `${Math.round((f.complexity.score / maxComplexity) * 100)}%` }} /></div>
                  <b>{f.complexity.score}</b>
                </Button>
              ))}
            </div>
          ) : <p className="overview-panel-empty">No high-complexity files detected.</p>}
        </article>

        <OwnershipRiskPanel repoInfo={repoInfo} files={data.files ?? []} />
      </div>
    </main>
  );
}
