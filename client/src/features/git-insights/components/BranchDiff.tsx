import { useState, useEffect, useCallback, useRef } from 'react';
import { GitHub } from '../../repository/services/github';
import ArchitectureImpact from './ArchitectureImpact';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowLeftRight, Check, ChevronDown, ChevronRight, Copy, GitBranch, GitCompareArrows, GitMerge, Layers, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section } from '../../../shared/components/Page';
import { StateCard } from '../../../shared/components/StateCard';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python',
  go: 'go',
  java: 'java',
  css: 'css', scss: 'css',
  html: 'xml', xml: 'xml',
  json: 'json',
  md: 'markdown',
};

function detectLang(patch: string): string {
  const m = patch.match(/^diff --git a\/(.+?) b\//m);
  if (!m) return '';
  const ext = m[1].split('.').pop()?.toLowerCase() || '';
  return EXT_TO_LANG[ext] || '';
}

function highlightLine(code: string, lang: string): string {
  if (!lang) return escapeHtml(code);
  try {
    return hljs.highlight(code, { language: lang }).value;
  } catch {
    return escapeHtml(code);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

interface Props {
  owner: string;
  repo: string;
  branches: { name: string }[];
  currentBranch: string;
}

interface DiffFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface ConflictFile {
  filename: string;
  baseContent: string;
  headContent: string;
  resolved: string;
  basePatch?: string;
  headPatch?: string;
}

export default function BranchDiff({ owner, repo, branches: branchesProp, currentBranch }: Props) {
  // The workspace passes one guessed branch ('main') when its own branch list didn't load; fetch the real list then.
  const [fetchedBranches, setFetchedBranches] = useState<{ name: string }[] | null>(null);
  useEffect(() => {
    if (branchesProp.length > 1) return;
    let cancelled = false;
    GitHub.getBranches(owner, repo).then((list: any) => { if (!cancelled && Array.isArray(list) && list.length) setFetchedBranches(list); });
    return () => { cancelled = true; };
  }, [owner, repo, branchesProp.length]);
  const branches = fetchedBranches ?? branchesProp;
  const [base, setBase] = useState(currentBranch || branches[0]?.name || 'main');
  const [head, setHead] = useState(branches.find(b => b.name !== base)?.name || branches[1]?.name || '');
  const [diff, setDiff] = useState<DiffFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<DiffFile | null>(null);
  const [draggingFile, setDraggingFile] = useState<DiffFile | null>(null);
  const [stagedFiles, setStagedFiles] = useState<DiffFile[]>([]);
  const [conflict, setConflict] = useState<ConflictFile | null>(null);
  const [mergeMsg, setMergeMsg] = useState<string>('');
  const [patchDraft, setPatchDraft] = useState('');
  const [patchMode, setPatchMode] = useState<'edit' | 'preview'>('edit');
  const [conflictCandidates, setConflictCandidates] = useState<Map<string, DiffFile>>(new Map());
  const [_diffWorker, setDiffWorker] = useState<Worker | null>(null);
  const [showGitCmds, setShowGitCmds] = useState(false);
  const [runFeedback, setRunFeedback] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../../../workers/diffWorker.ts', import.meta.url), { type: 'module' });
    setDiffWorker(worker);
    return () => worker.terminate();
  }, []);

  // `base`/`head` only get an initial guess from `branches`/`currentBranch` at
  // mount — when those props arrive asynchronously after this component is
  // already mounted (the common case: the parent is still fetching the repo's
  // branch list), the guess is locked in as stale or empty and never
  // recovers, leaving one or both dropdowns permanently blank. Re-resolve
  // whenever the real branch list shows up or changes, but leave an already
  // valid manual selection alone.
  useEffect(() => {
    if (!branches.length) return;
    const validNames = new Set(branches.map(b => b.name));
    setBase(prev => (prev && validNames.has(prev)) ? prev
      : (currentBranch && validNames.has(currentBranch)) ? currentBranch
      : ['main', 'master', 'develop'].find(n => validNames.has(n)) || branches[0].name);
  }, [branches, currentBranch]);

  useEffect(() => {
    if (!branches.length) return;
    const validNames = new Set(branches.map(b => b.name));
    setHead(prev => (prev && validNames.has(prev) && prev !== base) ? prev
      : branches.find(b => b.name !== base)?.name || '');
  }, [branches, base]);

  // Branch choices settle in a few renders; only the latest comparison may set the result.
  const runRef = useRef(0);
  const loadDiff = useCallback(async () => {
    if (!base || !head || base === head) return;
    const run = ++runRef.current;
    setLoading(true);
    setError(null);
    setDiff(null);
    setSelectedFile(null);
    setStagedFiles([]);
    setConflictCandidates(new Map());
    try {
      const [result, reverseResult]: any[] = await Promise.all([
        GitHub.getCompare(owner, repo, base, head),
        GitHub.getCompare(owner, repo, head, base).catch(() => ({ files: [] })),
      ]);
      if (run !== runRef.current) return;
      const reverseFiles = new Map<string, DiffFile>();
      (reverseResult.files || []).forEach((f: DiffFile) => {
        if (f.status !== 'removed') reverseFiles.set(f.filename, f);
      });
      const forwardFiles = result.files || [];
      const candidates = new Map<string, DiffFile>();
      forwardFiles.forEach((f: DiffFile) => {
        if (f.status !== 'removed' && reverseFiles.has(f.filename)) candidates.set(f.filename, reverseFiles.get(f.filename)!);
      });
      setStatus(result.status || '');
      setConflictCandidates(candidates);
      setDiff(forwardFiles);
    } catch (e: any) {
      if (run === runRef.current) setError(e.message || 'Failed to compare branches');
    } finally {
      if (run === runRef.current) setLoading(false);
    }
  }, [owner, repo, base, head]);

  useEffect(() => { loadDiff(); }, [loadDiff]);
  useEffect(() => {
    setPatchDraft(selectedFile?.patch || '');
    setPatchMode('edit');
  }, [selectedFile?.filename, selectedFile?.patch]);

  function onDragStart(f: DiffFile) { setDraggingFile(f); }

  function openConflictEditor(file: DiffFile) {
    Promise.all([
      GitHub.getFile(owner, repo, file.filename, base).catch(() => ''),
      GitHub.getFile(owner, repo, file.filename, head).catch(() => ''),
    ]).then(([baseContent, headContent]: any[]) => {
      setConflict({
        filename: file.filename,
        baseContent: baseContent || '',
        headContent: headContent || '',
        resolved: headContent || '',
        basePatch: conflictCandidates.get(file.filename)?.patch || '',
        headPatch: file.patch || '',
      });
    }).catch(() => {
      setConflict({
        filename: file.filename,
        baseContent: '',
        headContent: '',
        resolved: '',
        basePatch: conflictCandidates.get(file.filename)?.patch || '',
        headPatch: file.patch || '',
      });
    });
  }

  function onDropToStage(e: React.DragEvent) {
    e.preventDefault();
    if (!draggingFile) return;
    if (conflictCandidates.has(draggingFile.filename)) {
      openConflictEditor(draggingFile);
    } else {
      setStagedFiles(prev => prev.find(f => f.filename === draggingFile.filename) ? prev : [...prev, draggingFile]);
    }
    setDraggingFile(null);
  }

  function onDropToUnstage(e: React.DragEvent) {
    e.preventDefault();
    if (!draggingFile) return;
    setStagedFiles(prev => prev.filter(f => f.filename !== draggingFile.filename));
    setDraggingFile(null);
  }

  function resolveConflict() {
    if (!conflict) return;
    const resolved: DiffFile = { filename: conflict.filename, status: 'modified', additions: 0, deletions: 0, patch: conflict.resolved };
    setStagedFiles(prev => [...prev.filter(f => f.filename !== conflict.filename), resolved]);
    setConflict(null);
  }

  function savePatchDraft() {
    if (!selectedFile) return;
    const updated = { ...selectedFile, patch: patchDraft };
    setSelectedFile(updated);
    setDiff(prev => prev ? prev.map(f => f.filename === updated.filename ? updated : f) : prev);
    setStagedFiles(prev => prev.map(f => f.filename === updated.filename ? updated : f));
    setPatchMode('preview');
  }

  const statusTone = (s: string) => s === 'added' ? 'text-[var(--color-success)]' : s === 'removed' ? 'text-[var(--color-danger)]' : 'text-muted-foreground';
  const statusLabel = (s: string) => ({ added: 'A', removed: 'D', modified: 'M', renamed: 'R', copied: 'C' } as any)[s] || '?';
  const mainConflict = diff?.find(f => conflictCandidates.has(f.filename)) || null;
  const sameBranch = !!base && !!head && base === head;
  const patchLines = patchDraft.split('\n');
  const additions = diff?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const deletions = diff?.reduce((n, f) => n + f.deletions, 0) ?? 0;
  const mono = 'font-mono text-[11px]';
  const overlay = 'fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm';
  const gitCommands = [
    { label: 'Fetch', cmd: `git fetch origin` },
    { label: 'Pull', cmd: `git pull origin ${base}` },
    { label: 'Checkout head', cmd: `git checkout ${head}` },
    { label: 'Merge base into head', cmd: `git merge ${base}` },
    { label: 'Commit', cmd: `git commit -m "${mergeMsg || 'Merge ' + base + ' into ' + head}"` },
    { label: 'Push', cmd: `git push origin ${head}` },
  ];

  return (
    <Page>
      <PageHeader
        icon={GitCompareArrows}
        tone="insights"
        title="Code diff"
        description="Compare two branches: see what the compare branch changes, drag files to stage a merge preview, and check how the change shifts the architecture."
        actions={<>
          <Select value={base || undefined} onValueChange={setBase}>
            <SelectTrigger size="sm" aria-label="Base branch" className="h-8 w-52 bg-card text-xs *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:truncate"><GitBranch className="size-3.5" /><SelectValue placeholder="Base branch" /></SelectTrigger>
            <SelectContent>
              {branches.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
          <Select value={head || undefined} onValueChange={setHead}>
            <SelectTrigger size="sm" aria-label="Compare branch" className="h-8 w-52 bg-card text-xs *:data-[slot=select-value]:flex-1 *:data-[slot=select-value]:truncate"><GitBranch className="size-3.5" /><SelectValue placeholder="Compare branch" /></SelectTrigger>
            <SelectContent>
              {(branches.length > 1 ? branches.filter(b => b.name !== base) : branches).map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 text-xs" onClick={loadDiff} disabled={!base || !head || sameBranch || loading} title={sameBranch ? 'Pick two different branches to compare' : undefined}>{loading ? 'Comparing…' : 'Compare'}</Button>
        </>}
      >
        {(status || diff || sameBranch || conflictCandidates.size > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
            {sameBranch && <span className="text-[var(--color-warning)]">Pick two different branches to compare.</span>}
            {status && <span className={cn('rounded-full border bg-card px-2.5 py-0.5 font-semibold', status === 'diverged' ? 'text-[var(--color-warning)]' : 'text-foreground')}>{status}</span>}
            {diff && <span><strong className="font-semibold text-foreground">{diff.length}</strong> files changed · <span className="font-mono text-[var(--color-success)]">+{additions}</span> <span className="font-mono text-[var(--color-danger)]">−{deletions}</span></span>}
            {conflictCandidates.size > 0 && <span className="font-semibold text-[var(--color-danger)]">{conflictCandidates.size} possible conflict{conflictCandidates.size !== 1 ? 's' : ''}</span>}
          </div>
        )}
      </PageHeader>

      <ArchitectureImpact owner={owner} repo={repo} base={base} head={head} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_240px_minmax(0,1fr)]">
        {/* Left: changed files on head */}
        <Section title={`Changes on ${head || '—'}`} meta={diff ? `${diff.length} files · drag to stage` : undefined} className="min-h-[260px]" bodyClassName="p-0 flex flex-col">
          {mainConflict && (
            <div className="m-3 mb-0 flex items-center gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_7%,transparent)] px-3 py-2">
              <AlertTriangle className="size-4 shrink-0 text-[var(--color-danger)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-[var(--color-danger)]">Changed on both branches</span>
                <code className={cn(mono, 'block truncate')} title={mainConflict.filename}>{mainConflict.filename}</code>
              </span>
              <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => openConflictEditor(mainConflict)}>Resolve</Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading && <p className="p-4 text-center text-xs text-muted-foreground">Loading diff…</p>}
            {error && <StateCard icon={AlertTriangle} title="Couldn't compare these branches" action={<Button variant="outline" size="sm" className="h-8 text-xs" onClick={loadDiff}>Try again</Button>}>{error}</StateCard>}
            {!loading && !error && !diff && <StateCard icon={GitCompareArrows} title="Pick two branches">{branches.length < 2 ? 'This repository has a single branch, so there is nothing to compare yet.' : 'Choose a base and a compare branch above; the diff loads automatically.'}</StateCard>}
            {diff && diff.length === 0 && <StateCard icon={Check} title="No differences">{status === 'behind' ? `${head} is behind ${base}: it has nothing ${base} doesn't already have. Pick another compare branch.` : `${head} has no changes compared with ${base}.`}</StateCard>}
            {diff?.map(f => {
              const active = selectedFile?.filename === f.filename;
              return (
                <div
                  key={f.filename}
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  onDragStart={() => onDragStart(f)}
                  onClick={() => setSelectedFile(active ? null : f)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFile(active ? null : f); } }}
                  className={cn('flex cursor-grab items-center gap-2 rounded-md px-2.5 py-1.5 select-none hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}
                >
                  <span className={cn('w-4 text-center text-[11px] font-bold', statusTone(f.status))}>{statusLabel(f.status)}</span>
                  <code className={cn(mono, 'min-w-0 flex-1 truncate')} title={f.filename}>{f.filename}</code>
                  {conflictCandidates.has(f.filename) && <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-[var(--color-danger)]" onClick={e => { e.stopPropagation(); openConflictEditor(f); }}>conflict</Button>}
                  <span className={cn(mono, 'text-[var(--color-success)]')}>+{f.additions}</span>
                  <span className={cn(mono, 'text-[var(--color-danger)]')}>−{f.deletions}</span>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Center: staged drop zone */}
        <div className="flex min-h-[260px] min-w-0 flex-col gap-2">
          <section
            onDragOver={e => e.preventDefault()}
            onDrop={onDropToStage}
            aria-label="Staged files"
            className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border-2 border-dashed bg-[var(--surface-subtle)]', draggingFile && 'border-primary')}
          >
            <header className="flex min-h-11 items-center gap-2 border-b px-3"><Layers className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Staged</h2><span className="text-xs text-muted-foreground">{stagedFiles.length}</span></header>
            <div className="min-h-0 flex-1 overflow-y-auto p-2" onDragOver={e => e.preventDefault()} onDrop={onDropToUnstage}>
              {stagedFiles.length === 0 && <p className="mt-4 px-2 text-center text-xs leading-relaxed text-muted-foreground">Drag changed files here to stage them for a merge preview. Drag them back out to unstage.</p>}
              {stagedFiles.map(f => (
                <div key={f.filename} draggable onDragStart={() => onDragStart(f)} title={f.filename} className="mb-1 flex cursor-grab items-center gap-1.5 rounded-md border bg-card px-2 py-1">
                  <Check className="size-3 shrink-0 text-[var(--color-success)]" />
                  <span className={cn(mono, 'truncate')}>{f.filename.split('/').pop()}</span>
                </div>
              ))}
            </div>
          </section>
          <Input value={mergeMsg} onChange={e => setMergeMsg(e.target.value)} placeholder="Merge commit message" aria-label="Merge commit message" className="h-8 bg-card text-xs" />
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={stagedFiles.length === 0} onClick={() => alert('Merge is a read-only preview — push via your git client with the staged changes listed above.')}>
            <GitMerge className="size-3.5" /> Preview merge ({stagedFiles.length})
          </Button>
          <Button variant="ghost" size="sm" className="h-8 justify-start gap-1 text-xs" aria-expanded={showGitCmds} onClick={() => setShowGitCmds(g => !g)}>
            {showGitCmds ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Git commands
          </Button>
          {showGitCmds && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {gitCommands.map(({ label, cmd }) => (
                <li key={label} className="flex items-center gap-1.5">
                  <code className={cn(mono, 'min-w-0 flex-1 truncate rounded border bg-card px-1.5 py-0.5')} title={`${label}: ${cmd}`}>{cmd}</code>
                  <Button variant="ghost" size="icon-sm" aria-label={`Copy ${label} command`} onClick={() => { navigator.clipboard.writeText(cmd).catch(() => {}); setRunFeedback(label); setTimeout(() => setRunFeedback(null), 2000); }}>
                    {runFeedback === label ? <Check className="size-3.5 text-[var(--color-success)]" /> : <Copy className="size-3.5" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: base branch */}
        <Section title={`${base || '—'} (base)`} meta={diff ? 'What merging does here' : undefined} className="min-h-[260px]" bodyClassName="p-2">
          {!diff && <p className="p-4 text-center text-xs text-muted-foreground">The files the merge would touch on the base branch appear here.</p>}
          {diff?.map(f => (
            <div key={f.filename} className="flex items-center gap-2 rounded-md px-2.5 py-1.5">
              <code className={cn(mono, 'min-w-0 flex-1 truncate')} title={f.filename}>{f.filename}</code>
              {f.status === 'added' && <span className="shrink-0 text-[11px] text-muted-foreground">new on base</span>}
              {f.status === 'removed' && <span className="shrink-0 text-[11px] text-[var(--color-danger)]">will be deleted</span>}
              {f.status !== 'added' && f.status !== 'removed' && <span className="shrink-0 text-[11px] text-muted-foreground">{f.status}</span>}
            </div>
          ))}
        </Section>
      </div>

      {/* File diff popup */}
      {selectedFile?.patch && (
        <div className={overlay} onClick={() => setSelectedFile(null)}>
          <div role="dialog" aria-label={`Diff of ${selectedFile.filename}`} onClick={e => e.stopPropagation()} className="flex h-[min(680px,82%)] w-[min(980px,92%)] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <span className={cn('grid size-8 place-items-center rounded-lg border bg-[var(--surface-subtle)] text-xs font-bold', statusTone(selectedFile.status))}>{statusLabel(selectedFile.status)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[13px] font-semibold" title={selectedFile.filename}>{selectedFile.filename}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{base} → {head} · <span className="text-[var(--color-success)]">+{selectedFile.additions}</span> <span className="text-[var(--color-danger)]">−{selectedFile.deletions}</span></div>
              </div>
              <Button variant={patchMode === 'edit' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs" aria-pressed={patchMode === 'edit'} onClick={() => setPatchMode('edit')}>Edit</Button>
              <Button variant={patchMode === 'preview' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs" aria-pressed={patchMode === 'preview'} onClick={() => setPatchMode('preview')}>Preview</Button>
              <Button size="sm" className="h-7 text-xs" onClick={savePatchDraft}>Save</Button>
              <Button variant="ghost" size="icon-sm" aria-label="Close diff" onClick={() => setSelectedFile(null)}><X className="size-4" /></Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[var(--surface-subtle)] py-3">
              {patchMode === 'edit' ? (
                <Textarea value={patchDraft} onChange={e => setPatchDraft(e.target.value)} spellCheck={false} aria-label="Patch" className="h-full min-h-0 w-full resize-none rounded-none border-0 bg-transparent px-4 font-mono text-[11px] leading-relaxed whitespace-pre shadow-none focus-visible:ring-0" />
              ) : (
                <div className="min-w-[720px] font-mono text-[11px] leading-relaxed">
                  {(() => { const diffLang = detectLang(patchDraft); return patchLines.map((line, i) => {
                    const isAdd = line.startsWith('+') && !line.startsWith('+++');
                    const isDel = line.startsWith('-') && !line.startsWith('---');
                    const isMeta = line.startsWith('@') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++');
                    return (
                      <div key={i} className={cn('grid grid-cols-[58px_1fr] border-l-2 border-transparent',
                        isAdd && 'border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)]',
                        isDel && 'border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)]',
                        isMeta && 'bg-[var(--surface-hover)] text-muted-foreground')}>
                        <span className="px-2.5 text-right text-muted-foreground/60 select-none">{i + 1}</span>
                        <span className="pr-4 whitespace-pre" dangerouslySetInnerHTML={{ __html: highlightLine(line.replace(/^[+\- ]/, ''), isMeta ? '' : diffLang) || ' ' }} />
                      </div>
                    );
                  }); })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conflict resolution modal */}
      {conflict && (
        <div className={overlay}>
          <div role="dialog" aria-label={`Resolve conflict in ${conflict.filename}`} className="flex h-[80vh] w-[88vw] flex-col overflow-hidden rounded-2xl border bg-card shadow-xl">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <AlertTriangle className="size-4 text-[var(--color-danger)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Resolve conflict: <code className="font-mono">{conflict.filename}</code></span>
              <Button variant="ghost" size="icon-sm" aria-label="Close conflict editor" onClick={() => setConflict(null)}><X className="size-4" /></Button>
            </div>
            {(conflict.basePatch || conflict.headPatch) && (
              <div className="grid max-h-[150px] grid-cols-2 divide-x border-b">
                <pre className={cn(mono, 'm-0 overflow-auto p-2.5 whitespace-pre-wrap text-muted-foreground')}>{conflict.basePatch || 'No base-side patch available'}</pre>
                <pre className={cn(mono, 'm-0 overflow-auto p-2.5 whitespace-pre-wrap text-muted-foreground')}>{conflict.headPatch || 'No head-side patch available'}</pre>
              </div>
            )}
            <div className="grid min-h-0 flex-1 grid-cols-3 divide-x">
              {([
                ['Base', base, conflict.baseContent, true],
                ['Head', head, conflict.headContent, true],
                ['Resolved', 'edit below', conflict.resolved, false],
              ] as const).map(([label, sub, value, readOnly]) => (
                <div key={label} className="flex min-h-0 flex-col">
                  <div className="border-b bg-[var(--surface-subtle)] px-3 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{label} <span className="font-normal normal-case">({sub})</span></div>
                  <Textarea readOnly={readOnly} value={value} aria-label={`${label} content`} onChange={readOnly ? undefined : e => setConflict(c => c ? { ...c, resolved: e.target.value } : c)} className={cn(mono, 'min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0', readOnly && 'text-muted-foreground')} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t px-4 py-2.5">
              <Button variant="outline" size="sm" onClick={() => setConflict(null)}>Cancel</Button>
              <Button size="sm" className="gap-1.5" onClick={resolveConflict}><Check className="size-3.5" /> Accept resolution</Button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
