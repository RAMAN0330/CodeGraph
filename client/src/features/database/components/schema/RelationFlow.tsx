import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Shuffle } from 'lucide-react';
import type { Schema, SchemaTable } from '../../types';
import { Button } from '@/components/ui/button';

// Foreign-key relationships as an interactive SVG flow: tables are laid out in
// layers (referenced tables to the left), edges are curves that run from the
// foreign-key column to the column it references, with a moving dash showing
// the direction of the reference. Drag nodes, drag the canvas to pan, scroll
// to zoom, hover to trace a table's relationships, click to select.

const W = 220, HEAD = 32, ROW = 19, PAD = 10, GAP_X = 120, GAP_Y = 26, MAX_ROWS = 6;

interface Pos { x: number; y: number }
interface Edge { id: string; from: string; to: string; column: string; refColumn: string }
interface Props { schema: Schema; selected: string | null; query?: string; onSelect: (name: string | null) => void }

const rank = (t: SchemaTable, name: string) => (t.columns.find(c => c.name === name)?.isPrimary ? 0 : t.foreignKeys.some(f => f.column === name) ? 1 : 2);

function shownColumns(t: SchemaTable) {
  return [...t.columns].sort((a, b) => rank(t, a.name) - rank(t, b.name)).slice(0, MAX_ROWS);
}
const heightOf = (t: SchemaTable) => HEAD + shownColumns(t).length * ROW + PAD + (t.columns.length > MAX_ROWS ? 14 : 0);

function layout(tables: SchemaTable[], edges: Edge[]): Record<string, Pos> {
  const names = new Set(tables.map(t => t.name));
  const linked = new Set<string>();
  edges.forEach(e => { linked.add(e.from); linked.add(e.to); });
  const depth: Record<string, number> = {};
  tables.forEach(t => { depth[t.name] = 0; });
  for (let i = 0; i < tables.length; i++) {
    let changed = false;
    for (const e of edges) {
      if (e.from === e.to || !names.has(e.to)) continue;
      if (depth[e.from] < Math.min(tables.length, depth[e.to] + 1)) { depth[e.from] = depth[e.to] + 1; changed = true; }
    }
    if (!changed) break;
  }
  const degree: Record<string, number> = {};
  edges.forEach(e => { degree[e.from] = (degree[e.from] ?? 0) + 1; degree[e.to] = (degree[e.to] ?? 0) + 1; });
  const layers = new Map<number, SchemaTable[]>();
  const loose: SchemaTable[] = [];
  tables.forEach(t => { if (linked.has(t.name)) layers.set(depth[t.name], [...(layers.get(depth[t.name]) ?? []), t]); else loose.push(t); });
  const pos: Record<string, Pos> = {};
  let bottom = 0;
  [...layers.keys()].sort((a, b) => a - b).forEach((d, col) => {
    let y = 0;
    layers.get(d)!.sort((a, b) => (degree[b.name] ?? 0) - (degree[a.name] ?? 0)).forEach(t => {
      pos[t.name] = { x: col * (W + GAP_X), y };
      y += heightOf(t) + GAP_Y;
    });
    bottom = Math.max(bottom, y);
  });
  // Tables with no relationships sit in a grid underneath rather than stretching the layers.
  const perRow = Math.max(3, layers.size || 4);
  let rowTop = bottom ? bottom + GAP_Y : 0, rowHeight = 0;
  loose.forEach((t, i) => {
    if (i && i % perRow === 0) { rowTop += rowHeight + GAP_Y; rowHeight = 0; }
    pos[t.name] = { x: (i % perRow) * (W + GAP_X / 2), y: rowTop };
    rowHeight = Math.max(rowHeight, heightOf(t));
  });
  return pos;
}

function anchorY(t: SchemaTable, p: Pos, column: string) {
  const i = shownColumns(t).findIndex(c => c.name === column);
  return p.y + (i < 0 ? HEAD / 2 : HEAD + i * ROW + ROW / 2);
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, aLeft: boolean, bRight: boolean) {
  // a is the foreign-key side, b the referenced side; the curve leaves each end horizontally.
  const reach = Math.max(50, Math.min(160, Math.abs(b.x - a.x) / 2));
  const c1 = a.x + (aLeft ? -reach : reach), c2 = b.x + (bRight ? reach : -reach);
  return `M${a.x},${a.y} C${c1},${a.y} ${c2},${b.y} ${b.x},${b.y}`;
}

