// client/src/components/BookmarkDropdown.tsx
import { useState, useEffect, useRef } from 'react';
import { getBookmarks, togglePin, removeBookmark } from '../services/bookmarks';
import type { Bookmark } from '../services/bookmarks';

interface Props {
  onSelect: (url: string) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function BookmarkDropdown({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<{ key: string } & Bookmark>>([]);
  const ref = useRef<HTMLDivElement>(null);

  function refresh() {
    setItems(getBookmarks());
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const LANG_COLORS: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f7df1e', Python: '#3572A5',
    Go: '#00ADD8', Java: '#b07219', default: 'var(--text-muted)',
  };

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Recent repos"
        style={{
          background: open ? 'var(--surface-subtle)' : 'transparent',
          border: '1px solid ' + (open ? 'var(--border-subtle)' : 'transparent'),
          borderRadius: '6px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '36px',
          right: 0,
          width: '320px',
          background: 'rgba(22,27,34,0.98)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 2000,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px 6px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, borderBottom: '1px solid var(--surface-subtle)' }}>
            Recent Repos
          </div>
          {items.length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
              No repos analyzed yet
            </div>
          )}
          {items.map(item => {
            const lang = item.stats.language || 'Unknown';
            const langColor = LANG_COLORS[lang] || LANG_COLORS.default;
            return (
              <div
                key={item.key}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--surface-subtle)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-card)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                onClick={() => { onSelect(item.url); setOpen(false); }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.key}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: langColor, flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{lang}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{item.stats.files} files</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{timeAgo(item.lastAnalyzed)}</span>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); togglePin(item.key); refresh(); }}
                  title={item.pinned ? 'Unpin' : 'Pin'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: item.pinned ? '#f0c040' : 'var(--text-muted)', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}
                >
                  {item.pinned ? '★' : '☆'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); removeBookmark(item.key); refresh(); }}
                  title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: '2px 4px', flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
