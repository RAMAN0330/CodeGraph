import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, FolderKanban, Trash2 } from 'lucide-react';
import AnalysisLoader, { type AnalysisStage } from '../../../shared/components/AnalysisLoader';
import { DashboardGrid, EmptyNote, Meter, Metric, Panel } from '../../../shared/components/Dashboard';
import { toneFill, toneText, type Tone } from '../../../shared/components/dashboardTones';
import AttentionFeed from '../../../shared/components/AttentionFeed';
import { codeAttention } from '../../../shared/services/attention';
import { findTangles } from '../../analysis/services/cycles';
import OwnershipRiskPanel from './OwnershipRiskPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { describeAnalysisError } from '../services/analysisErrors';
import type { AnalysisSnapshot } from '../../analysis/services/analysisHealth';

interface Suggestion { title: string; desc: string; priority: 'critical' | 'high' | 'medium' | string }
interface Pattern { name: string; isAnti?: boolean; severity?: string; files: any[] }
interface RegressionAlert { id: number; branch: string; commitSha: string; kind: string; message: string; createdAt: string }
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
  regressionAlerts?: RegressionAlert[];
  architecture?: ArchitectureSnapshot | null;
  onOpen: (section: string) => void;
  onOpenUnused: () => void;
}

// The project's list of projects: /workspaces/:id/projects/:projectId → /workspaces/:id/projects.
const projectsPath = () => typeof window === 'undefined' ? '/workspaces' : window.location.pathname.replace(/\/\d+$/, '') || '/workspaces';

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

function hasRepositoryRequest() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('repo') || params.has('share');
}

// Workspaces open from a project; without one there is nothing to analyze.
function NoRepositorySelected() {
  return (
    <main className="m-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border bg-card text-primary"><FolderKanban size={24} /></span>
      <h1 className="text-2xl">No repository selected</h1>
      <p className="text-sm text-muted-foreground">Open a codebase project to analyze its repository.</p>
      <Button onClick={() => window.location.assign('/workspaces')}>Go to your projects <ArrowRight size={15} /></Button>
    </main>
  );
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

  // Nothing to analyze: say so instead of showing an analysis that never starts.
  if (!loading && !error && !repoInfo && !hasRepositoryRequest()) return <NoRepositorySelected />;

  const text = progress ?? '';
  const failure = error ? describeAnalysisError(error) : null;
  return (
    <AnalysisLoader
      kind="codebase"
      subject={repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'your repository'}
      facts={analysisFacts(text)}
      stages={CODEBASE_STAGES}
      activeIndex={loading ? stageIndexFor(text) : 0}
      detail={loading ? text || 'Reading the repository tree…' : 'Restoring the repository you selected…'}
      error={failure?.message ?? null}
      hint={failure?.hint}
      onRetry={() => window.location.reload()}
      onBack={() => window.location.assign(projectsPath())}
      onWorkspace={() => window.location.assign('/workspaces')}
      onProject={() => window.location.assign(projectsPath())}
    />
  );
}


