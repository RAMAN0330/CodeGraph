import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { ArrowRight, Braces, Clock3, CornerDownLeft, FileCode2, Folder, LayoutGrid, Search, X } from 'lucide-react';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Command as CommandPrimitive } from 'cmdk';
import {
  basename, parseQuery, searchPalette,
  type PaletteFile, type PaletteFunction, type PaletteGroup, type PaletteItem, type PaletteScope, type PaletteSection,
} from '../services/paletteSearch';
import './CommandPalette.css';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', go: 'go', java: 'java', css: 'css', scss: 'css', html: 'xml', xml: 'xml', vue: 'xml', svelte: 'xml',
};

interface Props {
  files: PaletteFile[];
  functions: PaletteFunction[];
  folders: string[];
  sections?: PaletteSection[];
  /** Namespaces the recent-items history, e.g. the repository full name. */
  scopeKey?: string;
  onSelectFile: (file: PaletteFile) => void;
  onSelectFunction: (fn: PaletteFunction) => void;
  onSelectFolder: (folder: string) => void;
  onSelectSection?: (sectionId: string) => void;
  onClose: () => void;
}

const SCOPES: Array<{ id: PaletteScope; label: string; prefix?: string }> = [
  { id: 'all', label: 'All' },
  { id: 'files', label: 'Files', prefix: '#' },
  { id: 'symbols', label: 'Symbols', prefix: '@' },
  { id: 'folders', label: 'Folders', prefix: '/' },
  { id: 'sections', label: 'Go to', prefix: '>' },
];

const PLACEHOLDER: Record<PaletteScope, string> = {
  all: 'Search files, symbols, folders and views',
  files: 'Search files by name or path',
  symbols: 'Search functions and methods',
  folders: 'Search folders',
  sections: 'Jump to a workspace view',
};

const RECENT_LIMIT = 6;

