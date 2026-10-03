import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { appConfig } from '../../../app/config';

// What a branch does to the architecture compared with another branch:
// GET /api/analysis/:owner/:repo/compare (server/src/analysis/compareAnalyses.ts).
// Both branches must be analyzed first, which costs real work, so this only
// starts when asked and then polls until the server has both analyses.

interface Capped<T> { items: T[]; total: number }
interface Snapshot { healthScore: number; healthGrade: string; stats: Record<string, number> }
interface Diff {
  base: Snapshot; head: Snapshot;
  files: { added: Capped<string>; removed: Capped<string> };
  dependencies: { added: Capped<{ from: string; to: string }>; removed: Capped<{ from: string; to: string }> };
  cycles: { introduced: Capped<[string, string]>; resolved: Capped<[string, string]> };
  violations: { introduced: Capped<{ from: string; to: string; fromLayer?: string; toLayer?: string }>; resolved: Capped<{ from: string; to: string }> };
  largeFiles: { introduced: Capped<{ path: string; functions: number }> };
}
type SideStatus = 'queued' | 'active' | 'failed';
type State =
  | { kind: 'idle' }
  | { kind: 'pending'; base: SideStatus; head: SideStatus }
  | { kind: 'ready'; diff: Diff; baseSha: string; headSha: string }
  | { kind: 'error'; message: string };

const POLL_MS = 2500;

function short(path: string) {
  return path.split('/').slice(-2).join('/');
}

function sideLabel(status: SideStatus) {
  return status === 'active' ? 'analyzing' : status === 'failed' ? 'failed' : 'queued';
}

function List<T>({ title, data, tone, render }: { title: string; data: Capped<T>; tone: 'bad' | 'good' | 'neutral'; render: (item: T) => React.ReactNode }) {
  if (!data.total) return null;
  return (
    <section className={`arch-impact-list ${tone}`}>
      <h3>{title} <span>{data.total}</span></h3>
      <ul>{data.items.map((item, i) => <li key={i}>{render(item)}</li>)}</ul>
      {data.total > data.items.length && <p>+{data.total - data.items.length} more</p>}
    </section>
  );
}

