import { useEffect, useState } from 'react';
import { computeOwnershipRisk, type OwnershipRiskSummary } from '../../git-insights/services/ownershipRisk';
import { EmptyNote, Meter, Metric, Panel } from '../../../shared/components/Dashboard';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  repoInfo: { owner: string; repo: string } | null | undefined;
  files: { path?: string; name?: string }[];
  className?: string;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; summary: OwnershipRiskSummary }
  | { status: 'unavailable'; reason: string };

const OWNER_ROWS = 4;

export default function OwnershipRiskPanel({ repoInfo, files, className }: Props) {
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
    <Panel title="Ownership risk" meta={`Top ${state.status === 'ready' ? state.summary.sampledFolders : 8} areas · last 30 commits each`} className={className}>
      {state.status === 'loading' && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[64, 44, 78, 52].map((width, index) => <Skeleton key={index} className="h-4" style={{ width: `${width}%` }} />)}
        </div>
      )}
      {state.status === 'unavailable' && <EmptyNote>{state.reason}</EmptyNote>}
      {state.status === 'ready' && <OwnershipSummary summary={state.summary} />}
    </Panel>
  );
}

function OwnershipSummary({ summary }: { summary: OwnershipRiskSummary }) {
  const singleOwner = summary.folders.filter(folder => folder.authors.length === 1);
  const concentrated = summary.busFactor !== null && summary.busFactor <= 2;
  const lead = summary.contributors[0];

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Bus factor" value={summary.busFactor ?? '—'} tone={concentrated ? 'bad' : 'good'}
          sub={summary.busFactor === null ? 'No history' : concentrated ? 'Knowledge is concentrated' : 'Spread out'} />
        <Metric label="Single-owner areas" value={`${singleOwner.length}/${summary.ownedFolders}`} tone={singleOwner.length ? 'warn' : 'good'}
          sub={lead ? `${lead.name} wrote ${Math.round(lead.share * 100)}%` : undefined} />
      </div>
      {singleOwner.length > 0 ? (
        <ul className="flex min-h-0 flex-col divide-y text-xs">
          {singleOwner.slice(0, OWNER_ROWS).map(folder => (
            <li key={folder.folder} className="flex items-center justify-between gap-3 py-1.5">
              <span className="truncate font-mono">{folder.folder}</span>
              <span className="shrink-0 text-muted-foreground">{folder.authors[0].name} · {folder.fileCount} file{folder.fileCount === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      ) : summary.contributors.length > 0 ? (
        <div className="flex flex-col">
          <p className="mb-1 text-xs text-muted-foreground">No area depends on a single author. Who wrote the sampled commits:</p>
          {summary.contributors.slice(0, OWNER_ROWS).map(c => (
            <Meter key={c.name} label={c.name} value={c.share * 100} display={`${Math.round(c.share * 100)}%`} tone={c.share > 0.5 ? 'warn' : 'neutral'} />
          ))}
        </div>
      ) : (
        <EmptyNote>No sampled area depends on a single author.</EmptyNote>
      )}
    </div>
  );
}
