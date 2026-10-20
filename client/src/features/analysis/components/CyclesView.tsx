import { useMemo, useState } from 'react';
import { Check, RefreshCcw, Scissors } from 'lucide-react';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { findTangles } from '../services/cycles';

// Dependency cycles of any length and a plan to break each one
// (client/src/features/analysis/services/cycles.ts).

interface Props { data: any; onOpenFile: (path: string) => void }

function FileLink({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  return <button type="button" className="guide-file" onClick={() => onOpenFile(path)} title={path}>{path}</button>;
}

export default function CyclesView({ data, onOpenFile }: Props) {
  const tangles = useMemo(() => findTangles(data?.connections ?? []), [data]);
  const [selected, setSelected] = useState(0);
  const tangle = tangles[Math.min(selected, tangles.length - 1)];
  const tangled = tangles.reduce((n, t) => n + t.files.length, 0);

  return (
    <div className="gi-page guide-page fit-page">
      <header className="guide-header">
        <div>
          <h1>Dependency cycles</h1>
          <p>{tangles.length
            ? `${tangles.length} tangle${tangles.length === 1 ? '' : 's'} involving ${tangled} files. In a tangle every file depends on every other through some chain, so none can change, be tested or be reused in isolation. Each comes with the dependencies to cut, in order.`
            : 'No dependency cycles: every file can be understood without the files that depend on it.'}</p>
        </div>
      </header>

      <SummaryStrip items={[
        { label: 'Tangles', value: tangles.length, tone: tangles.length ? 'bad' : 'good', sub: tangles.length ? 'Groups of circular files' : 'No cycles' },
        { label: 'Files tangled', value: tangled, tone: tangled ? 'warn' : 'good', sub: `of ${(data?.files ?? []).length} analyzed` },
        { label: 'Cuts to untangle', value: tangles.reduce((n, t) => n + t.plan.length, 0), sub: 'Dependencies to remove' },
        { label: 'Largest tangle', value: tangles.reduce((m, t) => Math.max(m, t.files.length), 0), sub: 'Files' },
      ]} />

      {tangles.length === 0 ? (
        <section className="guide-card fit-pane"><p className="fit-empty"><span><Check size={20} aria-hidden="true" /><br />Every file can be changed without touching the files that depend on it.</span></p></section>
      ) : (
        <div className="fit-body" style={{ gridTemplateColumns: 'minmax(200px,.6fr) minmax(0,1.5fr) minmax(0,1fr)' }}>
          <section className="guide-card fit-pane">
            <h2><RefreshCcw size={15} aria-hidden="true" /> Tangles</h2>
            <div className="fit-scroll fit-list">
              {tangles.map((t, i) => (
                <button key={t.files.join('|')} type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}>
                  <strong>{t.files.length} files</strong>
                  <small>{t.dependencies} dependencies · {t.plan.length ? `${t.plan.length} cut${t.plan.length === 1 ? '' : 's'}` : 'too large to plan'}</small>
                  <small className="font-mono">{t.files.slice(0, 2).map(f => f.split('/').pop()).join(', ')}{t.files.length > 2 ? '…' : ''}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="guide-card fit-pane">
            <h2><Scissors size={15} aria-hidden="true" /> Break it by removing these dependencies</h2>
            <div className="fit-scroll">
              {tangle.plan.length > 0 ? (
                <>
                  <ol className="cycle-plan">
                    {tangle.plan.map(step => (
                      <li key={`${step.from}->${step.to}`}>
                        <div><FileLink path={step.from} onOpenFile={onOpenFile} /> <span aria-hidden="true">→</span> <FileLink path={step.to} onOpenFile={onOpenFile} /></div>
                        <p>
                          Uses {step.functions.slice(0, 4).map(f => <code key={f}>{f}()</code>).reduce<React.ReactNode[]>((acc, el, j) => (j ? [...acc, ', ', el] : [el]), [])}
                          {step.functions.length > 4 ? ` and ${step.functions.length - 4} more` : ''} ({step.calls} call{step.calls === 1 ? '' : 's'}).
                          {' '}Frees {step.freed} file{step.freed === 1 ? '' : 's'}. Move {step.functions.length === 1 ? 'it' : 'them'} into a module both can import, or pass {step.functions.length === 1 ? 'it' : 'them'} in instead of importing.
                        </p>
                      </li>
                    ))}
                  </ol>
                  {tangle.planComplete
                    ? <p className="rules-ok"><Check size={13} /> After these cuts no file in this group depends on itself.</p>
                    : <p className="guide-empty">These are the most effective first cuts; more remain after them.</p>}
                </>
              ) : <p className="guide-empty">This tangle is too large to plan automatically. Start from the files with the most dependencies.</p>}
            </div>
          </section>

          <section className="guide-card fit-pane">
            <h2>Files in the tangle</h2>
            <ul className="ask-list fit-scroll">{tangle.files.map(f => <li key={f}><div><FileLink path={f} onOpenFile={onOpenFile} /></div></li>)}</ul>
          </section>
        </div>
      )}
    </div>
  );
}
