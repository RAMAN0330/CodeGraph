import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

// ─── design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:         '#07090c',
  bg1:        '#0b0e13',
  bg2:        '#10141b',
  bg3:        '#161b24',
  panel:      '#0d1117',
  line:       'rgba(255,255,255,0.06)',
  lineStrong: 'rgba(255,255,255,0.12)',
  fg:         '#e6edf3',
  fg2:        '#b1bac4',
  fg3:        '#7d8590',
  fg4:        '#4b5563',
  accent:     '#3fb950',
  info:       '#58a6ff',
  warn:       '#d29922',
  danger:     '#f85149',
  magenta:    '#bc8cff',
  cyan:       '#76e4f7',
};
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Inter', ui-sans-serif, sans-serif";

// ─── GitHub SVG path ──────────────────────────────────────────────────────────
const GH_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

// ─── AnimatedCursor ───────────────────────────────────────────────────────────
function AnimatedCursor() {
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setVis(v => !v), 530);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{
      display: 'inline-block',
      width: '3px',
      height: '1em',
      background: C.accent,
      verticalAlign: 'text-bottom',
      marginLeft: '3px',
      opacity: vis ? 1 : 0,
      transition: 'opacity 0.08s',
    }} />
  );
}

// ─── GraphViz ─────────────────────────────────────────────────────────────────
type NodeKind = 'root' | 'folder' | 'db' | 'file' | 'sql' | 'table';

interface GNode {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
}

interface GEdge {
  from: string;
  to: string;
}

const NODES: GNode[] = [
  { id: 'app',       label: 'app/',       kind: 'root',   x: 270, y: 50  },
  { id: 'api',       label: 'api/',       kind: 'folder', x: 110, y: 140 },
  { id: 'web',       label: 'web/',       kind: 'folder', x: 270, y: 140 },
  { id: 'db',        label: 'db/',        kind: 'db',     x: 430, y: 140 },
  { id: 'auth',      label: 'auth.ts',    kind: 'file',   x: 50,  y: 240 },
  { id: 'router',    label: 'router.ts',  kind: 'file',   x: 170, y: 240 },
  { id: 'page',      label: 'page.tsx',   kind: 'file',   x: 270, y: 240 },
  { id: 'card',      label: 'Card.tsx',   kind: 'file',   x: 350, y: 300 },
  { id: 'schema',    label: 'schema.sql', kind: 'sql',    x: 430, y: 240 },
  { id: 'users',     label: 'users',      kind: 'table',  x: 510, y: 300 },
];

const EDGES: GEdge[] = [
  { from: 'app',    to: 'api'    },
  { from: 'app',    to: 'web'    },
  { from: 'app',    to: 'db'     },
  { from: 'api',    to: 'auth'   },
  { from: 'api',    to: 'router' },
  { from: 'web',    to: 'page'   },
  { from: 'web',    to: 'card'   },
  { from: 'db',     to: 'schema' },
  { from: 'db',     to: 'users'  },
  { from: 'page',   to: 'card'   },
  { from: 'schema', to: 'users'  },
];

const LEAF_IDS = ['auth', 'router', 'page', 'card', 'schema', 'users'];

const NODE_COLORS: Record<NodeKind, string> = {
  root:   C.accent,
  folder: C.info,
  db:     C.warn,
  file:   C.fg2,
  sql:    C.cyan,
  table:  C.magenta,
};

