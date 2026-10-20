import { useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown, ArrowRight, GitFork, History, MapPin, MessageSquareText, Route, Search, Sparkles, Trash2, Waypoints, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { appConfig } from '../../../app/config';
import { Page, PageHeader, Section } from '../../../shared/components/Page';
import { StateCard } from '../../../shared/components/StateCard';
import { EmptyNote } from '../../../shared/components/Dashboard';
import { usePersistentState } from '../../../shared/hooks/usePersistentState';
import { answerQuestion, type QueryAnswer } from '../services/codebaseQuery';
import { buildOnboardingGuide } from '../services/onboardingGuide';

interface Props {
  owner: string;
  repo: string;
  branch?: string;
  data: any;
  onOpenFile: (path: string) => void;
}

type Kind = 'locate' | 'impact' | 'dependencies' | 'path';

const KINDS: Record<Kind, { icon: LucideIcon; title: string; hint: string }> = {
  locate: { icon: MapPin, title: 'Where does it live?', hint: 'Finds files and functions by name' },
  impact: { icon: GitFork, title: 'What would a change break?', hint: 'Every file that depends on it' },
  dependencies: { icon: Waypoints, title: 'What does it depend on?', hint: 'The files it calls into' },
  path: { icon: Route, title: 'How do two files connect?', hint: 'The shortest chain of calls' },
};
const KIND_ORDER: Kind[] = ['locate', 'impact', 'dependencies', 'path'];
const NO_HISTORY: string[] = [];
const HISTORY_SIZE = 15;
const heading = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase';

function FileLink({ path, onOpenFile, className }: { path: string; onOpenFile: (path: string) => void; className?: string }) {
  return (
    <button type="button" onClick={() => onOpenFile(path)} title={`Open ${path} in the code graph`}
      className={cn('min-w-0 truncate border-0 bg-transparent p-0 text-left font-mono text-xs text-primary hover:underline', className)}>
      {path}
    </button>
  );
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
  // Recent questions per repository, kept for this user; answers are recomputed from the graph.
  const [history, setHistory] = usePersistentState<string[]>(`cg.ask.history.${owner}/${repo}`, NO_HISTORY);

  useEffect(() => {
    fetch(`${appConfig.apiUrl}/api/analysis/ai-config`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : { explain: false }))
      .then(config => setAiAvailable(Boolean(config.explain)))
      .catch(() => setAiAvailable(false));
  }, []);

  // Examples that actually resolve in this repository, grouped by what they answer.
  const examples = useMemo(() => {
    const guide = buildOnboardingGuide(data);
    const core = guide.coreModules.map(m => m.path);
    const entry = guide.entryPoints.map(e => e.path);
    const groups: Record<Kind, string[]> = {
      locate: ['Where is authentication handled?', ...guide.layers.filter(l => l.layer !== 'other').slice(0, 2).map(l => `Where are the ${l.layer} files?`)],
      impact: core.slice(0, 3).map(p => `What breaks if I change ${short(p)}?`),
      dependencies: entry.slice(0, 2).map(p => `What does ${short(p)} depend on?`),
      path: entry.slice(0, 2).flatMap((p, i) => (core[i] && core[i] !== p ? [`How does ${short(p)} reach ${short(core[i])}?`] : [])),
    };
    return groups;
  }, [data]);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    setQuestion(q);
    setAsked({ question: q, answer: answerQuestion(data, q) });
    setAi({ state: 'idle' });
    setHistory(list => [q, ...list.filter(x => x !== q)].slice(0, HISTORY_SIZE));
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
  const askedKind = asked && asked.answer.kind !== 'unresolved' ? KINDS[asked.answer.kind] : null;

  return (
    <Page>
      <PageHeader
        icon={MessageSquareText}
        tone="explore"
        title="Ask the codebase"
        description={`Answers come from ${owner}/${repo}'s dependency graph and function index: where something lives, what a change would break, and how files connect. ${aiAvailable ? 'An AI explanation can be added to any answer.' : ''}`}
      />

      <form className="flex shrink-0 items-center gap-2" onSubmit={event => { event.preventDefault(); ask(question); }}>
        <span className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="ask-question" className="sr-only">Question about this repository</label>
          <Input id="ask-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about a file or concept, e.g. Where is authentication handled?" autoComplete="off" className="h-10 bg-[var(--surface-subtle)] pl-9 text-[13px]" />
        </span>
        <Button type="submit" className="h-10 gap-1.5 px-4" disabled={!question.trim()}>Ask <ArrowRight className="size-4" /></Button>
      </form>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.6fr)]">
        <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(0,1fr)_auto]">
          <Section title="Suggested questions" icon={Sparkles} className="min-h-[260px]" bodyClassName="flex flex-col gap-4">
            {KIND_ORDER.filter(kind => examples[kind].length).map(kind => {
              const { icon: Icon, title } = KINDS[kind];
              return (
                <div key={kind} className="flex flex-col gap-1">
                  <h3 className={cn(heading, 'flex items-center gap-1.5')}><Icon className="size-3.5" /> {title}</h3>
                  <ul className="list-none flex flex-col">
                    {examples[kind].map(example => (
                      <li key={example}>
                        <button type="button" onClick={() => ask(example)} className={cn('-mx-2 w-[calc(100%+1rem)] truncate rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-[var(--surface-hover)]', asked?.question === example && 'bg-[var(--surface-hover)] font-medium')}>
                          {example}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Section>

          <Section title="Recent" icon={History} meta={history.length ? `${history.length}` : undefined} className="min-h-[140px] lg:max-h-[280px]" bodyClassName="py-1"
            actions={history.length > 0 && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setHistory([])}><Trash2 className="size-3.5" /> Clear</Button>}>
            {history.length ? (
              <ul className="list-none flex flex-col">
                {history.map(q => (
                  <li key={q} className="group flex items-center">
                    <button type="button" onClick={() => ask(q)} className={cn('-ml-2 min-w-0 flex-1 truncate rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover)]', asked?.question === q && 'bg-[var(--surface-hover)] font-medium')}>{q}</button>
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Remove "${q}" from recent questions`} onClick={() => setHistory(list => list.filter(x => x !== q))}><X className="size-3.5" /></Button>
                  </li>
                ))}
              </ul>
            ) : <EmptyNote>Questions you ask are listed here so you can run them again.</EmptyNote>}
          </Section>
        </div>

        <Section
          title={asked ? asked.question : 'Answer'}
          icon={askedKind?.icon ?? MessageSquareText}
          meta={askedKind?.hint}
          className="min-h-[360px]"
          bodyClassName="flex flex-col gap-4 p-5"
          actions={canExplain && ai.state === 'idle' && <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={explain}><Sparkles className="size-3.5" /> Explain with AI</Button>}
        >
          {asked ? (
            <div className="flex flex-col gap-4" aria-live="polite">
              {ai.state !== 'idle' && (
                <div className="flex items-start gap-2.5 rounded-lg border bg-card p-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h3 className={heading}>AI explanation</h3>
                    {ai.state === 'loading' && <p className="text-[13px] text-muted-foreground">Reading the matched files…</p>}
                    {ai.state === 'error' && <p className="text-[13px] text-[var(--color-danger)]" role="alert">{ai.error}</p>}
                    {ai.state === 'done' && <>
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{ai.answer}</p>
                      {ai.cited && ai.cited.length > 0 && <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">Based on: {ai.cited.map(p => <FileLink key={p} path={p} onOpenFile={onOpenFile} />)}</p>}
                      <p className="text-[11px] text-muted-foreground">AI-written from the files above; check it against the code.</p>
                    </>}
                  </div>
                </div>
              )}
              <Answer answer={asked.answer} onOpenFile={onOpenFile} onAsk={ask} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <StateCard icon={MessageSquareText} title="Ask anything about this repository">
                Type a question above or pick a suggestion. Four kinds of question are understood; name a file by its path or file name.
              </StateCard>
              <ul className="list-none grid gap-2 sm:grid-cols-2">
                {KIND_ORDER.map(kind => {
                  const { icon: Icon, title, hint } = KINDS[kind];
                  const example = examples[kind][0];
                  return (
                    <li key={kind}>
                      <button type="button" disabled={!example} onClick={() => example && ask(example)} className="flex h-full w-full items-start gap-3 rounded-lg border bg-card p-3 text-left text-inherit hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-60">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg border text-primary"><Icon className="size-4" /></span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <strong className="text-[13px] font-semibold">{title}</strong>
                          <span className="text-xs text-muted-foreground">{hint}</span>
                          {example && <span className="mt-1 truncate text-xs text-primary">{example}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Section>
      </div>
    </Page>
  );
}

function FileList({ paths, onOpenFile }: { paths: string[]; onOpenFile: (path: string) => void }) {
  return (
    <ul className="list-none divide-y overflow-hidden rounded-lg border bg-card">
      {paths.map(p => <li key={p} className="flex px-3 py-2 hover:bg-[var(--surface-hover)]"><FileLink path={p} onOpenFile={onOpenFile} /></li>)}
    </ul>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[120px] flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
      <span className={heading}>{label}</span>
      <strong className="font-mono text-xl font-semibold tabular-nums">{value}</strong>
    </div>
  );
}

function Answer({ answer, onOpenFile, onAsk }: { answer: QueryAnswer; onOpenFile: (path: string) => void; onAsk: (q: string) => void }) {
  if (answer.kind === 'unresolved') {
    return <>
      <p className="text-[13px] text-muted-foreground">{answer.message}</p>
      {answer.suggestions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className={heading}>Did you mean</h3>
          <ul className="list-none divide-y overflow-hidden rounded-lg border bg-card">
            {answer.suggestions.map(p => (
              <li key={p}><button type="button" className="w-full truncate border-0 bg-transparent px-3 py-2 text-left text-[13px] text-primary hover:bg-[var(--surface-hover)]" onClick={() => onAsk(`What breaks if I change ${p}?`)}>What breaks if I change {p}?</button></li>
            ))}
          </ul>
        </div>
      )}
    </>;
  }
  if (answer.kind === 'locate') {
    if (!answer.results.length) {
      return <EmptyNote>Nothing in file paths or function names matches {answer.terms.length ? answer.terms.map(t => `“${t}”`).join(', ') : 'that question'}. Try a different word for the concept, or name a file.</EmptyNote>;
    }
    return <>
      <h3 className={heading}>Most likely places · {answer.results.length}</h3>
      <ol className="list-none divide-y overflow-hidden rounded-lg border bg-card">
        {answer.results.map((r, i) => (
          <li key={r.path} className="flex items-start gap-3 px-3 py-2.5 hover:bg-[var(--surface-hover)]">
            <span className="grid size-6 shrink-0 place-items-center rounded-md border font-mono text-[11px] text-muted-foreground">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <FileLink path={r.path} onOpenFile={onOpenFile} className="text-[13px] font-medium" />
              {r.matches.length > 0 && <span className="truncate text-xs text-muted-foreground">{r.matches.map(m => `${m.name}${m.line ? ` (line ${m.line})` : ''}`).join(', ')}</span>}
            </div>
            <span className="shrink-0 rounded-full border px-1.5 text-[10px] leading-4 font-semibold tracking-wide text-muted-foreground uppercase">{r.layer}</span>
            {r.dependents > 0 && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">used by {r.dependents}</span>}
          </li>
        ))}
      </ol>
    </>;
  }
  if (answer.kind === 'impact') {
    const total = answer.direct.length + answer.transitive.length;
    return <>
      <p className="text-[13px]">Changing <FileLink path={answer.file} onOpenFile={onOpenFile} className="text-[13px]" /> affects {total} file{total === 1 ? '' : 's'}.</p>
      <div className="flex flex-wrap gap-2"><Count label="Directly" value={answer.direct.length} /><Count label="Indirectly" value={answer.transitive.length} /></div>
      {total === 0 && <EmptyNote>Nothing else in the repository uses it, so a change stays local (tests and dynamic imports aside).</EmptyNote>}
      {answer.direct.length > 0 && <div className="flex flex-col gap-1.5"><h3 className={heading}>Directly ({answer.direct.length})</h3><FileList paths={answer.direct} onOpenFile={onOpenFile} /></div>}
      {answer.transitive.length > 0 && <div className="flex flex-col gap-1.5">
        <h3 className={heading}>Indirectly ({answer.transitive.length})</h3>
        <FileList paths={answer.transitive.slice(0, 40)} onOpenFile={onOpenFile} />
        {answer.transitive.length > 40 && <p className="text-xs text-muted-foreground">+{answer.transitive.length - 40} more</p>}
      </div>}
    </>;
  }
  if (answer.kind === 'dependencies') {
    return <>
      <p className="text-[13px]"><FileLink path={answer.file} onOpenFile={onOpenFile} className="text-[13px]" /> depends on {answer.direct.length} file{answer.direct.length === 1 ? '' : 's'}.</p>
      {answer.direct.length ? <FileList paths={answer.direct} onOpenFile={onOpenFile} /> : <EmptyNote>It doesn't call into any other file in the repository.</EmptyNote>}
    </>;
  }
  return <>
    <p className="flex flex-wrap items-center gap-2 text-[13px]"><FileLink path={answer.from} onOpenFile={onOpenFile} className="text-[13px]" /> <ArrowRight className="size-3.5 text-muted-foreground" /> <FileLink path={answer.to} onOpenFile={onOpenFile} className="text-[13px]" /></p>
    {answer.path ? (
      <ol className="list-none flex flex-col items-start">
        {answer.path.map((p, i) => (
          <li key={p} className="flex flex-col items-start">
            {i > 0 && <ArrowDown className="my-1 ml-3 size-3.5 text-muted-foreground" aria-hidden="true" />}
            <span className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              <FileLink path={p} onOpenFile={onOpenFile} />
            </span>
          </li>
        ))}
      </ol>
    ) : <EmptyNote>{short(answer.from)} doesn't reach {short(answer.to)} through any chain of calls. Try the reverse direction.</EmptyNote>}
  </>;
}
