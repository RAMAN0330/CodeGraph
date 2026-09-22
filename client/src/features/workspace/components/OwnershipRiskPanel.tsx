import { useEffect, useState } from 'react';
import { computeOwnershipRisk, type OwnershipRiskSummary } from '../../git-insights/services/ownershipRisk';

interface Props {
  repoInfo: { owner: string; repo: string } | null | undefined;
  files: { path?: string; name?: string }[];
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; summary: OwnershipRiskSummary }
  | { status: 'unavailable'; reason: string };

const CONTRIBUTOR_ROWS = 5;
const OWNER_ROWS = 5;

export default function OwnershipRiskPanel({ repoInfo, files }: Props) {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!repoInfo) {
      setState({ status: 'unavailable', reason: 'Ownership needs a connected GitHub repository. A local folder has no commit history to read.' });
      return;
    }
    if (!files.length) {
      setState({ status: 'unavailable', reason: 'No files were analyzed.' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });
    computeOwnershipRisk(repoInfo.owner, repoInfo.repo, files)
      .then(summary => {
        if (cancelled) return;
        if (!summary || (!summary.folders.length && !summary.contributors.length)) {
          setState({ status: 'unavailable', reason: 'GitHub returned no commit history for this repository.' });
          return;
        }
        setState({ status: 'ready', summary });
      })
      .catch(error => {
        if (cancelled) return;
        setState({ status: 'unavailable', reason: error instanceof Error ? error.message : 'Could not read commit history.' });
      });
    return () => { cancelled = true; };
  }, [repoInfo, files]);

  return (
    <article className="overview-panel ov-area-own">
      <div className="overview-panel-heading">
        <div><h2>Ownership risk</h2></div>
        <small>Top {state.status === 'ready' ? state.summary.sampledFolders : 8} areas · last 30 commits each</small>
      </div>

      {state.status === 'loading' && (
        <div className="ov-owner-skeleton" aria-hidden="true">
          {[64, 44, 78, 52, 70].map((width, index) => <span key={index} style={{ width: `${width}%` }} />)}
        </div>
      )}

      {state.status === 'unavailable' && <p className="overview-panel-empty">{state.reason}</p>}

      {state.status === 'ready' && <OwnershipSummary summary={state.summary} />}
    </article>
  );
}

function OwnershipSummary({ summary }: { summary: OwnershipRiskSummary }) {
  const singleOwner = summary.folders.filter(folder => folder.authors.length === 1);
  const contributors = summary.contributors.slice(0, CONTRIBUTOR_ROWS);
  const concentrated = summary.busFactor !== null && summary.busFactor <= 2;

  return (
    <div className="ov-owner-body">
      <div>
        <div className="ov-stat-grid ov-stat-grid-2">
          <div className={concentrated ? 'risk' : undefined}>
            <strong>{summary.busFactor ?? '—'}</strong>
            <span>Bus factor</span>
          </div>
          <div className={singleOwner.length ? 'risk' : undefined}>
            <strong>{singleOwner.length}<em className="ov-owner-of">/{summary.ownedFolders}</em></strong>
            <span>Single-owner areas</span>
          </div>
        </div>
        <p className="ov-owner-verdict">
          {summary.busFactor === null
            ? 'Contributor history was not available for this repository.'
            : concentrated
              ? `${summary.busFactor === 1 ? 'One person has' : `${summary.busFactor} people have`} written most of this codebase. Losing ${summary.busFactor === 1 ? 'them' : 'either'} would take most of the working knowledge with ${summary.busFactor === 1 ? 'them' : 'it'}.`
              : `Commits spread across ${summary.busFactor} people before reaching half the codebase.`}
        </p>
      </div>

      {contributors.length > 0 && (
        <div>
          <p className="ov-owner-subhead">Share of commits</p>
          <div className="ov-owner-bars">
            {contributors.map(person => (
              <div className="ov-owner-bar" key={person.name}>
                <div><span>{person.name}</span><b>{Math.round(person.share * 100)}%</b></div>
                <div className="ov-owner-track"><i style={{ width: `${Math.max(2, Math.round(person.share * 100))}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="ov-owner-subhead">Areas with one author</p>
        {singleOwner.length > 0 ? (
          <div className="ov-since-list">
            {singleOwner.slice(0, OWNER_ROWS).map(folder => (
              <div key={folder.folder}>
                <span className="ov-owner-folder">{folder.folder}</span>
                <span className="ov-owner-name">{folder.authors[0].name} · {folder.fileCount} file{folder.fileCount === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ov-owner-clear">No sampled area depends on a single author.</p>
        )}
      </div>
    </div>
  );
}
