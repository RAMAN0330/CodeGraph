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
            <small>Analysis runs automatically. No second selection is required.</small>
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
  const attentionTotal = securityCount + deadCount + violationCount;
  const attentionChecks = [securityCount, deadCount, violationCount].filter(Boolean).length;
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

      <section className="overview-summary-shell">
        <article className="overview-health-card">
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
        </article>

        <div className="overview-metrics" aria-label="Repository metrics">
          {[
            ['Files', stats.files ?? 0, 'Indexed'],
            ['Functions', stats.functions ?? 0, 'Detected'],
            ['Dependencies', stats.connections ?? 0, 'Mapped'],
            ['Lines', (stats.loc ?? 0).toLocaleString(), 'Analyzed'],
          ].map(([label, value, description]) => (
            <div key={label as string}>
              <span>{label}</span><strong>{value}</strong><small>{description}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="overview-grid">
        <article className="overview-panel overview-focus-panel">
          <div className="overview-panel-heading"><div><h2>What needs your attention</h2></div><small>Prioritized by impact</small></div>
          <div className={`overview-focus-summary${attentionTotal ? '' : ' clear'}`}>
            <div><strong>{attentionTotal}</strong><span>{attentionTotal ? `open signal${attentionTotal === 1 ? '' : 's'} across ${attentionChecks} check${attentionChecks === 1 ? '' : 's'}` : 'open signals'}</span></div>
            <small>{attentionTotal ? 'Start with security and structural findings, then clear maintenance debt.' : 'All automated checks are clear.'}</small>
          </div>
          <button className="overview-focus-item" onClick={() => onOpen('security')}>
            <i className={securityCount ? 'risk' : 'good'} />
            <span><strong>Security</strong><small>{securityCount ? `${securityCount} high-severity finding${securityCount === 1 ? '' : 's'} require review` : 'No high-severity findings detected'}</small></span>
            <em className={securityCount ? 'risk' : 'clear'}>{securityCount ? 'Critical' : 'Clear'}</em>
            <b>{securityCount}</b>
            <ArrowIcon />
          </button>
          <button className="overview-focus-item" onClick={() => deadCount > 0 && onOpenUnused()} disabled={deadCount === 0}>
            <i className={deadCount ? 'warn' : 'good'} />
            <span><strong>Unused code</strong><small>{deadCount ? `${deadCount} function${deadCount === 1 ? '' : 's'} can be reviewed for safe removal` : 'No unused functions detected'}</small></span>
            <em className={deadCount ? 'warn' : 'clear'}>{deadCount ? 'Cleanup' : 'Clear'}</em>
            <b>{deadCount}</b>
            <ArrowIcon />
          </button>
          <button className="overview-focus-item" onClick={() => onOpen('architecture')}>
            <i className={violationCount ? 'warn' : 'good'} />
            <span><strong>Architecture</strong><small>{violationCount ? `${violationCount} layer boundar${violationCount === 1 ? 'y' : 'ies'} break the expected structure` : 'No layer violations detected'}</small></span>
            <em className={violationCount ? 'warn' : 'clear'}>{violationCount ? 'Structural' : 'Clear'}</em>
            <b>{violationCount}</b>
            <ArrowIcon />
          </button>
        </article>

        <article className="overview-panel overview-language-panel">
          <div className="overview-panel-heading"><div><h2>Language breakdown</h2></div><small>Share of analyzed lines</small></div>
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
          <div className="overview-panel-heading"><div><h2>Continue exploring</h2></div><small>Move from summary to repository detail</small></div>
          <div className="overview-next-actions">
            <button onClick={() => onOpen('architecture')}><span><strong>Understand the architecture</strong><small>See modules and structural relationships</small></span><ArrowIcon /></button>
            <button onClick={() => onOpen('commits')}><span><strong>Inspect recent changes</strong><small>Review activity and repository history</small></span><ArrowIcon /></button>
            <button onClick={() => onOpen('ownership')}><span><strong>Find code owners</strong><small>Understand responsibility across files</small></span><ArrowIcon /></button>
          </div>
        </article>
      </section>
    </main>
  );
}
