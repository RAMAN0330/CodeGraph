// explorer.jsx — File graph explorer screen

const { useState: useState_E, useEffect: useEffect_E, useRef: useRef_E, useMemo: useMemo_E } = React;

const TREE = [
  { id: 'src',           parent: null,  kind: 'dir',  name: 'src/',            files: 124 },
  { id: 'src/api',       parent: 'src', kind: 'dir',  name: 'api/',            files: 47  },
  { id: 'src/web',       parent: 'src', kind: 'dir',  name: 'web/',            files: 38  },
  { id: 'src/db',        parent: 'src', kind: 'dir',  name: 'db/',             files: 12  },
  { id: 'src/shared',    parent: 'src', kind: 'dir',  name: 'shared/',         files: 27  },
  { id: 'auth.ts',       parent: 'src/api',    kind: 'ts',  name: 'auth.ts',    lines: 312, deps: 4, exports: 6 },
  { id: 'router.ts',     parent: 'src/api',    kind: 'ts',  name: 'router.ts',  lines: 198, deps: 3, exports: 2 },
  { id: 'middleware.ts', parent: 'src/api',    kind: 'ts',  name: 'middleware.ts', lines: 87, deps: 2, exports: 3 },
  { id: 'page.tsx',      parent: 'src/web',    kind: 'tsx', name: 'page.tsx',   lines: 445, deps: 8, exports: 1 },
  { id: 'Card.tsx',      parent: 'src/web',    kind: 'tsx', name: 'Card.tsx',   lines: 122, deps: 2, exports: 1 },
  { id: 'Layout.tsx',    parent: 'src/web',    kind: 'tsx', name: 'Layout.tsx', lines: 89,  deps: 3, exports: 1 },
  { id: 'schema.sql',    parent: 'src/db',     kind: 'sql', name: 'schema.sql', lines: 234, deps: 0, exports: 0 },
  { id: 'migrate.ts',    parent: 'src/db',     kind: 'ts',  name: 'migrate.ts', lines: 156, deps: 2, exports: 1 },
  { id: 'types.ts',      parent: 'src/shared', kind: 'ts',  name: 'types.ts',   lines: 78,  deps: 0, exports: 14 },
  { id: 'utils.ts',      parent: 'src/shared', kind: 'ts',  name: 'utils.ts',   lines: 203, deps: 1, exports: 9  },
];

const KIND_COLOR = { dir: 'var(--magenta)', ts: 'var(--info)', tsx: 'var(--accent)', sql: 'var(--cyan)', default: 'var(--fg-3)' };
const KIND_ICON  = {
  dir: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>,
  ts:  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>,
  tsx: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/></svg>,
  sql: <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/></svg>,
};

function TreeNode({ node, depth, selected, onSelect, expanded, onToggle }) {
  const isDir = node.kind === 'dir';
  const color = KIND_COLOR[node.kind] || KIND_COLOR.default;
  const icon  = KIND_ICON[node.kind] || KIND_ICON.ts;
  const isSelected = selected === node.id;

  return (
    <div
      onClick={() => { isDir ? onToggle(node.id) : onSelect(node); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', paddingLeft: 8 + depth * 14,
        borderRadius: 5, cursor: 'default',
        background: isSelected ? 'rgba(63,185,80,0.08)' : 'transparent',
        boxShadow: isSelected ? 'inset 0 0 0 1px rgba(63,185,80,0.25)' : 'none',
        fontFamily: 'var(--mono)', fontSize: 12,
        color: isSelected ? 'var(--accent)' : 'var(--fg-2)',
        transition: 'background .1s',
      }}>
      {isDir && (
        <span style={{ width: 10, color: 'var(--fg-4)', fontSize: 9 }}>
          {expanded ? '▾' : '▸'}
        </span>
      )}
      {!isDir && <span style={{ width: 10 }}/>}
      <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
      {isDir && <span style={{ color: 'var(--fg-4)', fontSize: 10 }}>{node.files}</span>}
    </div>
  );
}

