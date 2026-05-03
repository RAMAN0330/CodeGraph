import { useMemo, useState, useRef, useEffect, useCallback } from 'react';

interface FileNode {
  path: string;
  name: string;
  layer: string;
  functions?: any[];
  lines?: number;
  isCode?: boolean;
}

interface Connection {
  from: string;
  to: string;
  label?: string;
}

interface Props {
  nodes: FileNode[];
  connections: Connection[];
}

// ─── Layer config ─────────────────────────────────────────────────────────────
const LAYER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; order: number }> = {
  utils:      { label: 'Utilities',    color: '#76e4f7', bg: 'rgba(118,228,247,0.07)', border: 'rgba(118,228,247,0.25)', order: 0 },
  config:     { label: 'Configuration',color: '#58a6ff', bg: 'rgba(88,166,255,0.07)',  border: 'rgba(88,166,255,0.25)',  order: 1 },
  models:     { label: 'Models / Data', color: '#e3b341', bg: 'rgba(227,179,65,0.07)',  border: 'rgba(227,179,65,0.25)',  order: 2 },
  routes:     { label: 'Routes / API',  color: '#3fb950', bg: 'rgba(63,185,80,0.07)',   border: 'rgba(63,185,80,0.25)',   order: 3 },
  components: { label: 'Components',    color: '#bc8cff', bg: 'rgba(188,140,255,0.07)', border: 'rgba(188,140,255,0.25)', order: 4 },
  services:   { label: 'Services',      color: '#ffa657', bg: 'rgba(255,166,87,0.07)',  border: 'rgba(255,166,87,0.25)',  order: 5 },
  tests:      { label: 'Tests',         color: '#f85149', bg: 'rgba(248,81,73,0.07)',   border: 'rgba(248,81,73,0.25)',   order: 6 },
  scripts:    { label: 'Scripts',       color: '#d29922', bg: 'rgba(210,153,34,0.07)',  border: 'rgba(210,153,34,0.25)',  order: 7 },
  other:      { label: 'Other',         color: '#8b949e', bg: 'rgba(139,148,158,0.07)', border: 'rgba(139,148,158,0.2)',  order: 8 },
};

function getLayerCfg(layer: string) {
  return LAYER_CONFIG[layer] ?? LAYER_CONFIG.other;
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const GROUP_W = 220;
const GROUP_PAD = 14;
const NODE_H = 28;
const NODE_GAP = 6;
const GROUP_HEADER_H = 36;
const GROUP_V_PAD = 12;
const COL_GAP = 48;
const ROW_GAP = 56;
const COLS = 3;
const CANVAS_PAD = 40;

// ─── Shapes ───────────────────────────────────────────────────────────────────
const CYLINDER_H = 32;
const CIRCLE_R = 18;

function nodeShape(name: string): 'cylinder' | 'circle' | 'rect' {
  if (/\.(sql|db|sqlite|csv|json|yaml|yml|toml|env)$/i.test(name)) return 'cylinder';
  if (/param|scalar|weight|checkpoint/i.test(name)) return 'circle';
  return 'rect';
}

// ─── Compute group layout ─────────────────────────────────────────────────────
interface GroupLayout {
  id: string;
  label: string;
  color: string;
  bg: string;
  border: string;
  x: number;
  y: number;
  w: number;
  h: number;
  nodes: { node: FileNode; x: number; y: number; w: number; h: number; shape: 'rect' | 'cylinder' | 'circle' }[];
}

function computeLayout(groups: Map<string, FileNode[]>): GroupLayout[] {
  const sorted = Array.from(groups.entries()).sort((a, b) => {
    const oa = getLayerCfg(a[0]).order;
    const ob = getLayerCfg(b[0]).order;
    return oa - ob;
  });

  const layouts: GroupLayout[] = [];
  let colHeights = new Array(COLS).fill(CANVAS_PAD);

  sorted.forEach(([layerId, files], idx) => {
    const col = idx % COLS;
    const cfg = getLayerCfg(layerId);

    const nodesLayout = files.slice(0, 12).map((f, i) => {
      const sh = nodeShape(f.name);
      const h = sh === 'cylinder' ? CYLINDER_H : sh === 'circle' ? CIRCLE_R * 2 + 4 : NODE_H;
      return {
        node: f,
        x: GROUP_PAD,
        y: GROUP_HEADER_H + GROUP_V_PAD + i * (NODE_H + NODE_GAP),
        w: GROUP_W - GROUP_PAD * 2,
        h,
        shape: sh,
      };
    });

    const groupH = GROUP_HEADER_H + GROUP_V_PAD * 2 + files.slice(0, 12).length * (NODE_H + NODE_GAP);
    const x = CANVAS_PAD + col * (GROUP_W + COL_GAP);
    const y = colHeights[col];
    colHeights[col] += groupH + ROW_GAP;

    layouts.push({
      id: layerId,
      label: cfg.label,
      color: cfg.color,
      bg: cfg.bg,
      border: cfg.border,
      x, y,
      w: GROUP_W,
      h: groupH,
      nodes: nodesLayout,
    });
  });

  return layouts;
}

// ─── Edge routing ─────────────────────────────────────────────────────────────
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1);
  const dy = y2 - y1;
  const cx1 = x1 + Math.sign(x2 - x1) * Math.min(dx * 0.4, 60);
  const cy1 = y1 + dy * 0.1;
  const cx2 = x2 - Math.sign(x2 - x1) * Math.min(dx * 0.4, 60);
  const cy2 = y2 - dy * 0.1;
  return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
