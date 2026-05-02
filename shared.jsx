// shared.jsx — shared brand components

const { useState, useEffect, useRef, useMemo } = React;

function GGLogo({ size = 28 }) {
  return (
    <span className="gg-brand-mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M11.75 2.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm2.25.75a2.25 2.25 0 1 0-3 2.122V6A2.5 2.5 0 0 1 8.5 8.5h-3A4.49 4.49 0 0 0 4 8.78V5.367a2.25 2.25 0 1 0-1.5 0v5.266a2.25 2.25 0 1 0 1.508.018A2.99 2.99 0 0 1 5.5 10h3A4 4 0 0 0 12.5 6v-.628A2.251 2.251 0 0 0 14 3.25ZM2.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0Zm.75 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/>
      </svg>
    </span>
  );
}

function GGNav({ variant = "marketing", onNavigate, current }) {
  if (variant === "app") {
    return (
      <nav className="gg-nav">
        <div style={{display:'flex', alignItems:'center', gap:18}}>
          <div className="gg-brand">
            <GGLogo />
            <span className="gg-brand-name">gitgraph<span className="ver">/0.4.2</span></span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8, color:'var(--fg-3)', fontFamily:'var(--mono)', fontSize:12}}>
            <span style={{opacity:0.5}}>›</span>
            <span style={{color:'var(--fg-2)'}}>workspace</span>
            <span style={{opacity:0.5}}>›</span>
            <span style={{color:'var(--fg)'}}>{current || 'select-repo'}</span>
          </div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <span style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)'}}>
            <span className="gg-kbd">⌘</span> <span className="gg-kbd">K</span>
          </span>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div className="gg-avatar">RA</div>
            <span style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-2)'}}>raman1530</span>
          </div>
        </div>
      </nav>
    );
  }
  return (
    <nav className="gg-nav">
      <div className="gg-brand">
        <GGLogo />
        <span className="gg-brand-name">gitgraph<span className="ver">/0.4.2</span></span>
      </div>
      <div className="gg-nav-right">
        <a onClick={() => onNavigate?.('landing')} style={{cursor:'pointer'}}>features</a>
        <a href="#docs">docs</a>
        <a href="#changelog">changelog</a>
        <a href="#security">security</a>
        <button className="gg-btn gg-btn-ghost gg-btn-sm" onClick={() => onNavigate?.('repo')}>
          <span style={{color:'var(--fg-3)'}}>→</span> launch app
        </button>
        <button className="gg-btn gg-btn-primary gg-btn-sm">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
          sign in
        </button>
      </div>
    </nav>
  );
}

