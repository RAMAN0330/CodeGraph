import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import hljs from 'highlight.js/lib/core';
import sqlLanguage from 'highlight.js/lib/languages/sql';
import { cn } from '@/lib/utils';

hljs.registerLanguage('sql', sqlLanguage);

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onExplain: () => void;
  // Table and column names from the connected schema, for autocomplete.
  identifiers: string[];
}

const KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'ILIKE', 'COUNT(*)', 'DISTINCT', 'AS', 'WITH', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'BETWEEN', 'EXISTS', 'UNION', 'DESC', 'ASC'];

// A textarea over a highlighted <pre>: native editing, selection and undo,
// with SQL colouring and a completion list for the word under the caret.
export default function SqlEditor({ value, onChange, onRun, onExplain, identifiers }: SqlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const highlighted = useMemo(() => hljs.highlight(value + '\n', { language: 'sql' }).value, [value]);

  const word = useMemo(() => /[A-Za-z_][\w.]*$/.exec(value.slice(0, caret))?.[0] ?? '', [value, caret]);
  const suggestions = useMemo(() => {
    if (dismissed || word.length < 2) return [];
    const needle = word.toLowerCase();
    const pool = [...new Set([...identifiers, ...KEYWORDS])];
    return pool.filter(s => s.toLowerCase().startsWith(needle) && s.toLowerCase() !== needle).slice(0, 8);
  }, [word, identifiers, dismissed]);

  const accept = (suggestion: string) => {
    const before = value.slice(0, caret - word.length);
    const next = before + suggestion + value.slice(caret);
    onChange(next);
    const position = before.length + suggestion.length;
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onExplain(); else onRun();
      return;
    }
    if (suggestions.length) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => (i + 1) % suggestions.length); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (event.key === 'Tab' || event.key === 'Enter') { event.preventDefault(); accept(suggestions[Math.min(active, suggestions.length - 1)]); return; }
      if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); return; }
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      onChange(value.slice(0, start) + '  ' + value.slice(target.selectionEnd));
      requestAnimationFrame(() => target.setSelectionRange(start + 2, start + 2));
    }
  };

  const syncScroll = () => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const shared = 'm-0 h-full w-full overflow-auto whitespace-pre p-3 font-mono text-[12.5px] leading-5 [tab-size:2]';

  return (
    <div className="relative h-full min-h-0 rounded-md border bg-card focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
      <pre ref={preRef} aria-hidden className={cn(shared, 'pointer-events-none absolute inset-0 hljs !bg-transparent')} dangerouslySetInnerHTML={{ __html: highlighted }} />
      <textarea
        ref={textareaRef}
        value={value}
        spellCheck={false}
        aria-label="SQL statement"
        placeholder="SELECT * FROM …   (Ctrl/⌘ + Enter to run, Shift + Ctrl/⌘ + Enter to explain)"
        className={cn(shared, 'relative resize-none bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground selection:bg-primary/20')}
        onChange={event => { onChange(event.target.value); setCaret(event.target.selectionStart); setActive(0); setDismissed(false); }}
        onSelect={event => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        onBlur={() => setDismissed(true)}
      />
      {suggestions.length > 0 && (
        <ul role="listbox" aria-label="Suggestions" className="absolute right-2 bottom-2 z-20 max-h-56 w-64 overflow-auto rounded-md border bg-popover p-1 text-xs shadow-md">
          {suggestions.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              onMouseDown={event => { event.preventDefault(); accept(s); }}
              className={cn('cursor-pointer truncate rounded px-2 py-1 font-mono', i === active ? 'bg-accent text-accent-foreground' : 'text-foreground')}
            >
              {s}
            </li>
          ))}
          <li className="px-2 pt-1 text-[10px] text-muted-foreground">Tab to insert · Esc to close</li>
        </ul>
      )}
    </div>
  );
}
