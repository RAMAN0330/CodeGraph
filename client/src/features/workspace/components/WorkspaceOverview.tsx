interface Props {
  repoInfo: { owner: string; repo: string } | null;
  data: any;
  health: { score: number; grade: string };
  loading: boolean;
  progress?: string;
  error?: string | null;
  onOpen: (section: string) => void;
  onOpenUnused: () => void;
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 10h12m-4-4 4 4-4 4" /></svg>;
}

const METRIC_ICONS = [
  'M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z',
  'M7 4 3 10l4 6M13 4l4 6-4 6M11 3 9 17',
  'M6 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM8 7h3a3 3 0 0 1 3 3v1',
  'M4 3h12v14H4zM7 7h6M7 10h6M7 13h4',
];

function MetricIcon({ index }: { index: number }) {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={METRIC_ICONS[index]} /></svg>;
}

export default function WorkspaceOverview({ repoInfo, data, health, loading, progress, error, onOpen, onOpenUnused }: Props) {
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
        <p>
          {error
            ? error
            : progress || 'Fetching repository files and mapping dependencies. Your overview will open automatically when it is ready.'}
        </p>
        {loading ? (
          <div className="overview-analysis-progress" role="status" aria-live="polite">
            <span><i /></span>
            <small>Analysis runs automatically—no second selection is required.</small>
          </div>
        ) : error ? (
          <button onClick={() => window.location.reload()}>Retry analysis <ArrowIcon /></button>
        ) : (
          <div className="overview-analysis-progress waiting" role="status">
            <span><i /></span>
            <small>Restoring the repository selected on the previous page…</small>
          </div>
        )}
      </main>
    );
  }

  const stats = data.stats ?? {};
  const securityCount = stats.security ?? data.securityIssues?.length ?? 0;
  const deadCount = stats.dead ?? data.deadFunctions?.length ?? 0;
  const violationCount = stats.violations ?? data.layerViolations?.length ?? 0;
  const riskTotal = securityCount + violationCount;
  const languages = (stats.languages ?? []).slice(0, 5);

  return (
    <main className="workspace-overview">
      <header className="overview-heading">
        <div>
          <div className="overview-title-row">
            <h1>{repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'Repository'}</h1>
            <span><i /> Analysis complete</span>
          </div>
        </div>
        <button className="overview-primary-action" onClick={() => onOpen('explorer')}>
          Explore code graph <ArrowIcon />
        </button>
      </header>

      <section className="overview-health-card">
        <div className={`overview-health-score ${health.score >= 80 ? 'good' : health.score >= 60 ? 'warn' : 'risk'}`}>
          <span>{health.score}</span><small>/100</small>
        </div>
        <div className="overview-health-copy">
          <p>Codebase health</p>
          <h2>Grade {health.grade}</h2>
          <span>{riskTotal === 0 ? 'No high-priority risks detected.' : `${riskTotal} priority item${riskTotal === 1 ? '' : 's'} deserve attention.`}</span>
        </div>
        <div className="overview-health-signals" aria-label="Health signals">
          <div><span className={securityCount ? 'risk' : 'good'} /> <b>{securityCount}</b><small>Security</small></div>
          <div><span className={deadCount ? 'warn' : 'good'} /> <b>{deadCount}</b><small>Unused</small></div>
          <div><span className={violationCount ? 'warn' : 'good'} /> <b>{violationCount}</b><small>Violations</small></div>
        </div>
        <button onClick={() => onOpen(riskTotal ? 'security' : 'debt')}>Review quality <ArrowIcon /></button>
      </section>

      <section className="overview-metrics" aria-label="Repository metrics">
        {[
          ['Files', stats.files ?? 0, 'Indexed source files'],
          ['Functions', stats.functions ?? 0, 'Detected functions'],
          ['Dependencies', stats.connections ?? 0, 'Mapped relationships'],
          ['Lines of code', (stats.loc ?? 0).toLocaleString(), 'Analyzed code'],
        ].map(([label, value, description], index) => (
          <article key={label as string}>
            <div className="overview-metric-icon"><MetricIcon index={index} /></div>
            <div><span>{label}</span><strong>{value}</strong><small>{description}</small></div>
          </article>
        ))}
      </section>

      <section className="overview-grid">
        <article className="overview-panel overview-focus-panel">
          <div className="overview-panel-heading"><div><span>Focus areas</span><h2>What needs your attention</h2></div><small>Open a category to inspect the findings</small></div>
          <button onClick={() => onOpen('security')}>
            <i className={securityCount ? 'risk' : 'good'} />
            <span><strong>Security</strong><small>{securityCount ? `${securityCount} high-severity finding${securityCount === 1 ? '' : 's'}` : 'No high-severity findings'}</small></span>
            <b>{securityCount}</b>
          </button>
          <button onClick={() => deadCount > 0 && onOpenUnused()} disabled={deadCount === 0}>
            <i className={deadCount ? 'warn' : 'good'} />
            <span><strong>Unused code</strong><small>{deadCount ? 'Candidates for cleanup' : 'No unused functions detected'}</small></span>
            <b>{deadCount}</b>
          </button>
          <button onClick={() => onOpen('architecture')}>
            <i className={violationCount ? 'warn' : 'good'} />
            <span><strong>Architecture</strong><small>{violationCount ? 'Layer boundaries need review' : 'No layer violations detected'}</small></span>
            <b>{violationCount}</b>
          </button>
        </article>

        <article className="overview-panel overview-language-panel">
          <div className="overview-panel-heading"><div><span>Composition</span><h2>Language breakdown</h2></div><small>Share of analyzed lines</small></div>
          {languages.length ? languages.map((language: any, index: number) => {
            const name = language.name ?? language.language ?? language.ext ?? `Language ${index + 1}`;
            const percent = Math.round(language.percent ?? language.percentage ?? language.pct ?? language.value ?? 0);
            return (
              <div className="overview-language" key={name}>
                <div><span><i style={{ background: ['#61afef','#c678dd','#98c379','#e5c07b','#56b6c2'][index] }} />{name}</span><b>{percent}%</b></div>
                <div className="overview-language-track"><i style={{ width: `${Math.max(3, Math.min(100, percent))}%` }} /></div>
              </div>
            );
          }) : <p className="overview-panel-empty">Language information is not available for this analysis.</p>}
        </article>

        <article className="overview-panel overview-next-panel">
          <div className="overview-panel-heading"><div><span>Recommended next steps</span><h2>Continue exploring</h2></div><small>Move from summary to repository detail</small></div>
          <div className="overview-next-actions">
            <button onClick={() => onOpen('architecture')}><i>01</i><span><strong>Understand the architecture</strong><small>See modules and structural relationships</small></span><ArrowIcon /></button>
            <button onClick={() => onOpen('commits')}><i>02</i><span><strong>Inspect recent changes</strong><small>Review activity and repository history</small></span><ArrowIcon /></button>
            <button onClick={() => onOpen('ownership')}><i>03</i><span><strong>Find code owners</strong><small>Understand responsibility across files</small></span><ArrowIcon /></button>
          </div>
        </article>
      </section>
    </main>
  );
}