// Animated graph visualization for hero
function GraphViz({ width = 540, height = 360 }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  // node positions
  const nodes = [
    { id: 'app',     x: 270, y:  50, label: 'app/',         kind: 'root',   files: 124 },
    { id: 'api',     x: 110, y: 140, label: 'api/',         kind: 'folder', files: 47  },
    { id: 'web',     x: 270, y: 140, label: 'web/',         kind: 'folder', files: 38  },
    { id: 'db',      x: 430, y: 140, label: 'db/',          kind: 'db',     files: 12  },
    { id: 'auth',    x:  50, y: 240, label: 'auth.ts',      kind: 'file' },
    { id: 'router',  x: 170, y: 240, label: 'router.ts',    kind: 'file' },
    { id: 'page',    x: 270, y: 240, label: 'page.tsx',     kind: 'file' },
    { id: 'comp',    x: 350, y: 300, label: 'Card.tsx',     kind: 'file' },
    { id: 'schema',  x: 430, y: 240, label: 'schema.sql',   kind: 'sql' },
    { id: 'users',   x: 510, y: 300, label: 'users',        kind: 'table' },
  ];
  const edges = [
    ['app','api'], ['app','web'], ['app','db'],
    ['api','auth'], ['api','router'],
    ['web','page'], ['page','comp'],
    ['db','schema'], ['schema','users'],
    ['router','auth'], ['page','router'],
  ];
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  const pulseNodes = ['auth', 'page', 'schema', 'comp', 'router', 'users'];
  const activeNode = pulseNodes[Math.floor(tick / 8) % pulseNodes.length];

  const colorFor = (kind) => {
    if (kind === 'root') return 'var(--accent)';
    if (kind === 'db' || kind === 'sql' || kind === 'table') return 'var(--info)';
    if (kind === 'folder') return 'var(--magenta)';
    return 'var(--fg-2)';
  };

  return (
    <div className="gg-card" style={{
      padding: 0, overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(13,17,23,0.95), rgba(13,17,23,0.7))',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', borderBottom:'1px solid var(--line)',
        fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)'
      }}>
        <div style={{display:'flex', gap:6, alignItems:'center'}}>
          <span style={{width:8, height:8, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 8px var(--accent)'}}/>
          <span style={{color:'var(--fg-2)'}}>./gitgraph</span>
          <span style={{opacity:0.5}}>analyze</span>
          <span style={{color:'var(--accent)'}}>app/</span>
        </div>
        <div style={{display:'flex', gap:14}}>
          <span>nodes <span style={{color:'var(--fg)'}}>10</span></span>
          <span>edges <span style={{color:'var(--fg)'}}>11</span></span>
          <span>depth <span style={{color:'var(--fg)'}}>3</span></span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{display:'block'}}>
        <defs>
          <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.06)"/>
          </pattern>
          <radialGradient id="nodeGlow">
            <stop offset="0%" stopColor="rgba(63,185,80,0.4)"/>
            <stop offset="100%" stopColor="rgba(63,185,80,0)"/>
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill="url(#dotgrid)"/>

        {/* edges */}
        {edges.map(([a, b], i) => {
          const A = nodeMap[a], B = nodeMap[b];
          const isActive = a === activeNode || b === activeNode;
          return (
            <g key={i}>
              <line x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke={isActive ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}
                strokeWidth={isActive ? 1.5 : 1}
                strokeDasharray={isActive ? '4 3' : 'none'}
                strokeDashoffset={isActive ? -tick * 0.8 : 0}
              />
            </g>
          );
        })}

        {/* nodes */}
        {nodes.map(n => {
          const isActive = n.id === activeNode;
          const c = colorFor(n.kind);
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              {isActive && (
                <circle r="22" fill="url(#nodeGlow)" opacity="0.8"/>
              )}
              <circle r={n.kind === 'root' ? 8 : 5}
                fill={isActive ? c : 'var(--bg)'}
                stroke={c}
                strokeWidth={n.kind === 'root' ? 2 : 1.5}
              />
              <text x="0" y={n.kind === 'root' ? -16 : (n.id === 'comp' || n.id === 'users' ? 18 : -10)}
                textAnchor="middle"
                fontFamily="var(--mono)" fontSize="10"
                fill={isActive ? c : 'var(--fg-2)'}
                style={{transition: 'fill 0.2s'}}
              >
                {n.label}
              </text>
            </g>
          );
        })}

        {/* scanning vertical line */}
        <line
          x1={(tick * 4) % width} y1="0"
          x2={(tick * 4) % width} y2={height}
          stroke="rgba(63,185,80,0.18)" strokeWidth="1"
        />
      </svg>
      <div style={{
        padding:'10px 14px', borderTop:'1px solid var(--line)',
        fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-3)',
        display:'flex', justifyContent:'space-between'
      }}>
        <span><span style={{color:'var(--accent)'}}>●</span> indexed in <span style={{color:'var(--fg)'}}>{(0.18 + (tick % 30)*0.001).toFixed(3)}s</span></span>
        <span>memory <span style={{color:'var(--fg)'}}>42 MB</span></span>
      </div>
    </div>
  );
}

Object.assign(window, { GGLogo, GGNav, GraphViz });
