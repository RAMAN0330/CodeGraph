import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eraser, FileX, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildCleanupPlan, planToMarkdown } from '../services/cleanupPlan';

// Unused functions as a removal plan (services/cleanupPlan.ts). Ticks are a
// per-viewer convenience kept in this browser only.

interface Props { owner: string; repo: string; data: any; onOpenFile: (path: string) => void }

const storageKey = (owner: string, repo: string) => `structrace:cleanup:${owner}/${repo}`.toLowerCase();

function loadTicks(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}

export default function CleanupPlanView({ owner, repo, data, onOpenFile }: Props) {
  const plan = useMemo(() => buildCleanupPlan(data), [data]);
  const key = storageKey(owner, repo);
  const [done, setDone] = useState<Set<string>>(() => loadTicks(key));
  const [copied, setCopied] = useState(false);
  useEffect(() => { setDone(loadTicks(key)); }, [key]);

  const toggle = (id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* storage unavailable: ticks last for this visit */ }
      return next;
    });
  };
  const copy = () => {
    navigator.clipboard.writeText(planToMarkdown(plan, `${owner}/${repo}`)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  if (!plan.totals.functions) {
    return <div className="gi-page guide-page"><h1>Cleanup plan</h1><div className="guide-card"><p className="guide-empty">No unused functions were found.</p></div></div>;
  }
  const hasMentions = (data?.deadFunctions ?? []).some((f: any) => Array.isArray(f.mentions));

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Cleanup plan</h1>
          <p>{plan.totals.functions} unused functions, about {plan.totals.lines} lines{plan.totals.wholeFiles ? `, including ${plan.totals.wholeFiles} whole file${plan.totals.wholeFiles === 1 ? '' : 's'} that can go` : ''}. {plan.totals.check ? `${plan.totals.check} are named somewhere else in the repository and may be called dynamically — check those first.` : ''}{!hasMentions ? ' Rescan to also check whether names appear elsewhere.' : ''}</p>
        </div>
        <Button className="guide-copy" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy as checklist</>}</Button>
      </header>

      {plan.files.map(file => (
        <section key={file.path} className={`guide-card cleanup-file${file.wholeFile ? ' whole' : ''}`}>
          <header>
            {file.wholeFile ? <FileX size={15} aria-hidden="true" /> : <Eraser size={15} aria-hidden="true" />}
            <button type="button" className="guide-file" onClick={() => onOpenFile(file.path)}>{file.path}</button>
            <small>{file.wholeFile ? 'delete the whole file · ' : ''}{file.items.length} function{file.items.length === 1 ? '' : 's'} · {file.lines} lines</small>
          </header>
          <ul>
            {file.items.map(item => {
              const id = `${file.path}#${item.name}`;
              return (
                <li key={id} className={done.has(id) ? 'done' : ''}>
                  <label>
                    <input type="checkbox" checked={done.has(id)} onChange={() => toggle(id)} />
                    <code>{item.name}()</code>
                    <small>line {item.line} · {item.lines} lines</small>
                    {item.confidence === 'check' && <span className="cleanup-check" title={`Also named in ${item.mentions.join(', ')}`}><HelpCircle size={12} /> named in {item.mentions.length} other file{item.mentions.length === 1 ? '' : 's'}</span>}
                  </label>
                  {item.confidence === 'check' && <p>{item.mentions.map(m => <button key={m} type="button" className="guide-file" onClick={() => onOpenFile(m)}>{m}</button>)}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