function FileDetail({ node }) {
  if (!node) return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fg-4)', fontFamily: 'var(--mono)', fontSize: 13 }}>
      <div style={{ textAlign: 'center', lineHeight: 1.8 }}>
        <div style={{ fontSize: 24, color: 'var(--fg-4)', marginBottom: 8 }}>∅</div>
        select a file to inspect
      </div>
    </div>
  );

  const color = KIND_COLOR[node.kind] || KIND_COLOR.default;
  const stats = [
    ['lines',     node.lines],
    ['deps in',   node.deps],
    ['exports',   node.exports],
    ['kind',      '.' + node.kind],
  ];

  const mockImports = ['types.ts', 'utils.ts', 'auth.ts'].filter(n => n !== node.name).slice(0, node.deps);
  const mockExports = Array.from({ length: Math.min(node.exports, 5) }, (_, i) => ({
    name: ['default', 'handler', 'router', 'schema', 'migrate', 'validate', 'connect', 'parse', 'format', 'serialize'][i] || 'fn' + i,
    kind: i === 0 ? 'default' : 'named',
  }));

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          width: 40, height: 40, borderRadius: 8,
          display: 'grid', placeItems: 'center',
          background: color + '18', color, border: '1px solid ' + color + '44',
          fontSize: 18,
        }}>{KIND_ICON[node.kind] || KIND_ICON.ts}</span>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 500, color: 'var(--fg)' }}>{node.name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 3 }}>
            {node.parent} · last modified 2h ago
          </div>
        </div>
      </div>

      {/* stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{ padding: '12px 14px', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 600, color: 'var(--fg)' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* imports */}
      {mockImports.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>imports ({node.deps})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mockImports.map((imp, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'var(--mono)', fontSize: 12,
                padding: '6px 10px', borderRadius: 5,
                background: 'rgba(88,166,255,0.04)', border: '1px solid rgba(88,166,255,0.12)',
              }}>
                <span style={{ color: 'var(--fg-4)' }}>←</span>
                <span style={{ color: 'var(--info)' }}>{imp}</span>
              </div>
            ))}
            {node.deps > mockImports.length && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-4)', paddingLeft: 10 }}>
                +{node.deps - mockImports.length} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* exports */}
      {mockExports.length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>exports ({node.exports})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mockExports.map((ex, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'var(--mono)', fontSize: 12,
                padding: '6px 10px', borderRadius: 5,
                background: 'rgba(63,185,80,0.04)', border: '1px solid rgba(63,185,80,0.1)',
              }}>
                <span style={{ color: 'var(--fg-4)' }}>→</span>
                <span style={{ color: 'var(--accent)' }}>{ex.name}</span>
                <span style={{
                  marginLeft: 'auto', fontSize: 10, padding: '1px 6px', borderRadius: 999,
                  background: ex.kind === 'default' ? 'rgba(63,185,80,0.12)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid ' + (ex.kind === 'default' ? 'rgba(63,185,80,0.25)' : 'var(--line)'),
                  color: ex.kind === 'default' ? 'var(--accent)' : 'var(--fg-3)',
                }}>{ex.kind}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* risk badge */}
      <div style={{
        marginTop: 'auto',
        padding: '10px 14px', borderRadius: 8, fontSize: 12, lineHeight: 1.5,
        background: node.lines > 300 ? 'rgba(248,81,73,0.06)' : 'rgba(63,185,80,0.06)',
        border: '1px solid ' + (node.lines > 300 ? 'rgba(248,81,73,0.2)' : 'rgba(63,185,80,0.15)'),
        color: node.lines > 300 ? 'var(--danger)' : 'var(--accent)',
        fontFamily: 'var(--mono)',
      }}>
        {node.lines > 300
          ? `⚠ Large file (${node.lines} lines) — consider splitting`
          : `✓ Healthy — ${node.lines} lines, well scoped`}
      </div>
    </div>
  );
}

function Explorer({ onNavigate }) {
  const [expanded, setExpanded] = useState_E({ src: true, 'src/api': true, 'src/web': false, 'src/db': false, 'src/shared': false });
  const [selected, setSelected] = useState_E(null);
  const [q, setQ] = useState_E('');

  const roots = TREE.filter(n => n.parent === null);
  const childrenOf = (id) => TREE.filter(n => n.parent === id);

  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const filtered = useMemo_E(() => {
    if (!q) return null;
    return TREE.filter(n => n.kind !== 'dir' && n.name.toLowerCase().includes(q.toLowerCase()));
  }, [q]);

  function renderTree(nodes, depth = 0) {
    return nodes.map(node => (
      <React.Fragment key={node.id}>
        <TreeNode
          node={node} depth={depth}
          selected={selected?.id}
          onSelect={setSelected}
          expanded={expanded[node.id]}
          onToggle={toggleExpand}
        />
        {node.kind === 'dir' && expanded[node.id] && renderTree(childrenOf(node.id), depth + 1)}
      </React.Fragment>
    ));
  }

  return (
    <div data-screen-label="04 Explorer" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="gg-grid-bg"/>
      <GGNav variant="app" current="explorer"/>

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: 0 }}>

        {/* LEFT: file tree */}
        <div style={{ borderRight: '1px solid var(--line)', background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* search */}
          <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--line)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-1)', border: '1px solid var(--line-strong)',
              borderRadius: 7, padding: '7px 10px',
            }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--fg-4)"><path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/></svg>
              <input
                value={q} onChange={e => setQ(e.target.value)}
                placeholder="search files…"
                style={{ flex: 1, background: 'transparent', border: 0, outline: 0, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg)' }}
              />
            </div>
          </div>

          {/* tree / results */}
          <div className="gg-scroll" style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
            {filtered ? (
              filtered.length === 0
                ? <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-4)' }}>no matches</div>
                : filtered.map(node => (
                    <TreeNode key={node.id} node={node} depth={0}
                      selected={selected?.id} onSelect={setSelected}
                      expanded={false} onToggle={() => {}}/>
                  ))
            ) : renderTree(roots)}
          </div>

          {/* status bar */}
          <div style={{
            padding: '8px 12px', borderTop: '1px solid var(--line)',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-4)',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{TREE.filter(n => n.kind !== 'dir').length} files</span>
            <span>codeflow/src</span>
          </div>
        </div>

        {/* RIGHT: file detail */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(255,255,255,0.008)' }}>
          {/* breadcrumb */}
          <div style={{
            padding: '12px 28px', borderBottom: '1px solid var(--line)',
            fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-3)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ cursor: 'default', color: 'var(--fg-2)' }} onClick={() => onNavigate?.('repo')}>← workspace</span>
            <span style={{ opacity: 0.5 }}>›</span>
            <span>explorer</span>
            {selected && <>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: 'var(--fg)' }}>{selected.name}</span>
            </>}
          </div>
          <FileDetail node={selected}/>
        </div>
      </div>
    </div>
  );
}

window.Explorer = Explorer;
