// client/src/components/CommandPalette.tsx
import { useCallback, useState } from 'react';
import { Search, FileCode2, Braces, Folder } from 'lucide-react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

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

const KIND_LABEL: Record<ResultItem['kind'], string> = { file: 'File', fn: 'Function', folder: 'Folder' };

function KindIcon({ kind }: { kind: ResultItem['kind'] }) {
  if (kind === 'fn') return <Braces size={16} strokeWidth={1.8} />;
  if (kind === 'folder') return <Folder size={16} strokeWidth={1.8} />;
  return <FileCode2 size={16} strokeWidth={1.8} />;
}

export default function CommandPalette({ files, functions, folders, onSelectFile, onSelectFunction, onSelectFolder, onClose }: Props) {
  const [query, setQuery] = useState('');

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
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="cmdk-spotlight-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Command shouldFilter={false} className="cmdk-spotlight h-auto">
        <div className="cmdk-spotlight-input-row">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            onKeyDown={handleKey}
            placeholder="Search files, functions, folders…"
          />
          <kbd className="cmdk-spotlight-esc">ESC</kbd>
        </div>
        <CommandList className="cmdk-spotlight-list">
          <CommandEmpty className="cmdk-spotlight-empty">
            <Search size={22} strokeWidth={1.6} />
            <span>{query.trim() ? `No results for "${query}"` : 'Type to search files, functions, and folders'}</span>
          </CommandEmpty>
          {results.map((item, i) => {
            const label = item.kind === 'file' ? item.data.path
              : item.kind === 'fn' ? item.data.name
              : item.data;
            const sub = item.kind === 'fn' ? item.data.file : undefined;
            return (
              <CommandItem key={i} value={`${item.kind}-${i}`} onSelect={() => select(item)} className="cmdk-spotlight-item">
                <span className={`cmdk-spotlight-item-icon${item.kind === 'fn' ? ' is-fn' : item.kind === 'folder' ? ' is-folder' : ''}`}><KindIcon kind={item.kind} /></span>
                <div className="cmdk-spotlight-item-copy">
                  <div className="cmdk-spotlight-item-label">{label}</div>
                  {sub && <div className="cmdk-spotlight-item-sub">{sub}</div>}
                </div>
                <span className="cmdk-spotlight-item-kind">{KIND_LABEL[item.kind]}</span>
              </CommandItem>
            );
          })}
        </CommandList>
        <div className="cmdk-spotlight-footer">
          <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> Navigate</span>
          <span><kbd>&crarr;</kbd> Open</span>
          <span><kbd>esc</kbd> Close</span>
        </div>
      </Command>
    </div>
  );
}