export default function RelationFlow({ schema, selected, query = '', onSelect }: Props) {
  const tables = schema.tables;
  const byName = useMemo(() => new Map(tables.map(t => [t.name, t])), [tables]);
  const edges = useMemo<Edge[]>(() => tables.flatMap(t => t.foreignKeys
    .filter(f => byName.has(f.referencedTable))
    .map(f => ({ id: `${t.name}.${f.column}`, from: t.name, to: f.referencedTable, column: f.column, refColumn: f.referencedColumn }))), [tables, byName]);
  const [pos, setPos] = useState<Record<string, Pos>>(() => layout(tables, edges));
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'pan' | 'node'; name?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const fit = useCallback((positions: Record<string, Pos>) => {
    const el = box.current;
    const list = tables.filter(t => positions[t.name]);
    if (!el || !list.length) return;
    const minX = Math.min(...list.map(t => positions[t.name].x)), maxX = Math.max(...list.map(t => positions[t.name].x + W));
    const minY = Math.min(...list.map(t => positions[t.name].y)), maxY = Math.max(...list.map(t => positions[t.name].y + heightOf(t)));
    const k = Math.max(0.25, Math.min(1.1, (el.clientWidth - 48) / (maxX - minX), (el.clientHeight - 48) / (maxY - minY)));
    setView({ k, x: (el.clientWidth - (maxX - minX) * k) / 2 - minX * k, y: (el.clientHeight - (maxY - minY) * k) / 2 - minY * k });
  }, [tables]);

  useEffect(() => { const next = layout(tables, edges); setPos(next); fit(next); }, [tables, edges, fit]);

  // Opening the detail panel narrows the canvas, so refit to keep every table in view.
  const posRef = useRef(pos);
  posRef.current = pos;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit(posRef.current));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setView(v => {
        const k = Math.max(0.2, Math.min(2.5, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (t: SchemaTable) => !q || t.name.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q));
  const focus = hover ?? selected;
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (focus) { set.add(focus); edges.forEach(e => { if (e.from === focus) set.add(e.to); if (e.to === focus) set.add(e.from); }); }
    return set;
  }, [focus, edges]);

  const onDown = (e: React.PointerEvent, name?: string) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = name ? pos[name] : view;
    drag.current = { kind: name ? 'node' : 'pan', name, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.kind === 'pan') setView(v => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else setPos(p => ({ ...p, [d.name!]: { x: d.ox + dx / view.k, y: d.oy + dy / view.k } }));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) onSelect(d.kind === 'node' ? (d.name === selected ? null : d.name!) : null);
  };
  const zoom = (f: number) => setView(v => {
    const el = box.current;
    const cx = (el?.clientWidth ?? 0) / 2, cy = (el?.clientHeight ?? 0) / 2, k = Math.max(0.2, Math.min(2.5, v.k * f));
    return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
  });
  const relayout = () => { const next = layout(tables, edges); setPos(next); fit(next); };

  const active = (e: Edge) => e.from === focus || e.to === focus || e.id === hoverEdge;

  return (
    <div ref={box} className="relative size-full touch-none select-none overflow-hidden bg-background" style={{ cursor: drag.current?.kind === 'pan' ? 'grabbing' : 'grab' }}>
      <style>{`@keyframes rf-flow{to{stroke-dashoffset:-24}}.rf-flow{animation:rf-flow 1s linear infinite}@media (prefers-reduced-motion:reduce){.rf-flow{animation:none}}`}</style>
      <svg className="size-full" onPointerDown={e => onDown(e)} onPointerMove={onMove} onPointerUp={onUp} role="img" aria-label={`Relationships between ${tables.length} tables`}>
        <defs>
          <pattern id="rf-dots" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <circle cx="1" cy="1" r="1" style={{ fill: 'var(--border)' }} />
          </pattern>
          <marker id="rf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" style={{ fill: 'var(--muted-foreground)' }} /></marker>
          <marker id="rf-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" style={{ fill: 'var(--primary)' }} /></marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#rf-dots)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {edges.map(e => {
            const a = byName.get(e.from)!, b = byName.get(e.to)!, pa = pos[e.from], pb = pos[e.to];
            if (!pa || !pb) return null;
            const ay = anchorY(a, pa, e.column), by = anchorY(b, pb, e.refColumn), on = active(e);
            let d: string, startX = pa.x + W;
            if (e.from === e.to) {
              d = `M${pa.x + W},${ay} C${pa.x + W + 70},${ay} ${pa.x + W + 70},${by + 26} ${pa.x + W},${by + 26}`;
            } else if (pb.x + W + 20 <= pa.x) { startX = pa.x; d = edgePath({ x: pa.x, y: ay }, { x: pb.x + W, y: by }, true, true); }
            else if (pa.x + W + 20 <= pb.x) d = edgePath({ x: pa.x + W, y: ay }, { x: pb.x, y: by }, false, false);
            else d = edgePath({ x: pa.x + W, y: ay }, { x: pb.x + W, y: by }, false, true);
            const dim = focus && !on;
            return (
              <g key={e.id} opacity={dim ? 0.18 : 1} onPointerEnter={() => setHoverEdge(e.id)} onPointerLeave={() => setHoverEdge(null)}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                <path d={d} fill="none" strokeWidth={on ? 2.25 : 1.4} markerEnd={`url(#${on ? 'rf-arrow-on' : 'rf-arrow'})`} className={on ? 'rf-flow' : undefined}
                  strokeDasharray={on ? '6 6' : undefined} style={{ stroke: on ? 'var(--primary)' : 'var(--muted-foreground)', transition: 'stroke .15s' }} />
                <circle cx={startX} cy={ay} r={3.5} style={{ fill: on ? 'var(--primary)' : 'var(--muted-foreground)' }} />
                {e.id === hoverEdge && (
                  <text x={(pa.x + pb.x + W) / 2} y={(ay + by) / 2 - 8} textAnchor="middle" fontSize={11} fontWeight={600} paintOrder="stroke" style={{ fill: 'var(--foreground)', stroke: 'var(--background)', strokeWidth: 4 }}>
                    {e.from}.{e.column} → {e.to}.{e.refColumn}
                  </text>
                )}
              </g>
            );
          })}
          {tables.map(t => {
            const p = pos[t.name];
            if (!p) return null;
            const isSel = selected === t.name, dim = (focus && !neighbours.has(t.name)) || !matches(t);
            const cols = shownColumns(t);
            return (
              <g key={t.name} transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.3 : 1} style={{ cursor: 'pointer', transition: 'opacity .15s' }}
                onPointerDown={e => onDown(e, t.name)} onPointerEnter={() => setHover(t.name)} onPointerLeave={() => setHover(null)}>
                <rect width={W} height={heightOf(t)} rx={9} strokeWidth={isSel || neighbours.has(t.name) && focus === t.name ? 2 : 1}
                  style={{ fill: 'var(--card)', stroke: isSel || focus === t.name ? 'var(--primary)' : 'var(--border)' }} />
                <path d={`M0,${HEAD} V9 a9,9 0 0 1 9,-9 H${W - 9} a9,9 0 0 1 9,9 V${HEAD} z`} style={{ fill: 'var(--muted)' }} />
                <text x={PAD} y={20} fontSize={12.5} fontWeight={700} style={{ fill: 'var(--foreground)' }}>{t.name.length > 20 ? `${t.name.slice(0, 19)}…` : t.name}</text>
                {!!t.rowEstimate && <text x={W - PAD} y={20} fontSize={10} textAnchor="end" style={{ fill: 'var(--muted-foreground)' }}>{Intl.NumberFormat('en', { notation: 'compact' }).format(t.rowEstimate)} rows</text>}
                {cols.map((c, i) => {
                  const fk = t.foreignKeys.some(f => f.column === c.name);
                  return (
                    <g key={c.name} transform={`translate(0 ${HEAD + i * ROW})`}>
                      <text x={PAD} y={13} fontSize={9} fontWeight={700} style={{ fill: c.isPrimary ? 'var(--primary)' : 'var(--muted-foreground)' }}>{c.isPrimary ? 'PK' : fk ? 'FK' : ''}</text>
                      <text x={PAD + 22} y={13} fontSize={11} fontFamily="var(--font-mono, monospace)" style={{ fill: 'var(--foreground)' }}>{c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name}</text>
                      <text x={W - PAD} y={13} fontSize={10} textAnchor="end" style={{ fill: 'var(--muted-foreground)' }}>{c.type.length > 12 ? `${c.type.slice(0, 11)}…` : c.type}</text>
                    </g>
                  );
                })}
                {t.columns.length > MAX_ROWS && <text x={PAD} y={HEAD + cols.length * ROW + 12} fontSize={10} style={{ fill: 'var(--muted-foreground)' }}>+{t.columns.length - MAX_ROWS} more columns</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute top-3 right-3 flex gap-1 rounded-lg border bg-card p-1 shadow-sm" onPointerDown={e => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => zoom(1.25)} aria-label="Zoom in"><Plus className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => zoom(0.8)} aria-label="Zoom out"><Minus className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => fit(pos)} aria-label="Fit to screen"><Maximize2 className="size-4" /></Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={relayout} aria-label="Reset layout"><Shuffle className="size-4" /></Button>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-card/90 px-2.5 py-1.5 text-[11px] text-muted-foreground">
        {edges.length} relationship{edges.length === 1 ? '' : 's'} · arrows point at the referenced table · drag, scroll to zoom, hover to trace
      </p>
    </div>
  );
}
