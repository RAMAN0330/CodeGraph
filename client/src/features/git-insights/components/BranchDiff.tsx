import { useState, useEffect, useCallback } from 'react';
import { GitHub } from '../../repository/services/github';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
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

export default function BranchDiff({ owner, repo, branches, currentBranch }: Props) {
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
      : branches[0].name);
  }, [branches, currentBranch]);

  useEffect(() => {
    if (!branches.length) return;
    const validNames = new Set(branches.map(b => b.name));
    setHead(prev => (prev && validNames.has(prev) && prev !== base) ? prev
      : branches.find(b => b.name !== base)?.name || '');
  }, [branches, base]);

  const loadDiff = useCallback(async () => {
    if (!base || !head || base === head) return;
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
      setError(e.message || 'Failed to compare branches');
    } finally {
      setLoading(false);
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

  const statusColor = (s: string) => s === 'added' ? 'var(--color-success)' : s === 'removed' ? 'var(--color-danger)' : s === 'renamed' ? 'var(--chart-purple)' : 'var(--teal-500)';
  const statusLabel = (s: string) => ({ added: 'A', removed: 'D', modified: 'M', renamed: 'R', copied: 'C' } as any)[s] || '?';
  const mainConflict = diff?.find(f => conflictCandidates.has(f.filename)) || null;

  const colStyle: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--border-subtle)', borderRadius: 10, background: 'var(--surface-card)' };
  const colHeader: React.CSSProperties = { padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--t2)', borderBottom: '1px solid var(--border-subtle)', letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--bg-canvas)' };
  const selectStyle: React.CSSProperties = { background: 'var(--bg0)', border: '1px solid var(--border-subtle)', color: 'var(--t0)', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', minWidth: 96 };
  const sameBranch = !!base && !!head && base === head;
  const patchLines = patchDraft.split('\n');

  return (
    <div className="gi-page" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--t0)', letterSpacing: '-0.3px' }}>Code Diff</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <Select value={base || undefined} onValueChange={setBase}>
            <SelectTrigger style={selectStyle}><SelectValue placeholder="Base branch" /></SelectTrigger>
            <SelectContent>
              {branches.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <span style={{ color: 'var(--t2)', fontSize: 12 }}>←→</span>
          <Select value={head || undefined} onValueChange={setHead}>
            <SelectTrigger style={selectStyle}><SelectValue placeholder="Compare branch" /></SelectTrigger>
            <SelectContent>
              {branches.length > 1 ? branches.filter(b => b.name !== base).map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>) : branches.map(b => <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" onClick={loadDiff} disabled={!base || !head || sameBranch || loading} title={sameBranch ? 'Pick two different branches to compare' : undefined} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: '1px solid color-mix(in srgb, var(--teal-500) 40%, transparent)', background: 'var(--accbg)', color: 'var(--teal-500)', cursor: 'pointer', opacity: (!base || !head || sameBranch || loading) ? 0.5 : 1 }}>Compare</Button>
          {sameBranch && <span style={{ fontSize: 10, color: 'var(--color-warning)' }}>Pick two different branches</span>}
        </div>
        {status && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: status === 'diverged' ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)' : 'var(--accbg)', color: status === 'diverged' ? 'var(--color-danger)' : 'var(--teal-500)', border: `1px solid ${status === 'diverged' ? 'color-mix(in srgb, var(--color-danger) 30%, transparent)' : 'color-mix(in srgb, var(--teal-500) 25%, transparent)'}` }}>{status}</span>}
        {conflictCandidates.size > 0 && <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', color: 'var(--color-danger)', border: '1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)' }}>{conflictCandidates.size} file conflict{conflictCandidates.size !== 1 ? 's' : ''}</span>}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
          {/* Left: changed files on head */}
          <div style={colStyle}>
            <div style={colHeader}>{head || '—'} changes ({diff?.length ?? 0} files) — drag to stage →</div>
            {mainConflict && (
              <div style={{ margin: 8, padding: '9px 10px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--color-danger) 28%, transparent)', background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}>
                <div style={{ color: 'var(--color-danger)', fontSize: 11, fontWeight: 800, marginBottom: 4 }}>Main conflict</div>
                <div style={{ color: 'var(--t0)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={mainConflict.filename}>{mainConflict.filename}</div>
                <Button variant="ghost" onClick={() => openConflictEditor(mainConflict)} style={{ marginTop: 8, width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid color-mix(in srgb, var(--color-danger) 32%, transparent)', background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Open conflict editor</Button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {loading && <div style={{ color: 'var(--t2)', fontSize: 12, padding: 12, textAlign: 'center' }}>Loading diff…</div>}
              {error && <div style={{ color: 'var(--color-danger)', fontSize: 12, padding: 12 }}>{error}</div>}
              {diff?.map(f => (
                <div
                  key={f.filename}
                  draggable
                  onDragStart={() => onDragStart(f)}
                  onClick={() => setSelectedFile(selectedFile?.filename === f.filename ? null : f)}
                  style={{ padding: '6px 10px', borderRadius: 6, marginBottom: 4, cursor: 'grab', background: selectedFile?.filename === f.filename ? 'var(--accbg)' : 'var(--bg-canvas)', border: `1px solid ${selectedFile?.filename === f.filename ? 'color-mix(in srgb, var(--teal-500) 30%, transparent)' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}
                >
                  <span style={{ width: 16, textAlign: 'center', fontWeight: 700, color: statusColor(f.status), fontSize: 10 }}>{statusLabel(f.status)}</span>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--t0)', fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</span>
                  {conflictCandidates.has(f.filename) && <Button variant="ghost" onClick={(e) => { e.stopPropagation(); openConflictEditor(f); }} style={{ fontSize: 10, color: 'var(--color-danger)', background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)', borderRadius: 4, padding: '2px 5px', cursor: 'pointer' }}>conflict</Button>}
                  <span style={{ fontSize: 10, color: 'var(--color-success)' }}>+{f.additions}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-danger)' }}>-{f.deletions}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Center: staged drop zone */}
          <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDropToStage}
              style={{ flex: 1, border: '2px dashed color-mix(in srgb, var(--teal-500) 35%, transparent)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--accbg)' }}
            >
              <div style={{ ...colHeader, background: 'transparent', borderBottom: '1px solid color-mix(in srgb, var(--teal-500) 18%, transparent)', color: 'var(--teal-500)' }}>Staged ({stagedFiles.length})</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}
                onDragOver={e => e.preventDefault()}
                onDrop={onDropToUnstage}
              >
                {stagedFiles.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 11, textAlign: 'center', marginTop: 20 }}>Drop files here to stage for merge</div>}
                {stagedFiles.map(f => (
                  <div key={f.filename} draggable onDragStart={() => onDragStart(f)}
                    style={{ padding: '5px 8px', borderRadius: 5, marginBottom: 3, background: 'var(--accbg2)', border: '1px solid color-mix(in srgb, var(--teal-500) 25%, transparent)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--teal-500)', cursor: 'grab', display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>✓</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename.split('/').pop()}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Input value={mergeMsg} onChange={e => setMergeMsg(e.target.value)} placeholder="Merge commit message…" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg0)', color: 'var(--t0)', fontSize: 11, fontFamily: 'inherit' }} />
              <Button
                disabled={stagedFiles.length === 0}
                onClick={() => alert('Merge is a read-only preview — push via your git client with the staged changes listed above.')}
                style={{ padding: '9px', borderRadius: 7, border: 'none', background: stagedFiles.length > 0 ? 'var(--teal-500)' : 'var(--bg-canvas)', color: stagedFiles.length > 0 ? 'var(--bg0)' : 'var(--text-muted)', cursor: stagedFiles.length > 0 ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}>
                ⎇ Preview Merge ({stagedFiles.length})
              </Button>
            </div>
            {/* Git Commands panel */}
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
              <Button
                variant="ghost"
                onClick={() => setShowGitCmds(g => !g)}
                style={{ background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--t2)', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: 'pointer', width: '100%' }}
              >
                {showGitCmds ? '▾' : '▸'} Git Commands
              </Button>
              {showGitCmds && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Fetch', cmd: `git fetch origin` },
                    { label: 'Pull', cmd: `git pull origin ${base}` },
                    { label: 'Checkout head', cmd: `git checkout ${head}` },
                    { label: 'Merge base into head', cmd: `git merge ${base}` },
                    { label: 'Commit', cmd: `git commit -m "${mergeMsg || 'Merge ' + base + ' into ' + head}"` },
                    { label: 'Push', cmd: `git push origin ${head}` },
                  ].map(({ label, cmd }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 90, flexShrink: 0 }}>{label}</span>
                      <code style={{ flex: 1, background: 'var(--bg0)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '3px 7px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--teal-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cmd}
                      </code>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(cmd).catch(() => {});
                          setRunFeedback(label);
                          setTimeout(() => setRunFeedback(null), 2000);
                        }}
                        style={{
                          background: runFeedback === label ? 'color-mix(in srgb, var(--color-success) 15%, transparent)' : 'var(--bg-canvas)',
                          border: '1px solid ' + (runFeedback === label ? 'color-mix(in srgb, var(--color-success) 40%, transparent)' : 'var(--border-subtle)'),
                          borderRadius: 4,
                          color: runFeedback === label ? 'var(--color-success)' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: 10,
                          padding: '2px 8px',
                          flexShrink: 0,
                          transition: 'all 0.2s',
                        }}
                        title="Copy to clipboard"
                      >
                        {runFeedback === label ? '✓ Copied' : 'Run'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: base branch */}
          <div style={colStyle}>
            <div style={colHeader}>{base} (base)</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, color: 'var(--text-primary)', fontSize: 11 }}>
              {diff?.map(f => (
                <div key={f.filename} style={{ padding: '6px 10px', borderRadius: 6, marginBottom: 4, background: 'var(--bg-canvas)', border: '1px solid var(--border-subtle)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.filename}</span>
                  {f.status === 'added' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>not on base</span>}
                  {f.status === 'removed' && <span style={{ fontSize: 10, color: 'var(--color-danger)' }}>will be deleted</span>}
                </div>
              ))}
              {!loading && !diff && <div style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-muted)' }}>Select branches and click Compare</div>}
            </div>
          </div>
        </div>

      {/* File diff popup */}
      {selectedFile?.patch && (
          <div
            onClick={() => setSelectedFile(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(3,7,18,0.72)', backdropFilter: 'blur(6px)' }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: 'min(980px, 92%)', height: 'min(680px, 82%)', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 14, border: '1px solid var(--border-subtle)', background: 'var(--surface-card)', boxShadow: 'var(--shadow-lg)' }}
            >
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border-subtle)', background: 'linear-gradient(180deg, var(--bg-canvas) 0%, var(--surface-card) 100%)' }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accbg)', border: '1px solid color-mix(in srgb, var(--teal-500) 25%, transparent)', color: 'var(--teal-500)', fontWeight: 800, fontSize: 12 }}>
                  {statusLabel(selectedFile.status)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ color: 'var(--t0)', fontSize: 13, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={selectedFile.filename}>
                    {selectedFile.filename}
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 11, marginTop: 3 }}>
                    {base} {'->'} {head}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  <span style={{ color: 'var(--color-success)', padding: '3px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-success) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-success) 20%, transparent)' }}>+{selectedFile.additions}</span>
                  <span style={{ color: 'var(--color-danger)', padding: '3px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 20%, transparent)' }}>-{selectedFile.deletions}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="ghost" onClick={() => setPatchMode('edit')} style={{ padding: '6px 10px', borderRadius: 7, border: patchMode === 'edit' ? '1px solid color-mix(in srgb, var(--teal-500) 40%, transparent)' : '1px solid var(--border-subtle)', background: patchMode === 'edit' ? 'var(--accbg)' : 'var(--bg-canvas)', color: patchMode === 'edit' ? 'var(--teal-500)' : 'var(--text-primary)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Edit</Button>
                  <Button variant="ghost" onClick={savePatchDraft} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid color-mix(in srgb, var(--teal-500) 35%, transparent)', background: 'var(--accbg)', color: 'var(--teal-500)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Save</Button>
                  <Button variant="ghost" onClick={() => setPatchMode('preview')} style={{ padding: '6px 10px', borderRadius: 7, border: patchMode === 'preview' ? '1px solid color-mix(in srgb, var(--teal-500) 40%, transparent)' : '1px solid var(--border-subtle)', background: patchMode === 'preview' ? 'var(--accbg)' : 'var(--bg-canvas)', color: patchMode === 'preview' ? 'var(--teal-500)' : 'var(--text-primary)', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Preview</Button>
                </div>
                <Button variant="ghost" onClick={() => setSelectedFile(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</Button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 0', background: 'var(--bg0)' }}>
                {patchMode === 'edit' ? (
                  <Textarea
                    value={patchDraft}
                    onChange={e => setPatchDraft(e.target.value)}
                    spellCheck={false}
                    style={{ width: '100%', height: '100%', minHeight: 0, boxSizing: 'border-box', resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-success)', padding: '4px 16px 16px', fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre', overflowWrap: 'normal', tabSize: 2 }}
                  />
                ) : (
                <div style={{ minWidth: 720, fontFamily: 'JetBrains Mono, Consolas, monospace', fontSize: 11, lineHeight: 1.55 }}>
                  {(() => { const diffLang = detectLang(patchDraft); return patchLines.map((line, i) => {
                    const isAdd = line.startsWith('+') && !line.startsWith('+++');
                    const isDel = line.startsWith('-') && !line.startsWith('---');
                    const isMeta = line.startsWith('@') || line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++');
                    return (
                      <div
                        key={i}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '58px 1fr',
                          color: isAdd ? 'var(--color-success)' : isDel ? 'var(--color-danger)' : isMeta ? 'var(--chart-purple)' : 'var(--text-primary)',
                          background: isAdd ? 'rgba(5,150,105,0.08)' : isDel ? 'rgba(220,38,38,0.075)' : isMeta ? 'rgba(124,63,168,0.08)' : 'transparent',
                          borderLeft: isAdd ? '2px solid rgba(5,150,105,0.55)' : isDel ? '2px solid rgba(220,38,38,0.5)' : isMeta ? '2px solid rgba(124,63,168,0.45)' : '2px solid transparent',
                        }}
                      >
                        <span style={{ color: 'rgba(148,163,184,0.45)', textAlign: 'right', padding: '0 10px', userSelect: 'none' }}>{i + 1}</span>
                        <span
                          style={{ whiteSpace: 'pre', paddingRight: 16 }}
                          dangerouslySetInnerHTML={{
                            __html: highlightLine(
                              line.replace(/^[+\- ]/, ''),
                              isMeta ? '' : diffLang
                            ) || ' '
                          }}
                        />
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
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div style={{ width: '88vw', height: '80vh', background: 'var(--bg0)', border: '2px solid rgba(220,38,38,0.5)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 32px 100px rgba(0,0,0,0.7)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(220,38,38,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>⚠ Conflict editor: {conflict.filename}</span>
                <Button variant="ghost" onClick={() => setConflict(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</Button>
              </div>
              {(conflict.basePatch || conflict.headPatch) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.07)', maxHeight: 150, overflow: 'hidden' }}>
                  <pre style={{ margin: 0, padding: 10, overflow: 'auto', color: 'var(--color-danger)', background: 'rgba(220,38,38,0.06)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>{conflict.basePatch || 'No base-side patch available'}</pre>
                  <pre style={{ margin: 0, padding: 10, overflow: 'auto', color: 'var(--chart-purple)', background: 'rgba(124,63,168,0.06)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap' }}>{conflict.headPatch || 'No head-side patch available'}</pre>
                </div>
              )}
              <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', background: 'rgba(220,38,38,0.05)' }}>BASE ({base})</div>
                  <Textarea readOnly value={conflict.baseContent} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: 10, resize: 'none', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--chart-purple)', background: 'rgba(124,63,168,0.05)' }}>HEAD ({head})</div>
                  <Textarea readOnly value={conflict.headContent} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--chart-purple)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: 10, resize: 'none', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--color-success)', background: 'rgba(5,150,105,0.05)' }}>RESOLVED (edit below)</div>
                  <Textarea value={conflict.resolved} onChange={e => setConflict(c => c ? { ...c, resolved: e.target.value } : c)} style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--color-success)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: 10, resize: 'none', outline: 'none' }} />
                </div>
              </div>
              <div style={{ padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="ghost" onClick={() => setConflict(null)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}>Cancel</Button>
                <Button onClick={resolveConflict} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-success)', color: 'var(--bg0)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✓ Accept Resolution</Button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