export default function ArchitectureImpact({ owner, repo, base, head }: { owner: string; repo: string; base: string; head: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [open, setOpen] = useState(true);
  const runRef = useRef(0);

  // A different pair of branches invalidates whatever was shown or polling.
  useEffect(() => { runRef.current++; setState({ kind: 'idle' }); }, [owner, repo, base, head]);
  useEffect(() => () => { runRef.current++; }, []);

  const endpoint = `${appConfig.apiUrl}/api/analysis/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  function poll(run: number) {
    if (run !== runRef.current) return;
    fetch(`${endpoint}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`, { credentials: 'include' })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (run !== runRef.current) return;
        if (!res.ok && res.status !== 202) throw new Error(body?.error || 'Comparison failed.');
        if (body.status === 'ready') { setState({ kind: 'ready', diff: body.diff, baseSha: body.base.commitSha, headSha: body.head.commitSha }); return; }
        setState({ kind: 'pending', base: body.base.status, head: body.head.status });
        if (body.base.status !== 'failed' && body.head.status !== 'failed') setTimeout(() => poll(run), POLL_MS);
      })
      .catch(error => { if (run === runRef.current) setState({ kind: 'error', message: error.message || 'Comparison failed.' }); });
  }

  function start() {
    const run = ++runRef.current;
    setOpen(true);
    setState({ kind: 'pending', base: 'queued', head: 'queued' });
    poll(run);
  }

  // A failed side stays failed until explicitly re-run (same rule as Rescan).
  function retryFailed(failed: string[]) {
    const run = ++runRef.current;
    setState({ kind: 'pending', base: 'queued', head: 'queued' });
    Promise.all(failed.map(ref => fetch(`${endpoint}/refresh?branch=${encodeURIComponent(ref)}`, { method: 'POST', credentials: 'include' })))
      .then(() => setTimeout(() => poll(run), POLL_MS))
      .catch(error => setState({ kind: 'error', message: error.message }));
  }

  const sameBranch = !base || !head || base === head;

  return (
    <div className="arch-impact">
      <div className="arch-impact-head">
        <Button variant="ghost" className="arch-impact-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open} disabled={state.kind !== 'ready'}>
          {state.kind === 'ready' && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          <Network size={15} /> Architecture impact
        </Button>
        {state.kind === 'idle' && <>
          <span className="arch-impact-hint">How {head || 'this branch'} changes dependencies, cycles and layering compared with {base || 'the base'}.</span>
          <Button className="arch-impact-run" onClick={start} disabled={sameBranch}>Analyze impact</Button>
        </>}
        {state.kind === 'pending' && <span className="arch-impact-hint" role="status">
          Analyzing both branches on the server — {base}: {sideLabel(state.base)}, {head}: {sideLabel(state.head)}
          {(state.base === 'failed' || state.head === 'failed') && <Button className="arch-impact-run" onClick={() => retryFailed([state.base === 'failed' ? base : '', state.head === 'failed' ? head : ''].filter(Boolean))}>Retry</Button>}
        </span>}
        {state.kind === 'error' && <span className="arch-impact-error" role="alert">{state.message} <Button className="arch-impact-run" onClick={start}>Try again</Button></span>}
        {state.kind === 'ready' && <Summary diff={state.diff} />}
      </div>
      {state.kind === 'ready' && open && <Details diff={state.diff} base={base} head={head} baseSha={state.baseSha} headSha={state.headSha} />}
    </div>
  );
}

function Summary({ diff }: { diff: Diff }) {
  const delta = diff.head.healthScore - diff.base.healthScore;
  return (
    <span className="arch-impact-summary">
      <b className={delta < 0 ? 'bad' : delta > 0 ? 'good' : ''}>{diff.base.healthGrade} {diff.base.healthScore} → {diff.head.healthGrade} {diff.head.healthScore}</b>
      <span>+{diff.dependencies.added.total} / −{diff.dependencies.removed.total} dependencies</span>
      {diff.cycles.introduced.total > 0 && <span className="bad">{diff.cycles.introduced.total} new cycle{diff.cycles.introduced.total === 1 ? '' : 's'}</span>}
      {diff.violations.introduced.total > 0 && <span className="bad">{diff.violations.introduced.total} new violation{diff.violations.introduced.total === 1 ? '' : 's'}</span>}
      <span>+{diff.files.added.total} / −{diff.files.removed.total} files</span>
    </span>
  );
}

function Details({ diff, base, head, baseSha, headSha }: { diff: Diff; base: string; head: string; baseSha: string; headSha: string }) {
  const nothing = !diff.dependencies.added.total && !diff.dependencies.removed.total && !diff.cycles.introduced.total && !diff.cycles.resolved.total
    && !diff.violations.introduced.total && !diff.violations.resolved.total && !diff.largeFiles.introduced.total && !diff.files.added.total && !diff.files.removed.total;
  return (
    <div className="arch-impact-body">
      <p className="arch-impact-refs">{base} @ <code>{baseSha.slice(0, 7)}</code> → {head} @ <code>{headSha.slice(0, 7)}</code></p>
      {nothing && <p className="arch-impact-hint">No structural difference: same files, dependencies, cycles and layering.</p>}
      <div className="arch-impact-grid">
        <List title="Cycles introduced" tone="bad" data={diff.cycles.introduced} render={([a, b]) => <><code>{short(a)}</code> ↔ <code>{short(b)}</code></>} />
        <List title="Layer violations introduced" tone="bad" data={diff.violations.introduced} render={v => <><code>{short(v.from)}</code> → <code>{short(v.to)}</code>{v.fromLayer && <small> {v.fromLayer} → {v.toLayer}</small>}</>} />
        <List title="Files that grew too large" tone="bad" data={diff.largeFiles.introduced} render={f => <><code>{short(f.path)}</code> <small>{f.functions} functions</small></>} />
        <List title="New dependencies" tone="neutral" data={diff.dependencies.added} render={d => <><code>{short(d.from)}</code> → <code>{short(d.to)}</code></>} />
        <List title="Removed dependencies" tone="neutral" data={diff.dependencies.removed} render={d => <><code>{short(d.from)}</code> → <code>{short(d.to)}</code></>} />
        <List title="Cycles resolved" tone="good" data={diff.cycles.resolved} render={([a, b]) => <><code>{short(a)}</code> ↔ <code>{short(b)}</code></>} />
        <List title="Violations resolved" tone="good" data={diff.violations.resolved} render={v => <><code>{short(v.from)}</code> → <code>{short(v.to)}</code></>} />
        <List title="Files added" tone="neutral" data={diff.files.added} render={p => <code>{p}</code>} />
        <List title="Files removed" tone="neutral" data={diff.files.removed} render={p => <code>{p}</code>} />
      </div>
    </div>
  );
}