function GraphViz() {
  const [tick, setTick] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      setTick(n => n + 1);
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 80);
    return () => clearInterval(t);
  }, []);

  const activeId = LEAF_IDS[Math.floor(tick / 8) % LEAF_IDS.length];
  const activeNode = NODES.find(n => n.id === activeId)!;
  const activeEdges = new Set(
    EDGES.filter(e => e.from === activeId || e.to === activeId)
         .map(e => `${e.from}:${e.to}`)
  );
  const scanX = (tick * 4) % 540;

  return (
    <div style={{
      background: C.panel,
      border: `1px solid ${C.lineStrong}`,
      borderRadius: '12px',
      overflow: 'hidden',
      fontFamily: MONO,
    }}>
      {/* card header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${C.line}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: C.bg2,
      }}>
        <span style={{ color: C.fg4, fontSize: '12px' }}>$</span>
        <span style={{ color: C.accent, fontSize: '12px' }}>./gitgraph analyze app/</span>
        <span style={{
          marginLeft: 'auto',
          width: '8px', height: '8px',
          borderRadius: '50%',
          background: C.accent,
          boxShadow: `0 0 6px ${C.accent}`,
          animation: 'pulse 1.4s infinite',
        }} />
      </div>

      {/* SVG canvas */}
      <svg
        width="100%"
        viewBox="0 0 540 340"
        style={{ display: 'block', background: C.bg1 }}
      >
        {/* scanning line */}
        <line
          x1={scanX} y1={0} x2={scanX} y2={340}
          stroke={C.accent}
          strokeWidth="1"
          strokeOpacity="0.18"
        />

        {/* edges */}
        {EDGES.map(e => {
          const a = NODES.find(n => n.id === e.from)!;
          const b = NODES.find(n => n.id === e.to)!;
          const key = `${e.from}:${e.to}`;
          const active = activeEdges.has(key);
          return (
            <line
              key={key}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? C.accent : C.lineStrong}
              strokeWidth={active ? 1.5 : 1}
              strokeDasharray={active ? '4 3' : undefined}
              strokeOpacity={active ? 0.9 : 0.5}
            />
          );
        })}

        {/* active glow */}
        {activeNode && (
          <circle
            cx={activeNode.x}
            cy={activeNode.y}
            r={18}
            fill={C.accent}
            fillOpacity={0.08}
            stroke={C.accent}
            strokeWidth={1}
            strokeOpacity={0.4}
          />
        )}

        {/* nodes */}
        {NODES.map(n => {
          const color = NODE_COLORS[n.kind];
          const isActive = n.id === activeId;
          return (
            <g key={n.id}>
              <circle
                cx={n.x} cy={n.y} r={8}
                fill={isActive ? color : C.bg3}
                stroke={color}
                strokeWidth={isActive ? 2 : 1}
                filter={isActive ? `drop-shadow(0 0 4px ${color})` : undefined}
              />
              <text
                x={n.x} y={n.y + 20}
                textAnchor="middle"
                fontSize="9"
                fill={isActive ? C.fg : C.fg3}
                fontFamily={MONO}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* card footer */}
      <div style={{
        padding: '8px 16px',
        borderTop: `1px solid ${C.line}`,
        background: C.bg2,
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '11px',
        color: C.fg3,
      }}>
        <span>indexed in {elapsed}s</span>
        <span style={{ color: C.fg4 }}>memory 42 MB</span>
      </div>
    </div>
  );
}

// ─── Feature card demos ───────────────────────────────────────────────────────
function BranchDemo({ color }: { color: string }) {
  return (
    <svg width="100%" viewBox="0 0 180 60" style={{ display: 'block', marginTop: '12px' }}>
      <line x1="20" y1="10" x2="160" y2="10" stroke={C.lineStrong} strokeWidth="1.5" />
      <line x1="60" y1="10" x2="100" y2="40" stroke={color} strokeWidth="1.5" />
      <line x1="100" y1="40" x2="140" y2="10" stroke={color} strokeWidth="1.5" />
      {[20, 60, 100, 140, 160].map(x => (
        <circle key={x} cx={x} cy={10} r={4} fill={C.bg3} stroke={C.lineStrong} strokeWidth="1" />
      ))}
      <circle cx={100} cy={40} r={4} fill={C.bg3} stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function SchemaDemo() {
  const tables = [['id','name'],['id','email'],['id','repo'],['id','ts']];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '12px' }}>
      {tables.map((cols, i) => (
        <div key={i} style={{
          background: C.bg2, border: `1px solid ${C.lineStrong}`,
          borderRadius: '4px', padding: '6px 8px', fontSize: '10px', fontFamily: MONO,
        }}>
          <div style={{ color: C.info, marginBottom: '3px' }}>tbl_{i}</div>
          {cols.map(c => <div key={c} style={{ color: C.fg3 }}>{c}</div>)}
        </div>
      ))}
    </div>
  );
}

