// client/src/components/CommandPalette.tsx
import { useState, useEffect, useRef, useCallback } from 'react';

interface FileItem { path: string; name: string; folder: string; ext?: string; }
interface FnItem { name: string; file: string; line?: number; }

interface Props {
  files: FileItem[];
  functions: FnItem[];
  folders: string[];
  onSelectFile: (file: FileItem) => void;
  onSelectFunction: (fn: FnItem) => void;
  onSelectFolder: (folder: string) => void;
  onClose: () => void;
}

function fuzzy(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

type ResultItem =
  | { kind: 'file'; data: FileItem }
  | { kind: 'fn'; data: FnItem }
  | { kind: 'folder'; data: string };

export default function CommandPalette({ files, functions, folders, onSelectFile, onSelectFunction, onSelectFolder, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results: ResultItem[] = (() => {
    if (!query.trim()) return [];
    const q = query.trim();
    const out: ResultItem[] = [];
    for (const f of files) {
      if (fuzzy(q, f.path) || fuzzy(q, f.name)) out.push({ kind: 'file', data: f });
      if (out.filter(r => r.kind === 'file').length >= 5) break;
    }
    for (const fn of functions) {
      if (fuzzy(q, fn.name) || fuzzy(q, fn.file)) out.push({ kind: 'fn', data: fn });
      if (out.filter(r => r.kind === 'fn').length >= 5) break;
    }
    for (const folder of folders) {
      if (fuzzy(q, folder)) out.push({ kind: 'folder', data: folder });
      if (out.filter(r => r.kind === 'folder').length >= 3) break;
    }
    return out.slice(0, 10);
  })();

  const select = useCallback((item: ResultItem) => {
    if (item.kind === 'file') onSelectFile(item.data);
    else if (item.kind === 'fn') onSelectFunction(item.data);
    else onSelectFolder(item.data);
    onClose();
  }, [onSelectFile, onSelectFunction, onSelectFolder, onClose]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) select(results[cursor]);
  }

  useEffect(() => { setCursor(0); }, [query]);

  const KIND_ICON: Record<string, string> = { file: '📄', fn: 'ƒ', folder: '📁' };
  const KIND_LABEL: Record<string, string> = { file: 'File', fn: 'Function', folder: 'Folder' };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '480px', background: 'rgba(22,27,34,0.98)', border: '1px solid var(--border-subtle)', borderRadius: '12px', boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--surface-subtle)', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search files, functions, folders…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.9rem', fontFamily: 'inherit' }}
          />
          <kbd style={{ color: 'var(--text-muted)', fontSize: '0.72rem', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 5px' }}>ESC</kbd>
        </div>
        <div ref={listRef} style={{ maxHeight: '360px', overflowY: 'auto' }}>
          {!query.trim() && (
            <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
              Type to search files, functions, and folders
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
              No results for "{query}"
            </div>
          )}
          {results.map((item, i) => {
            const active = i === cursor;
            const label = item.kind === 'file' ? item.data.path
              : item.kind === 'fn' ? item.data.name
              : item.data;
            const sub = item.kind === 'fn' ? item.data.file : undefined;
            return (
              <div
                key={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => select(item)}
                style={{
                  padding: '9px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  background: active ? 'var(--surface-subtle)' : 'transparent',
                  borderBottom: '1px solid var(--surface-card)',
                }}
              >
                <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{KIND_ICON[item.kind]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                  {sub && <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', flexShrink: 0 }}>{KIND_LABEL[item.kind]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