interface TooltipInfo { x: number; y: number; node: FileNode }

// ─── Main component ───────────────────────────────────────────────────────────
export default function ArchitectureDiagram({ nodes, connections }: Props) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [highlightGroup, setHighlightGroup] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; panStart: { x: number; y: number } } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Group nodes by layer
  const groups = useMemo(() => {
    const map = new Map<string, FileNode[]>();
    for (const n of nodes) {
      const layer = n.layer || 'other';
      if (!map.has(layer)) map.set(layer, []);
      map.get(layer)!.push(n);
    }
    return map;
  }, [nodes]);

  const layouts = useMemo(() => computeLayout(groups), [groups]);

  // Build path->layout lookup for edge drawing
  const nodePosMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const g of layouts) {
      for (const n of g.nodes) {
        const cx = g.x + n.x + n.w / 2;
        const cy = g.y + n.y + n.h / 2;
        m.set(n.node.path, { x: cx, y: cy });
        m.set(n.node.name, { x: cx, y: cy });
      }
    }
    return m;
  }, [layouts]);

  // Group-level connections (deduplicate to group pairs)
  const groupConnections = useMemo(() => {
    const layerByPath = new Map<string, string>();
    for (const g of layouts) {
      for (const n of g.nodes) {
        layerByPath.set(n.node.path, g.id);
        layerByPath.set(n.node.name, g.id);
      }
    }
    const seen = new Set<string>();
    const result: { from: string; to: string }[] = [];
    for (const c of connections) {
      const fl = layerByPath.get(c.from);
      const tl = layerByPath.get(c.to);
      if (fl && tl && fl !== tl) {
        const key = `${fl}→${tl}`;
        if (!seen.has(key)) { seen.add(key); result.push({ from: fl, to: tl }); }
      }
    }
    return result;
  }, [connections, layouts]);

  // Group center points
  const groupCenters = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const g of layouts) m.set(g.id, { x: g.x + g.w / 2, y: g.y + g.h / 2 });
    return m;
  }, [layouts]);

  const totalW = CANVAS_PAD * 2 + COLS * GROUP_W + (COLS - 1) * COL_GAP;
  const maxH = Math.max(...layouts.map(g => g.y + g.h), 400) + CANVAS_PAD;

  // Pan/zoom handlers
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.3, z - e.deltaY * 0.001)));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('.arch-node')) return;
    dragging.current = { startX: e.clientX, startY: e.clientY, panStart: pan };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan({
      x: dragging.current.panStart.x + (e.clientX - dragging.current.startX),
      y: dragging.current.panStart.y + (e.clientY - dragging.current.startY),
    });
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = null; }, []);

  if (nodes.length === 0) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#8b949e' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '16px', opacity: 0.4 }}>
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          <line x1="7" y1="10" x2="7" y2="14"/><line x1="17" y1="10" x2="17" y2="14"/>
          <line x1="10" y1="7" x2="14" y2="7"/><line x1="10" y1="17" x2="14" y2="17"/>
        </svg>
        <p style={{ fontSize: '0.9rem' }}>Analyse a repository to generate the architecture diagram.</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 80px)', overflow: 'hidden', background: '#0d1117' }}>
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 20,
        display: 'flex', gap: '6px', alignItems: 'center',
      }}>
        {/* Legend */}
        <div style={{ display: 'flex', gap: '8px', background: '#161b22', border: '1px solid #21262d', borderRadius: '8px', padding: '6px 12px', flexWrap: 'wrap', maxWidth: '340px' }}>
          {layouts.map(g => (
            <button key={g.id}
              onClick={() => setHighlightGroup(highlightGroup === g.id ? null : g.id)}
              style={{
                background: highlightGroup === g.id ? `${g.color}22` : 'transparent',
                border: `1px solid ${highlightGroup === g.id ? g.color : 'transparent'}`,
                borderRadius: '4px', padding: '2px 8px',
                fontSize: '0.68rem', color: highlightGroup === g.id ? g.color : '#8b949e',
                cursor: 'pointer', fontWeight: highlightGroup === g.id ? 600 : 400,
                transition: 'all 0.12s',
              }}
            >{g.label}</button>
          ))}
        </div>
        {/* Zoom controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {[{ label: '+', delta: 0.15 }, { label: '−', delta: -0.15 }].map(({ label, delta }) => (
            <button key={label} onClick={() => setZoom(z => Math.min(2, Math.max(0.3, z + delta)))}
              style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', width: '28px', height: '28px', color: '#8b949e', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >{label}</button>
          ))}
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', width: '28px', height: '22px', color: '#8b949e', cursor: 'pointer', fontSize: '0.6rem' }}
          >fit</button>
        </div>
      </div>

      {/* Canvas */}
      <svg
        ref={svgRef}
        width="100%" height="100%"
        style={{ cursor: dragging.current ? 'grabbing' : 'grab', userSelect: 'none' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#30363d" />
          </marker>
          <marker id="arrow-hi" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#58a6ff" />
          </marker>
          {/* subtle grid */}
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#21262d" strokeWidth="0.5" />
          </pattern>
        </defs>

        <rect width="100%" height="100%" fill="url(#grid)" />

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Group-level edges */}
          {groupConnections.map((c, i) => {
            const a = groupCenters.get(c.from);
            const b = groupCenters.get(c.to);
            if (!a || !b) return null;
            const hi = highlightGroup === c.from || highlightGroup === c.to || highlightGroup === null;
            return (
              <path
                key={i}
                d={edgePath(a.x, a.y, b.x, b.y)}
                fill="none"
                stroke={hi ? '#30363d' : '#1c2128'}
                strokeWidth={hi ? 1.5 : 1}
                strokeDasharray="5 4"
                markerEnd={`url(#${hi ? 'arrow' : 'arrow'})`}
                opacity={hi ? 0.7 : 0.25}
              />
            );
          })}

          {/* Groups */}
          {layouts.map(g => {
            const dimmed = highlightGroup !== null && highlightGroup !== g.id;
            return (
              <g key={g.id} opacity={dimmed ? 0.3 : 1} style={{ transition: 'opacity 0.18s' }}>
                {/* Group background */}
                <rect
                  x={g.x} y={g.y} width={g.w} height={g.h}
                  rx={10}
                  fill={g.bg}
                  stroke={g.border}
                  strokeWidth={1.5}
                />
                {/* Group header bar */}
                <rect
                  x={g.x} y={g.y} width={g.w} height={GROUP_HEADER_H}
                  rx={10}
                  fill={`${g.color}18`}
                />
                <rect
                  x={g.x} y={g.y + GROUP_HEADER_H - 6} width={g.w} height={6}
                  fill={`${g.color}18`}
                />
                {/* Group label */}
                <text
                  x={g.x + GROUP_PAD} y={g.y + GROUP_HEADER_H / 2 + 5}
                  fontSize={11} fontWeight={700}
                  fill={g.color}
                  fontFamily="'Inter', ui-sans-serif, sans-serif"
                  letterSpacing="0.03em"
                >
                  {g.label.toUpperCase()}
                </text>
                {/* Node count badge */}
                <text
                  x={g.x + g.w - GROUP_PAD} y={g.y + GROUP_HEADER_H / 2 + 5}
                  fontSize={9} fill={g.color} opacity={0.6}
                  textAnchor="end"
                  fontFamily="'JetBrains Mono', ui-monospace, monospace"
                >
                  {groups.get(g.id)?.length ?? 0} files
                </text>

                {/* Nodes */}
                {g.nodes.map((n, ni) => {
                  const nx = g.x + n.x;
                  const ny = g.y + n.y;
                  const fnCount = n.node.functions?.length ?? 0;

                  if (n.shape === 'cylinder') {
                    const ry = 5;
                    const cx = nx + n.w / 2;
                    return (
                      <g key={ni} className="arch-node"
                        onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, node: n.node })}
                        onMouseLeave={() => setTooltip(null)}
                        style={{ cursor: 'pointer' }}>
                        <ellipse cx={cx} cy={ny + ry} rx={n.w / 2} ry={ry} fill="#161b22" stroke={g.color} strokeWidth={1} opacity={0.85} />
                        <rect x={nx} y={ny + ry} width={n.w} height={CYLINDER_H - ry * 2} fill="#161b22" stroke={g.color} strokeWidth={1} opacity={0.85} />
                        <ellipse cx={cx} cy={ny + CYLINDER_H - ry} rx={n.w / 2} ry={ry} fill="#1c2128" stroke={g.color} strokeWidth={1} opacity={0.85} />
                        <text x={cx} y={ny + CYLINDER_H / 2 + 4} textAnchor="middle" fontSize={9.5} fill="#c9d1d9" fontFamily="'JetBrains Mono', monospace" style={{ pointerEvents: 'none' }}>
                          {n.node.name.length > 20 ? n.node.name.slice(0, 18) + '…' : n.node.name}
                        </text>
                      </g>
                    );
                  }

                  if (n.shape === 'circle') {
                    const cx = nx + n.w / 2;
                    const cy = ny + CIRCLE_R + 2;
                    return (
                      <g key={ni} className="arch-node"
                        onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, node: n.node })}
                        onMouseLeave={() => setTooltip(null)}
                        style={{ cursor: 'pointer' }}>
                        <circle cx={cx} cy={cy} r={CIRCLE_R} fill="#161b22" stroke={g.color} strokeWidth={1.5} opacity={0.85} />
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={8} fill="#c9d1d9" fontFamily="'JetBrains Mono', monospace" style={{ pointerEvents: 'none' }}>
                          {n.node.name.slice(0, 10)}
                        </text>
                      </g>
                    );
                  }

                  // rect (default)
                  return (
                    <g key={ni} className="arch-node"
                      onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, node: n.node })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'pointer' }}>
                      <rect x={nx} y={ny} width={n.w} height={NODE_H} rx={5} fill="#161b22" stroke={g.border} strokeWidth={1} />
                      {/* left accent bar */}
                      <rect x={nx} y={ny} width={3} height={NODE_H} rx={2} fill={g.color} opacity={0.6} />
                      {/* label */}
                      <text x={nx + 10} y={ny + 10 + 5} fontSize={9.5} fill="#c9d1d9" fontFamily="'JetBrains Mono', monospace" style={{ pointerEvents: 'none' }}>
                        {n.node.name.length > 22 ? n.node.name.slice(0, 20) + '…' : n.node.name}
                      </text>
                      {/* fn count badge */}
                      {fnCount > 0 && (
                        <text x={nx + n.w - 6} y={ny + NODE_H / 2 + 4} textAnchor="end" fontSize={8} fill={g.color} opacity={0.6} fontFamily="'JetBrains Mono', monospace" style={{ pointerEvents: 'none' }}>
                          {fnCount}fn
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* overflow indicator */}
                {(groups.get(g.id)?.length ?? 0) > 12 && (
                  <text
                    x={g.x + g.w / 2}
                    y={g.y + g.h - 8}
                    textAnchor="middle" fontSize={9} fill={g.color} opacity={0.5}
                    fontFamily="'Inter', sans-serif"
                  >
                    +{(groups.get(g.id)?.length ?? 0) - 12} more
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 14,
          top: tooltip.y - 10,
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '0.76rem',
          color: '#f0f6fc',
          pointerEvents: 'none',
          zIndex: 1000,
          minWidth: '180px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontFamily: 'monospace', color: '#58a6ff', marginBottom: '4px', fontWeight: 600 }}>{tooltip.node.name}</div>
          <div style={{ color: '#8b949e', fontSize: '0.68rem', marginBottom: '6px', wordBreak: 'break-all' }}>{tooltip.node.path}</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem' }}>
            {tooltip.node.lines != null && <span style={{ color: '#c9d1d9' }}>{tooltip.node.lines} lines</span>}
            {(tooltip.node.functions?.length ?? 0) > 0 && <span style={{ color: '#3fb950' }}>{tooltip.node.functions!.length} functions</span>}
          </div>
        </div>
      )}
    </div>
  );
}
