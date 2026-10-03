import { useMemo, useState } from 'react';
import { Check, RefreshCcw, Scissors } from 'lucide-react';
import { findTangles } from '../services/cycles';

// Dependency cycles of any length and a plan to break each one
// (client/src/features/analysis/services/cycles.ts).

interface Props { data: any; onOpenFile: (path: string) => void }

function FileLink({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  return <button type="button" className="guide-file" onClick={() => onOpenFile(path)} title={path}>{path}</button>;
}

export default function CyclesView({ data, onOpenFile }: Props) {
  const tangles = useMemo(() => findTangles(data?.connections ?? []), [data]);
  const [expanded, setExpanded] = useState<number | null>(0);
  const tangled = tangles.reduce((n, t) => n + t.files.length, 0);

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Dependency cycles</h1>
          <p>{tangles.length
            ? `${tangles.length} tangle${tangles.length === 1 ? '' : 's'} involving ${tangled} files. In a tangle every file depends on every other through some chain, so none can change, be tested or be reused in isolation. Each comes with the dependencies to cut, in order.`
            : 'No dependency cycles: every file can be understood without the files that depend on it.'}</p>
        </div>
      </header>

      {tangles.map((t, i) => (
        <section key={t.files.join('|')} className="guide-card cycle-card">
          <button type="button" className="cycle-head" aria-expanded={expanded === i} onClick={() => setExpanded(expanded === i ? null : i)}>
            <RefreshCcw size={15} aria-hidden="true" />
            <strong>{t.files.length} files</strong>
            <span>{t.dependencies} dependencies inside · {t.plan.length ? `${t.plan.length} cut${t.plan.length === 1 ? '' : 's'} to untangle` : 'too large to plan automatically'}</span>
            <small>{t.files.slice(0, 3).map(f => f.split('/').pop()).join(', ')}{t.files.length > 3 ? '…' : ''}</small>
          </button>
          {expanded === i && (
            <div className="cycle-body">
              {t.plan.length > 0 && (
                <>
                  <h3><Scissors size={13} /> Break it by removing these dependencies</h3>
                  <ol className="cycle-plan">
                    {t.plan.map(step => (
                      <li key={`${step.from}->${step.to}`}>
                        <div><FileLink path={step.from} onOpenFile={onOpenFile} /> <span aria-hidden="true">→</span> <FileLink path={step.to} onOpenFile={onOpenFile} /></div>
                        <p>
                          Uses {step.functions.slice(0, 4).map(f => <code key={f}>{f}()</code>).reduce<React.ReactNode[]>((acc, el, j) => (j ? [...acc, ', ', el] : [el]), [])}
                          {step.functions.length > 4 ? ` and ${step.functions.length - 4} more` : ''} ({step.calls} call{step.calls === 1 ? '' : 's'}).
                          {' '}Frees {step.freed} file{step.freed === 1 ? '' : 's'} from the tangle. Move {step.functions.length === 1 ? 'it' : 'them'} into a module both can import, or pass {step.functions.length === 1 ? 'it' : 'them'} in instead of importing.
                        </p>
                      </li>
                    ))}
                  </ol>
                  {t.planComplete
                    ? <p className="rules-ok"><Check size={13} /> After these cuts no file in this group depends on itself.</p>
                    : <p className="guide-empty">These are the most effective first cuts; more remain after them.</p>}
                </>
              )}
              <h3>Files in the tangle</h3>
              <ul className="ask-list">{t.files.map(f => <li key={f}><div><FileLink path={f} onOpenFile={onOpenFile} /></div></li>)}</ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
