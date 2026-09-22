import { useEffect, useState } from 'react';
import { Check, Database, RotateCcw } from 'lucide-react';
import './AnalysisLoader.css';

export interface AnalysisStage {
  id: string;
  label: string;
}

interface AnalysisLoaderProps {
  kind: 'codebase' | 'database';
  subject: string;
  facts?: string[];
  stages: AnalysisStage[];
  activeIndex: number;
  detail?: string;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  onWorkspace?: () => void;
  onProject?: () => void;
}

function GraphMark() {
  return (
    <svg viewBox="0 0 28 28" fill="none">
      <path
        d="M9 7v11.2a3.8 3.8 0 1 0 2 3.3V12l7 4.1v2.1a3.8 3.8 0 1 0 2-3.3L11 9.7V7A3.8 3.8 0 1 0 9 7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CodebaseGhost() {
  return (
    <div className="analysis-ghost" aria-hidden="true">
      <div className="analysis-ghost-head">
        <span className="analysis-ghost-dial" />
        <div>
          <span className="analysis-ghost-line w60" />
          <span className="analysis-ghost-line w35" />
        </div>
      </div>
      <div className="analysis-ghost-tiles">
        {['files', 'functions', 'links', 'risks'].map(key => (
          <div key={key} className="analysis-ghost-tile">
            <span className="analysis-ghost-line w40" />
            <span className="analysis-ghost-line w70 tall" />
          </div>
        ))}
      </div>
      <div className="analysis-ghost-rows">
        {[72, 54, 83, 46, 65].map((width, index) => (
          <div key={index} className="analysis-ghost-row">
            <span className="analysis-ghost-chip" />
            <span className="analysis-ghost-line" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DatabaseGhost() {
  return (
    <div className="analysis-ghost" aria-hidden="true">
      <div className="analysis-ghost-tiles four">
        {['conns', 'qps', 'cache', 'lag'].map(key => (
          <div key={key} className="analysis-ghost-tile">
            <span className="analysis-ghost-line w45" />
            <span className="analysis-ghost-line w60 tall" />
          </div>
        ))}
      </div>
      <div className="analysis-ghost-plot">
        <svg viewBox="0 0 240 64" preserveAspectRatio="none">
          <path d="M0 48 L30 42 L60 46 L90 28 L120 34 L150 18 L180 26 L210 12 L240 20" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="analysis-ghost-rows">
        {[64, 78, 52, 70].map((width, index) => (
          <div key={index} className="analysis-ghost-row">
            <span className="analysis-ghost-chip square" />
            <span className="analysis-ghost-line" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export default function AnalysisLoader({
  kind, subject, facts = [], stages, activeIndex, detail, error,
  onRetry, retryLabel = 'Retry analysis', onWorkspace, onProject,
}: AnalysisLoaderProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (error) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [error]);

  const failedIndex = error ? Math.max(activeIndex, 0) : -1;
  const settledCount = error ? failedIndex : Math.max(activeIndex, 0) + 0.5;
  const percent = Math.min(100, Math.max(3, (settledCount / stages.length) * 100));
  const current = stages[Math.max(activeIndex, 0)];
  const verb = kind === 'database' ? 'Connecting to' : 'Analyzing';

  return (
    <div className={`analysis-loader analysis-loader-${kind}`}>
      <header className="analysis-topbar">
        <div className="analysis-topbar-brand">
          <span className="analysis-brand-mark">{kind === 'database' ? <Database size={19} strokeWidth={1.9} /> : <GraphMark />}</span>
          <span className="analysis-brand-name">
            <strong>structrace</strong>
            <small>{kind === 'database' ? 'database' : 'workspace'}</small>
          </span>
          <nav className="analysis-breadcrumb" aria-label="Breadcrumb">
            <button type="button" onClick={onWorkspace} disabled={!onWorkspace}>Workspace</button>
            <span className="analysis-breadcrumb-sep">/</span>
            <button type="button" onClick={onProject} disabled={!onProject}>Project</button>
            <span className="analysis-breadcrumb-sep">/</span>
            <span className="analysis-breadcrumb-current">Analysis</span>
          </nav>
        </div>
        <span className={`analysis-status-pill${error ? ' failed' : ''}`}>
          <i />
          {error ? 'Analysis stopped' : 'Analysis running'}
        </span>
      </header>

      <main className="analysis-stage">
        <div className="analysis-headline">
          <h1>
            {error ? 'Analysis stopped on ' : `${verb} `}
            <b>{subject}</b>
          </h1>
          <p className="analysis-facts">
            {facts.map(fact => <span key={fact}>{fact}</span>)}
            {!error && <span className="analysis-elapsed">{formatElapsed(elapsed)} elapsed</span>}
          </p>
        </div>

        <div className="analysis-body">
          <ol className="analysis-ledger">
            {stages.map((stage, index) => {
              const state = error
                ? index < failedIndex ? 'done' : index === failedIndex ? 'failed' : 'pending'
                : index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
              return (
                <li key={stage.id} className={`analysis-step ${state}`}>
                  <span className="analysis-step-marker">
                    {state === 'done' ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className="analysis-step-label">{stage.label}</span>
                  {state === 'active' && detail && <span className="analysis-step-detail">{detail}</span>}
                  {state === 'failed' && <span className="analysis-step-detail failed">{error}</span>}
                </li>
              );
            })}
          </ol>

          {kind === 'database' ? <DatabaseGhost /> : <CodebaseGhost />}
        </div>

        <div className="analysis-footer">
          <div className={`analysis-track${error ? ' failed' : ''}`}>
            <i style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
          <p className="analysis-caption" role="status" aria-live="polite">
            {error
              ? `Stopped at ${current?.label ?? 'analysis'} · step ${failedIndex + 1} of ${stages.length}`
              : `${current?.label ?? 'Starting'} · step ${Math.max(activeIndex, 0) + 1} of ${stages.length}`}
          </p>
          {error && onRetry && (
            <button type="button" className="analysis-retry" onClick={onRetry}>
              <RotateCcw size={14} strokeWidth={2} /> {retryLabel}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