function readRecent(storageKey: string): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeRecent(storageKey: string, key: string) {
  try {
    const next = [key, ...readRecent(storageKey).filter(value => value !== key)].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch { /* storage unavailable: history is a convenience only */ }
}

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (!indices.length) return <>{text}</>;
  const hits = new Set(indices);
  const parts: Array<{ text: string; hit: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += text[i];
    else parts.push({ text: text[i], hit });
  }
  return <>{parts.map((part, index) => part.hit ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</>;
}

function KindIcon({ kind }: { kind: PaletteItem['kind'] }) {
  if (kind === 'fn') return <Braces size={15} strokeWidth={1.9} />;
  if (kind === 'folder') return <Folder size={15} strokeWidth={1.9} />;
  if (kind === 'section') return <LayoutGrid size={15} strokeWidth={1.9} />;
  return <FileCode2 size={15} strokeWidth={1.9} />;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

// At most 18 lines, so highlighting on render is cheap.
function highlightSource(source: string, language: string | undefined): string {
  if (!language) return escapeHtml(source);
  try { return hljs.highlight(source, { language, ignoreIllegals: true }).value; } catch { return escapeHtml(source); }
}

function CodePreview({ code, path, startLine = 1 }: { code: string; path: string; startLine?: number }) {
  const source = code.replace(/\t/g, '  ').split('\n').slice(0, 18).join('\n');
  const lines = source.split('\n');
  const language = LANGUAGE_BY_EXT[path.split('.').pop()?.toLowerCase() ?? ''];
  const html = highlightSource(source, language);
  return (
    <div className="spotlight-code" aria-label="Source preview">
      <div className="spotlight-code-gutter" aria-hidden="true">{lines.map((_, index) => <span key={index}>{startLine + index}</span>)}</div>
      <pre><code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  );
}

function Preview({ item, files }: { item: PaletteItem | undefined; files: PaletteFile[] }) {
  if (!item) {
    return (
      <div className="spotlight-preview-empty">
        <Search size={20} strokeWidth={1.6} aria-hidden="true" />
        <p>Select a result to preview it here.</p>
      </div>
    );
  }
  if (item.kind === 'file') {
    const file = item.data;
    const fnCount = Array.isArray(file.functions) ? file.functions.length : undefined;
    return (
      <>
        <header className="spotlight-preview-head">
          <span className="spotlight-icon is-file"><KindIcon kind="file" /></span>
          <div><strong>{item.label}</strong><small>{file.folder || 'repository root'}</small></div>
        </header>
        <dl className="spotlight-facts">
          {typeof file.lines === 'number' && <div><dt>Lines</dt><dd>{file.lines.toLocaleString()}</dd></div>}
          {fnCount !== undefined && <div><dt>Functions</dt><dd>{fnCount}</dd></div>}
          <div><dt>Type</dt><dd>.{file.path.split('.').pop()}</dd></div>
        </dl>
        {file.content ? <CodePreview code={file.content} path={file.path} /> : <p className="spotlight-preview-note">Source isn’t cached for this file. Open it to load the contents.</p>}
      </>
    );
  }
  if (item.kind === 'fn') {
    const fn = item.data;
    return (
      <>
        <header className="spotlight-preview-head">
          <span className="spotlight-icon is-fn"><KindIcon kind="fn" /></span>
          <div><strong>{fn.name}</strong><small>{basename(fn.file)}{fn.line ? ` · line ${fn.line}` : ''}</small></div>
        </header>
        <div className="spotlight-tags">
          {fn.type && <span>{fn.type}</span>}
          {fn.isExported && <span className="is-accent">exported</span>}
        </div>
        {fn.code ? <CodePreview code={fn.code} path={fn.file} startLine={fn.line || 1} /> : <p className="spotlight-preview-note">No source captured for this symbol.</p>}
      </>
    );
  }
  if (item.kind === 'folder') {
    const inside = files.filter(file => file.folder === item.data || file.path.startsWith(`${item.data}/`));
    const lines = inside.reduce((sum, file) => sum + (file.lines || 0), 0);
    const largest = [...inside].sort((a, b) => (b.lines || 0) - (a.lines || 0)).slice(0, 6);
    return (
      <>
        <header className="spotlight-preview-head">
          <span className="spotlight-icon is-folder"><KindIcon kind="folder" /></span>
          <div><strong>{basename(item.data)}</strong><small>{item.data}</small></div>
        </header>
        <dl className="spotlight-facts">
          <div><dt>Files</dt><dd>{inside.length}</dd></div>
          <div><dt>Lines</dt><dd>{lines.toLocaleString()}</dd></div>
        </dl>
        {largest.length > 0 && (
          <div className="spotlight-file-list">
            <h3>Largest files</h3>
            <ul>{largest.map(file => <li key={file.path}><span>{file.name || basename(file.path)}</span><small>{(file.lines || 0).toLocaleString()} lines</small></li>)}</ul>
          </div>
        )}
        <p className="spotlight-preview-note">Opening a folder filters the code graph to it.</p>
      </>
    );
  }
  return (
    <>
      <header className="spotlight-preview-head">
        <span className="spotlight-icon is-section"><KindIcon kind="section" /></span>
        <div><strong>{item.data.label}</strong><small>{item.data.group}</small></div>
      </header>
      <p className="spotlight-preview-copy">{item.data.description}</p>
    </>
  );
}

export default function CommandPalette({
  files, functions, folders, sections = [], scopeKey = 'workspace',
  onSelectFile, onSelectFunction, onSelectFolder, onSelectSection, onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<PaletteScope>('all');
  const [selected, setSelected] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInput = () => inputRef.current?.focus();
  const deferredQuery = useDeferredValue(query);
  const storageKey = `structrace:palette-recent:${scopeKey.toLowerCase()}`;
  const [recentKeys] = useState(() => readRecent(storageKey));

  const source = useMemo(() => ({ files, functions, folders, sections }), [files, functions, folders, sections]);
  const effectiveScope = parseQuery(query, scope).scope;
  const searching = parseQuery(deferredQuery, scope).text.length > 0;

  const groups: PaletteGroup[] = useMemo(() => {
    if (searching) return searchPalette(deferredQuery, scope, source);
    // Zero-query state: what you opened recently, then every workspace view.
    const lookup = new Map<string, PaletteItem>();
    for (const file of files) lookup.set(`file:${file.path}`, { kind: 'file', key: `file:${file.path}`, data: file, label: file.name || basename(file.path), detail: file.path, match: [] });
    for (const folder of folders) lookup.set(`folder:${folder}`, { kind: 'folder', key: `folder:${folder}`, data: folder, label: folder, detail: '', match: [] });
    for (const fn of functions) {
      const key = `fn:${fn.file}:${fn.name}:${fn.line ?? ''}`;
      if (recentKeys.includes(key)) lookup.set(key, { kind: 'fn', key, data: fn, label: fn.name, detail: `${fn.file}${fn.line ? `:${fn.line}` : ''}`, match: [] });
    }
    const sectionItems: PaletteItem[] = sections.map(section => ({ kind: 'section', key: `section:${section.id}`, data: section, label: section.label, detail: section.group, match: [] }));
    sectionItems.forEach(item => lookup.set(item.key, item));
    const recent = recentKeys.map(key => lookup.get(key)).filter((item): item is PaletteItem => !!item);
    const wanted = (item: PaletteItem) => effectiveScope === 'all'
      || (effectiveScope === 'files' && item.kind === 'file') || (effectiveScope === 'symbols' && item.kind === 'fn')
      || (effectiveScope === 'folders' && item.kind === 'folder') || (effectiveScope === 'sections' && item.kind === 'section');
    const out: PaletteGroup[] = [];
    const recentShown = recent.filter(wanted);
    if (recentShown.length) out.push({ id: 'file', heading: 'Recent', items: recentShown.map(item => ({ ...item, key: `recent|${item.key}` })), total: recentShown.length });
    if (effectiveScope === 'all' || effectiveScope === 'sections') out.push({ id: 'section', heading: 'Go to', items: sectionItems, total: sectionItems.length });
    if (effectiveScope === 'folders') {
      const folderItems = folders.slice(0, 40).map(folder => lookup.get(`folder:${folder}`)!).filter(Boolean);
      out.push({ id: 'folder', heading: 'Folders', items: folderItems, total: folders.length });
    }
    return out;
  }, [searching, deferredQuery, scope, source, files, folders, functions, sections, recentKeys, effectiveScope]);

  const itemsByValue = useMemo(() => {
    const map = new Map<string, PaletteItem>();
    groups.forEach(group => group.items.forEach(item => map.set(item.key, item)));
    return map;
  }, [groups]);

  // Keep a valid selection (and therefore a preview) as results change.
  const activeValue = itemsByValue.has(selected) ? selected : (groups[0]?.items[0]?.key ?? '');

  const choose = useCallback((item: PaletteItem) => {
    const baseKey = item.key.startsWith('recent|') ? item.key.slice('recent|'.length) : item.key;
    writeRecent(storageKey, baseKey);
    if (item.kind === 'file') onSelectFile(item.data);
    else if (item.kind === 'fn') onSelectFunction(item.data);
    else if (item.kind === 'folder') onSelectFolder(item.data);
    else onSelectSection?.(item.data.id);
    onClose();
  }, [storageKey, onSelectFile, onSelectFunction, onSelectFolder, onSelectSection, onClose]);

  const cycleScope = (direction: 1 | -1) => {
    const index = SCOPES.findIndex(entry => entry.id === scope);
    setScope(SCOPES[(index + direction + SCOPES.length) % SCOPES.length].id);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Tab') { event.preventDefault(); cycleScope(event.shiftKey ? -1 : 1); return; }
    // Backspace on an empty field clears a narrowed scope, like removing a token.
    if (event.key === 'Backspace' && !query && scope !== 'all') { event.preventDefault(); setScope('all'); }
  };

  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const shown = groups.reduce((sum, group) => sum + group.items.length, 0);
  const activeItem = itemsByValue.get(activeValue);

  return (
    <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="spotlight-overlay" />
        <DialogPrimitive.Content className="spotlight" aria-describedby={undefined} onOpenAutoFocus={event => { event.preventDefault(); focusInput(); }}>
          <DialogPrimitive.Title className="sr-only">Search the workspace</DialogPrimitive.Title>
          <Command shouldFilter={false} loop value={activeValue} onValueChange={setSelected} className="spotlight-command" label="Workspace search">
            <div className="spotlight-search">
              <Search className="spotlight-search-icon" size={20} strokeWidth={2} aria-hidden="true" />
              {scope !== 'all' && <span className="spotlight-scope-token">{SCOPES.find(entry => entry.id === scope)?.label}</span>}
              <CommandPrimitive.Input
                ref={inputRef}
                aria-label="Search the workspace"
                value={query}
                onValueChange={setQuery}
                onKeyDown={onInputKeyDown}
                placeholder={PLACEHOLDER[effectiveScope]}
                className="spotlight-input"
                autoComplete="off" spellCheck={false}
              />
              {query
                ? <button type="button" className="spotlight-clear" onClick={() => { setQuery(''); focusInput(); }} aria-label="Clear search"><X size={14} /></button>
                : <DialogPrimitive.Close className="spotlight-esc" aria-label="Close search">esc</DialogPrimitive.Close>}
            </div>

            <div className="spotlight-scopes" role="radiogroup" aria-label="Search scope">
              {SCOPES.map(entry => (
                <button
                  key={entry.id} type="button" role="radio" aria-checked={effectiveScope === entry.id}
                  className={effectiveScope === entry.id ? 'is-active' : undefined}
                  onClick={() => { setScope(entry.id); if (entry.prefix && query.trimStart().startsWith(entry.prefix)) setQuery(query.trimStart().slice(1)); focusInput(); }}
                >
                  {entry.label}{entry.prefix && <kbd>{entry.prefix}</kbd>}
                </button>
              ))}
              {searching && <span className="spotlight-count" aria-live="polite">{total > shown ? `${shown} of ${total.toLocaleString()}` : `${total.toLocaleString()} result${total === 1 ? '' : 's'}`}</span>}
            </div>

            <div className="spotlight-body">
              <CommandList className="spotlight-list">
                <CommandEmpty className="spotlight-empty">
                  <strong>No matches for “{parseQuery(query, scope).text}”</strong>
                  <span>{effectiveScope !== 'all' ? 'Try searching everything instead.' : 'Check the spelling, or try part of a path or symbol name.'}</span>
                  {effectiveScope !== 'all' && <button type="button" onClick={() => { setScope('all'); setQuery(parseQuery(query, scope).text); }}>Search all <ArrowRight size={13} /></button>}
                </CommandEmpty>
                {groups.map(group => (
                  <CommandGroup key={group.heading} heading={group.heading} className="spotlight-group">
                    {group.items.map(item => (
                      <CommandItem key={item.key} value={item.key} onSelect={() => choose(item)} className="spotlight-item">
                        <span className={`spotlight-icon is-${item.kind === 'fn' ? 'fn' : item.kind}`}>{group.heading === 'Recent' ? <Clock3 size={15} strokeWidth={1.9} /> : <KindIcon kind={item.kind} />}</span>
                        <span className="spotlight-item-copy">
                          <span className="spotlight-item-label"><Highlight text={item.label} indices={item.match} /></span>
                          {item.detail && item.detail !== item.label && <span className="spotlight-item-detail">{item.detail}</span>}
                        </span>
                        <span className="spotlight-item-enter" aria-hidden="true"><CornerDownLeft size={13} /></span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
              <aside className="spotlight-preview" aria-label="Preview">
                <Preview item={activeItem} files={files} />
              </aside>
            </div>

            <footer className="spotlight-footer">
              <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
              <span><kbd>↵</kbd> Open</span>
              <span><kbd>tab</kbd> Scope</span>
              <span className="spotlight-footer-end"><kbd>esc</kbd> Close</span>
            </footer>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
