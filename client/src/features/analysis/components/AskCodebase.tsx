import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, MessageSquareText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { appConfig } from '../../../app/config';
import { answerQuestion, type QueryAnswer } from '../services/codebaseQuery';
import { buildOnboardingGuide } from '../services/onboardingGuide';

interface Props {
  owner: string;
  repo: string;
  branch?: string;
  data: any;
  onOpenFile: (path: string) => void;
}

function FileLink({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  return <button type="button" className="guide-file" onClick={() => onOpenFile(path)} title={`Open ${path} in the code graph`}>{path}</button>;
}

function short(path: string) {
  return path.split('/').pop() || path;
}

// Paths an AI explanation may draw on: whatever the graph answer surfaced.
function evidencePaths(answer: QueryAnswer): string[] {
  switch (answer.kind) {
    case 'locate': return answer.results.map(r => r.path);
    case 'impact': return [answer.file, ...answer.direct].slice(0, 8);
    case 'dependencies': return [answer.file, ...answer.direct].slice(0, 8);
    case 'path': return answer.path ?? [answer.from, answer.to];
    default: return [];
  }
}

export default function AskCodebase({ owner, repo, branch, data, onOpenFile }: Props) {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<{ question: string; answer: QueryAnswer } | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [ai, setAi] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; answer?: string; cited?: string[]; error?: string }>({ state: 'idle' });

  useEffect(() => {
    fetch(`${appConfig.apiUrl}/api/analysis/ai-config`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : { explain: false }))
      .then(config => setAiAvailable(Boolean(config.explain)))
      .catch(() => setAiAvailable(false));
  }, []);

  // Examples that actually resolve in this repository.
  const examples = useMemo(() => {
    const guide = buildOnboardingGuide(data);
    const list = ['Where is authentication handled?'];
    const core = guide.coreModules[0]?.path;
    const entry = guide.entryPoints[0]?.path;
    if (core) list.push(`What breaks if I change ${short(core)}?`);
    if (entry) list.push(`What does ${short(entry)} depend on?`);
    if (entry && core && entry !== core) list.push(`How does ${short(entry)} reach ${short(core)}?`);
    return list;
  }, [data]);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setQuestion(q);
    setAsked({ question: q, answer: answerQuestion(data, q) });
    setAi({ state: 'idle' });
  };

  const explain = () => {
    if (!asked) return;
    setAi({ state: 'loading' });
    fetch(`${appConfig.apiUrl}/api/analysis/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/explain`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: asked.question, paths: evidencePaths(asked.answer), branch }),
    })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body?.error || 'Could not get an answer.');
        setAi({ state: 'done', answer: body.answer, cited: body.cited });
      })
      .catch(error => setAi({ state: 'error', error: error.message }));
  };

  const canExplain = aiAvailable && asked && evidencePaths(asked.answer).length > 0;

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Ask the codebase</h1>
          <p>Answers come from {owner}/{repo}'s dependency graph and function index — where something lives, what a change would break, and how files connect.</p>
        </div>
      </header>

      <form className="ask-form" onSubmit={event => { event.preventDefault(); ask(question); }}>
        <MessageSquareText size={16} aria-hidden="true" />
        <label htmlFor="ask-question" className="sr-only">Question about this repository</label>
        <input id="ask-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Where is authentication handled?" autoComplete="off" />
        <Button type="submit" className="guide-copy" disabled={!question.trim()}>Ask <ArrowRight size={14} /></Button>
      </form>
      <div className="ask-examples">
        {examples.map(example => <button type="button" key={example} onClick={() => ask(example)}>{example}</button>)}
      </div>

      {asked && (
        <section className="guide-card ask-answer" aria-live="polite">
          <Answer answer={asked.answer} onOpenFile={onOpenFile} onAsk={ask} />
          {canExplain && (
            <div className="ask-ai">
              {ai.state === 'idle' && <Button className="guide-copy" onClick={explain}><Sparkles size={14} /> Explain with AI</Button>}
              {ai.state === 'loading' && <p className="guide-empty">Reading the matched files…</p>}
              {ai.state === 'error' && <p className="arch-impact-error" role="alert">{ai.error}</p>}
              {ai.state === 'done' && <>
                <p className="ask-ai-text">{ai.answer}</p>
                {ai.cited && ai.cited.length > 0 && <p className="ask-ai-cited">Based on: {ai.cited.map(p => <FileLink key={p} path={p} onOpenFile={onOpenFile} />)}</p>}
                <p className="ask-ai-note">AI-written from the files above; check it against the code.</p>
              </>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Answer({ answer, onOpenFile, onAsk }: { answer: QueryAnswer; onOpenFile: (path: string) => void; onAsk: (q: string) => void }) {
  if (answer.kind === 'unresolved') {
    return <>
      <p className="guide-empty">{answer.message}</p>
      {answer.suggestions.length > 0 && <ul className="ask-list">{answer.suggestions.map(p => <li key={p}><button type="button" className="guide-file" onClick={() => onAsk(`What breaks if I change ${p}?`)}>What breaks if I change {p}?</button></li>)}</ul>}
    </>;
  }
  if (answer.kind === 'locate') {
    if (!answer.results.length) return <p className="guide-empty">Nothing in file paths or function names matches {answer.terms.length ? answer.terms.map(t => `“${t}”`).join(', ') : 'that question'}. Try a different word for the concept, or name a file.</p>;
    return <>
      <h2>Most likely places</h2>
      <ol className="ask-list">
        {answer.results.map(r => (
          <li key={r.path}>
            <div><FileLink path={r.path} onOpenFile={onOpenFile} /><span className="guide-layer">{r.layer}</span>{r.dependents > 0 && <small>used by {r.dependents}</small>}</div>
            {r.matches.length > 0 && <p>{r.matches.map(m => `${m.name}${m.line ? ` (line ${m.line})` : ''}`).join(', ')}</p>}
          </li>
        ))}
      </ol>
    </>;
  }
  if (answer.kind === 'impact') {
    const total = answer.direct.length + answer.transitive.length;
    return <>
      <h2>Changing <FileLink path={answer.file} onOpenFile={onOpenFile} /> affects {total} file{total === 1 ? '' : 's'}</h2>
      {total === 0 && <p className="guide-empty">Nothing else in the repository uses it, so a change stays local (tests and dynamic imports aside).</p>}
      {answer.direct.length > 0 && <><h3>Directly ({answer.direct.length})</h3><ul className="ask-list">{answer.direct.map(p => <li key={p}><FileLink path={p} onOpenFile={onOpenFile} /></li>)}</ul></>}
      {answer.transitive.length > 0 && <><h3>Indirectly ({answer.transitive.length})</h3><ul className="ask-list">{answer.transitive.slice(0, 40).map(p => <li key={p}><FileLink path={p} onOpenFile={onOpenFile} /></li>)}</ul>{answer.transitive.length > 40 && <p className="guide-empty">+{answer.transitive.length - 40} more</p>}</>}
    </>;
  }
  if (answer.kind === 'dependencies') {
    return <>
      <h2><FileLink path={answer.file} onOpenFile={onOpenFile} /> depends on {answer.direct.length} file{answer.direct.length === 1 ? '' : 's'}</h2>
      {answer.direct.length ? <ul className="ask-list">{answer.direct.map(p => <li key={p}><FileLink path={p} onOpenFile={onOpenFile} /></li>)}</ul> : <p className="guide-empty">It doesn't call into any other file in the repository.</p>}
    </>;
  }
  return <>
    <h2><FileLink path={answer.from} onOpenFile={onOpenFile} /> → <FileLink path={answer.to} onOpenFile={onOpenFile} /></h2>
    {answer.path
      ? <ol className="ask-path">{answer.path.map(p => <li key={p}><FileLink path={p} onOpenFile={onOpenFile} /></li>)}</ol>
      : <p className="guide-empty">{short(answer.from)} doesn't reach {short(answer.to)} through any chain of calls. Try the reverse direction.</p>}
  </>;
}