function TerminalDemo({ color }: { color: string }) {
  const lines = ['> scanning deps…', '! CVE-2024-1234', '✓ 0 criticals'];
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.lineStrong}`,
      borderRadius: '4px', padding: '10px', marginTop: '12px',
      fontFamily: MONO, fontSize: '11px',
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: i === 1 ? color : C.fg3, marginBottom: '3px' }}>{l}</div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ login: string; avatar_url?: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetch(`${API}/auth/me?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (u) { setUser(u); navigate('/select-repo', { replace: true }); }
        else setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, [navigate]);

  const handleAuth = () => {
    window.location.href = `${API}/auth/github`;
  };

  const navLinks = ['features', 'docs', 'changelog', 'security'];

  const features = [
    {
      tag: 'GRAPH',
      title: 'Architecture map',
      desc: 'Visualize every module, import, and dependency edge across your entire repository as an interactive force-directed graph.',
      color: C.accent,
      demo: <BranchDemo color={C.accent} />,
    },
    {
      tag: 'SCHEMA',
      title: 'Database visualizer',
      desc: 'Auto-detect Django, SQLAlchemy, and Prisma models into live ER diagrams with FK arrows and column types.',
      color: C.info,
      demo: <SchemaDemo />,
    },
    {
      tag: 'BRANCH',
      title: 'Review timeline',
      desc: 'Walk through branch history commit-by-commit. Stage hunks, compare diffs, and trace regressions visually.',
      color: C.magenta,
      demo: <BranchDemo color={C.magenta} />,
    },
    {
      tag: 'SECURITY',
      title: 'Vulnerability scan',
      desc: 'Surface secrets, outdated deps, and CVEs before they hit production — integrated into the review workflow.',
      color: C.danger,
      demo: <TerminalDemo color={C.danger} />,
    },
  ];

  const stats = [
    { v: '1.2M', unit: '+18%', l: 'files indexed daily' },
    { v: '180',  unit: 'p50',  l: 'analysis ms'         },
    { v: '10k',  unit: 'fps',  l: 'schema render'       },
    { v: '14',   unit: '',     l: 'frameworks understood'},
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.fg, fontFamily: SANS, overflowX: 'hidden' }}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${C.line}`,
        background: 'rgba(7,9,12,0.82)',
        padding: '0 7vw',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: '52px',
      }}>
        {/* brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px', height: '28px', background: C.accent,
            borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill={C.bg}>
              <path d={GH_PATH} />
            </svg>
          </div>
          <span style={{ fontFamily: MONO, fontSize: '13px', color: C.fg2, letterSpacing: '-0.01em' }}>
            gitgraph<span style={{ color: C.fg4 }}>/0.4.2</span>
          </span>
        </div>

        {/* links + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {navLinks.map(l => (
            <a
              key={l}
              href={`#${l}`}
              style={{
                color: C.fg3, fontSize: '13px', textDecoration: 'none',
                padding: '5px 12px', borderRadius: '6px', fontFamily: SANS,
              }}
              onMouseEnter={e => (e.currentTarget.style.color = C.fg)}
              onMouseLeave={e => (e.currentTarget.style.color = C.fg3)}
            >
              {l}
            </a>
          ))}
          <div style={{ width: '1px', height: '20px', background: C.line, margin: '0 8px' }} />
          <button
            onClick={() => navigate('/db')}
            style={{
              background: 'transparent', border: `1px solid ${C.lineStrong}`,
              color: C.fg2, padding: '5px 14px', borderRadius: '6px',
              fontSize: '13px', cursor: 'pointer', fontFamily: SANS,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.fg3; e.currentTarget.style.color = C.fg; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.color = C.fg2; }}
          >
            → launch app
          </button>
          {authChecked && (
            <button
              onClick={handleAuth}
              style={{
                background: C.accent, border: 'none',
                color: C.bg, padding: '5px 14px', borderRadius: '6px',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
                marginLeft: '6px',
              }}
            >
              sign in
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        padding: '80px 7vw 88px',
        display: 'grid', gridTemplateColumns: '1.05fr 1fr',
        gap: '56px', alignItems: 'center',
      }}>
        {/* left */}
        <div>
          {/* eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: C.bg2, border: `1px solid ${C.lineStrong}`,
            borderRadius: '20px', padding: '4px 14px',
            fontSize: '12px', fontFamily: MONO, color: C.fg3,
            marginBottom: '28px',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: C.accent, display: 'inline-block' }} />
            v0.4.2 · open source
          </div>

          {/* h1 */}
          <h1 style={{
            fontSize: '64px', fontWeight: 800, lineHeight: 1.08,
            letterSpacing: '-0.04em', margin: '0 0 20px', color: C.fg,
          }}>
            Read your repo<br />
            <span style={{
              fontFamily: MONO,
              background: `linear-gradient(90deg, ${C.accent}, ${C.cyan})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              like a graph
            </span>
            <AnimatedCursor />
          </h1>

          <p style={{
            fontSize: '16px', color: C.fg3, lineHeight: 1.75,
            maxWidth: '440px', margin: '0 0 36px',
          }}>
            GitGraph renders your entire codebase as a living dependency graph — explore architecture, schema, branches, and security from a single pane.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <button
              onClick={handleAuth}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: C.accent, border: 'none',
                color: C.bg, padding: '11px 22px', borderRadius: '8px',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill={C.bg}><path d={GH_PATH} /></svg>
              continue with github
            </button>
            <button
              onClick={() => navigate('/db')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'transparent', border: `1px solid ${C.lineStrong}`,
                color: C.fg2, padding: '11px 22px', borderRadius: '8px',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.info; e.currentTarget.style.color = C.fg; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.color = C.fg2; }}
            >
              try the schema visualizer →
            </button>
          </div>

          {/* kbd hint */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: C.fg4, fontFamily: MONO }}>
            <kbd style={{
              background: C.bg3, border: `1px solid ${C.lineStrong}`,
              borderRadius: '4px', padding: '2px 7px', fontSize: '11px', color: C.fg3,
            }}>⌘ K</kbd>
            <span>·</span>
            <span>install via</span>
            <code style={{ color: C.fg3 }}>npm i -g gitgraph</code>
          </div>
        </div>

        {/* right: GraphViz */}
        <GraphViz />
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <section style={{
        borderTop: `1px solid ${C.lineStrong}`,
        borderBottom: `1px solid ${C.lineStrong}`,
        background: C.bg1,
      }}>
        <div style={{
          padding: '28px 7vw',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '24px', textAlign: 'center',
        }}>
          {stats.map(s => (
            <div key={s.l}>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '28px', fontWeight: 700, fontFamily: MONO, color: C.fg }}>{s.v}</span>
                {s.unit && <span style={{ fontSize: '12px', color: C.accent, fontFamily: MONO }}>{s.unit}</span>}
              </div>
              <div style={{ fontSize: '12px', color: C.fg4, textTransform: 'uppercase', letterSpacing: '0.09em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '80px 7vw' }}>
        {/* eyebrow */}
        <div style={{ fontFamily: MONO, fontSize: '12px', color: C.fg4, marginBottom: '12px' }}>// features</div>
        <h2 style={{
          fontSize: '32px', fontWeight: 700, letterSpacing: '-0.02em',
          margin: '0 0 48px', color: C.fg,
        }}>
          Four lenses on the same codebase.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {features.map(f => (
            <div
              key={f.tag}
              style={{
                background: C.panel, border: `1px solid ${C.lineStrong}`,
                borderRadius: '10px', padding: '20px',
                display: 'flex', flexDirection: 'column',
                transition: 'border-color 0.15s',
                cursor: 'default',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.borderColor = f.color)}
              onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.borderColor = C.lineStrong)}
            >
              <div style={{ fontFamily: MONO, fontSize: '10px', color: f.color, letterSpacing: '0.1em', marginBottom: '6px' }}>{f.tag}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: C.fg, marginBottom: '8px' }}>{f.title}</div>
              <p style={{ fontSize: '12px', color: C.fg3, lineHeight: 1.65, margin: 0, flexGrow: 1 }}>{f.desc}</p>
              {f.demo}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA section ─────────────────────────────────────────────────── */}
      <section style={{
        padding: '72px 7vw 80px',
        textAlign: 'center',
      }}>
        {/* divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '36px' }}>
          <div style={{ flex: 1, height: '1px', background: C.lineStrong }} />
          <code style={{ fontFamily: MONO, fontSize: '13px', color: C.fg4 }}>$ gitgraph init</code>
          <div style={{ flex: 1, height: '1px', background: C.lineStrong }} />
        </div>

        <h2 style={{
          fontSize: '36px', fontWeight: 800, letterSpacing: '-0.03em',
          margin: '0 0 14px', color: C.fg,
        }}>
          Stop reading code line by line.
        </h2>
        <p style={{ fontSize: '15px', color: C.fg3, lineHeight: 1.7, margin: '0 0 36px' }}>
          Free for public repos. 14-day trial on private.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleAuth}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: C.accent, border: 'none',
              color: C.bg, padding: '12px 26px', borderRadius: '8px',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer', fontFamily: SANS,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill={C.bg}><path d={GH_PATH} /></svg>
            continue with github
          </button>
          <button
            onClick={() => navigate('/db')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'transparent', border: `1px solid ${C.lineStrong}`,
              color: C.fg2, padding: '12px 26px', borderRadius: '8px',
              fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: SANS,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.info; e.currentTarget.style.color = C.fg; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.color = C.fg2; }}
          >
            try schema visualizer →
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: `1px solid ${C.lineStrong}`,
        padding: '20px 7vw',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '12px',
        background: C.bg1,
      }}>
        <span style={{ fontFamily: MONO, fontSize: '12px', color: C.fg4 }}>
          gitgraph © 2026 · MIT license
        </span>
        <span style={{ fontFamily: MONO, fontSize: '12px', color: C.fg4 }}>
          commit <span style={{ color: C.fg3 }}>#a8f3c2d</span> · deployed 2 hours ago
        </span>
      </footer>
    </div>
  );
}