const REGRESSION_LABELS: Record<string, string> = { health: 'Health', circular: 'Cycles', security: 'Security', violations: 'Architecture', rules: 'Rules' };
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1 };
const SEVERITY_TONE: Record<string, Tone> = { critical: 'bad', high: 'warn', medium: 'neutral', low: 'good' };

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`;
}

function OverviewContent({
  repoInfo, data, health,
  vulns, vulnLoading, dbSchemaDetected, suggestions = [],
  previousSnapshot, regressionAlerts = [], architecture,
  onOpen, onOpenUnused,
}: Props) {
  const stats = data.stats ?? {};
  const patterns: Pattern[] = data.patterns ?? [];
  const antiPatterns = patterns.filter(p => p.isAnti || p.severity === 'warning');
  const duplicateCount = stats.duplicates ?? data.duplicates?.length ?? 0;
  const securityIssues = useMemo(() => data.securityIssues ?? [], [data.securityIssues]);
  const securityCount = stats.security ?? securityIssues.length;
  const deadCount = stats.dead ?? data.deadFunctions?.length ?? 0;
  const layerViolations = data.layerViolations ?? [];
  const violationCount = stats.violations ?? layerViolations.length;
  const vulnCount = vulns?.length ?? 0;
  const riskTotal = securityCount + violationCount + vulnCount;
  const languages = (stats.languages ?? []).slice(0, 5);
  const prevStats = previousSnapshot?.stats;
  const healthTone: Tone = health.score >= 80 ? 'good' : health.score >= 60 ? 'warn' : 'bad';
  const healthDelta = previousSnapshot ? health.score - previousSnapshot.healthScore : 0;

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

  const codeFindings = useMemo(() => ({
    high: securityIssues.filter((i: any) => i.severity === 'high').length,
    medium: securityIssues.filter((i: any) => i.severity === 'medium').length,
    low: securityIssues.filter((i: any) => i.severity !== 'high' && i.severity !== 'medium').length,
  }), [securityIssues]);
  const topFindings = useMemo(() => [...securityIssues].sort((a: any, b: any) => (SEVERITY_RANK[a.severity] ?? 2) - (SEVERITY_RANK[b.severity] ?? 2)).slice(0, 4), [securityIssues]);
  const seriousVulns = (vulns ?? []).filter((v: any) => v.severity === 'CRITICAL' || v.severity === 'HIGH').length;

  // Real hotspots (complexity × churn) when the analysis has commit history,
  // otherwise the most complex files.
  const realHotspots: Array<{ path: string; score: number }> = data.hotspots?.status === 'ok' ? (data.hotspots.items ?? []).slice(0, 6) : [];
  const complexityHotspots = useMemo(() => [...(data.files ?? [])]
    .filter((f: any) => f.complexity?.score > 0)
    .sort((a: any, b: any) => b.complexity.score - a.complexity.score)
    .slice(0, 6), [data.files]);
  const maxComplexity = Math.max(1, ...complexityHotspots.map((f: any) => f.complexity.score));
  const hotspotRows = realHotspots.length
    ? realHotspots.map(h => ({ path: h.path, value: h.score, display: h.score }))
    : complexityHotspots.map((f: any) => ({ path: f.path, value: (f.complexity.score / maxComplexity) * 100, display: f.complexity.score }));

  const attention = useMemo(() => {
    const tangles = findTangles(data.connections ?? []);
    return codeAttention({ data, vulns, regressions: regressionAlerts, cycleCount: tangles.length, cycleFiles: tangles.reduce((n, t) => n + t.files.length, 0), suggestions });
  }, [data, vulns, regressionAlerts, suggestions]);

  const metric = (label: string, value: number, previous?: number) => ({
    label, value: value.toLocaleString(),
    sub: prevStats && previous !== undefined && value !== previous ? `${signed(value - previous)} since last run` : undefined,
  });
  const metrics = [
    metric('Files', stats.files ?? 0, prevStats?.files),
    metric('Lines', stats.loc ?? 0, prevStats?.loc),
    metric('Functions', stats.functions ?? 0, prevStats?.functions),
    metric('Dependencies', stats.connections ?? 0, prevStats?.connections),
    metric('Modules', architecture?.modules ?? 0),
  ];
  const languageName = (language: any, index: number) => language.name ?? language.language ?? language.ext ?? `Language ${index + 1}`;
  const languagePercent = (language: any) => Math.round(language.percent ?? language.percentage ?? language.pct ?? language.value ?? 0);

  return (
    <DashboardGrid framed className={cn('lg:grid-cols-12', regressionAlerts.length ? 'lg:grid-rows-[auto_auto_minmax(0,1fr)_minmax(0,1fr)]' : 'lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]')}>
      <section className="flex items-center gap-4 rounded-xl border bg-card px-5 py-3 lg:col-span-3" aria-label="Codebase health">
        <div className="flex items-baseline gap-1">
          <strong className={cn('font-mono text-5xl leading-none font-semibold', toneText[healthTone])}>{health.score}</strong>
          <small className="text-xs text-muted-foreground">/100</small>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            Grade {health.grade}
            {healthDelta !== 0 && <Badge variant="outline" className={toneText[healthDelta > 0 ? 'good' : 'bad']}>{signed(healthDelta)}</Badge>}
          </span>
          <span className="text-xs text-muted-foreground">{riskTotal === 0 ? 'No high-priority risks detected.' : `${riskTotal.toLocaleString()} priority item${riskTotal === 1 ? '' : 's'} to review`}</span>
          <Button variant="link" size="sm" className="h-auto justify-start p-0 text-xs" onClick={() => onOpen(riskTotal ? 'security' : 'debt')}>Review quality <ArrowRight className="size-3.5" /></Button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-9 lg:grid-cols-6" aria-label="Codebase size">
        {metrics.map(item => <Metric key={item.label} label={item.label} value={item.value} sub={item.sub} />)}
        <Metric label="Languages" value={languages.length} sub={languages.slice(0, 2).map((l: any, i: number) => `${languageName(l, i)} ${languagePercent(l)}%`).join(' · ') || undefined} />
      </section>

      {regressionAlerts.length > 0 && (
        <section className="flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-4 py-2 text-xs lg:col-span-12" role="status">
          <AlertTriangle className={cn('size-4 shrink-0', toneText.bad)} />
          <b className="shrink-0">{regressionAlerts.length} regression{regressionAlerts.length === 1 ? '' : 's'} between analyzed commits</b>
          <span className="truncate text-muted-foreground">
            {regressionAlerts.slice(0, 2).map(alert => `${REGRESSION_LABELS[alert.kind] ?? alert.kind}: ${alert.message}`).join(' · ')}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => onOpen('trends')}>View trends <ArrowRight className="size-3.5" /></Button>
        </section>
      )}

      <Panel title="Architecture" meta={`${architecture?.edges?.toLocaleString() ?? 0} links`} action="Open" onAction={() => onOpen('architecture')} className="lg:col-span-4">
        <div className="grid grid-cols-4 gap-2">
          <Metric label="Modules" value={architecture?.modules ?? 0} />
          <Metric label="Layers" value={architecture?.layers ?? 0} />
          <Metric label="Cycles" value={architecture?.circular ?? 0} tone={architecture?.circular ? 'bad' : 'good'} sub={architecture?.circular ? 'Open' : 'None'} onClick={() => onOpen('cycles')} />
          <Metric label="Violations" value={violationCount} tone={violationCount ? 'warn' : 'good'} sub={violationCount ? 'Open' : 'None'} onClick={() => onOpen('rules')} />
        </div>
        {layerViolations.length ? (
          <ul className="mt-2 flex min-h-0 flex-col divide-y text-xs">
            {layerViolations.slice(0, 4).map((v: any, index: number) => (
              <li key={index} className="flex items-center gap-2 py-1.5">
                <span className="shrink-0 font-semibold capitalize">{v.fromLayer} → {v.toLayer}</span>
                <span className="truncate font-mono text-muted-foreground" title={`${v.from} → ${v.to}`}>{v.from}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyNote>Every import follows the layer order.</EmptyNote>}
      </Panel>

      <Panel title="Issues by severity" meta={vulnLoading ? 'Scanning dependencies…' : `${distributionTotal.toLocaleString()} signals`} action="Tech debt" onAction={() => onOpen('debt')} className="lg:col-span-4">
        <div className="flex min-h-0 flex-1 flex-col justify-between gap-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Share of signals by severity">
            {(['critical', 'high', 'medium', 'low'] as const).map(tier => (
              <i key={tier} className={cn('block h-full', toneFill[SEVERITY_TONE[tier]])} style={{ width: `${(issueDistribution[tier] / distributionTotal) * 100}%` }} />
            ))}
          </div>
          <div className="flex flex-col">
            {(['critical', 'high', 'medium', 'low'] as const).map(tier => (
              <Meter key={tier} label={<span className="capitalize">{tier}</span>} value={(issueDistribution[tier] / distributionTotal) * 100} display={issueDistribution[tier].toLocaleString()} tone={SEVERITY_TONE[tier]} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {issueDistribution.critical + issueDistribution.high === 0
              ? 'Nothing critical or high right now.'
              : `${(issueDistribution.critical + issueDistribution.high).toLocaleString()} signals are critical or high. Start with security findings and layer violations.`}
          </p>
        </div>
      </Panel>

      <Panel title="Security" meta={securityIssues.length + vulnCount ? `${(securityIssues.length + vulnCount).toLocaleString()} findings` : 'Clear'} action="Open" onAction={() => onOpen('security')} className="lg:col-span-4">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Code findings" value={securityIssues.length} tone={codeFindings.high ? 'bad' : securityIssues.length ? 'warn' : 'good'} sub={securityIssues.length ? `${codeFindings.high} high · ${codeFindings.medium} medium · ${codeFindings.low} low` : 'None found'} />
          <Metric label="Vulnerable packages" value={vulnLoading ? '…' : vulnCount} tone={seriousVulns ? 'bad' : vulnCount ? 'warn' : 'good'} sub={vulnLoading ? 'Scanning' : vulnCount ? `${seriousVulns} critical or high` : 'None known'} />
        </div>
        {topFindings.length > 0 && (
          <ul className="mt-2 flex min-h-0 flex-col divide-y text-xs">
            {topFindings.map((issue: any, index: number) => (
              <li key={index} className="flex items-center gap-2 py-1.5">
                <span className={cn('shrink-0 font-semibold', toneText[issue.severity === 'high' ? 'bad' : issue.severity === 'medium' ? 'warn' : 'neutral'])}>{issue.title}</span>
                <span className="truncate font-mono text-muted-foreground" title={issue.path}>{issue.path}{issue.line ? `:${issue.line}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={realHotspots.length ? 'Hotspots' : 'Complexity hotspots'} meta={realHotspots.length ? 'Complex and often changed' : 'Most complex files'} action="Open" onAction={() => onOpen(realHotspots.length ? 'hotspots' : 'explorer')} className="lg:col-span-4">
        {hotspotRows.length ? (
          <div className="flex flex-col">
            {hotspotRows.map(row => (
              <Meter key={row.path} label={<span className="font-mono" title={row.path}>{row.path}</span>} value={row.value} display={row.display} tone={row.value >= 66 ? 'bad' : row.value >= 33 ? 'warn' : 'neutral'} onClick={() => onOpen(realHotspots.length ? 'hotspots' : 'explorer')} />
            ))}
          </div>
        ) : <EmptyNote>No high-complexity files detected.</EmptyNote>}
      </Panel>

      <Panel title="Needs attention" meta="Ranked by severity and reach" className="lg:col-span-4">
        <AttentionFeed items={attention} storageKey={`cg.attention.${repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'repo'}`} onOpen={target => (target === 'unused' ? onOpenUnused() : onOpen(target))} />
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {deadCount > 0 && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenUnused}><Trash2 className="size-3.5" /> Unused code · {deadCount.toLocaleString()}</Button>}
          {dbSchemaDetected && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpen('database')}>Database schema detected <ArrowRight className="size-3.5" /></Button>}
        </div>
      </Panel>

      <OwnershipRiskPanel repoInfo={repoInfo} files={data.files ?? []} className="lg:col-span-4" />
    </DashboardGrid>
  );
}
