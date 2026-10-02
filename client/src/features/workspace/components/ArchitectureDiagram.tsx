import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AppWindow, ArrowDownLeft, ArrowUpRight, Boxes, CheckCircle2, Clipboard, Cpu, Crosshair, Database, Download, FileCode2, FlaskConical, Globe, Info, Route, Server, Sparkles, X } from 'lucide-react';
import { appConfig } from '../../../app/config';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  applyArchitectureEnrichment,
  buildArchitectureGraph,
  compileArchitectureMermaid,
  type ArchitectureEdge,
  type ArchitectureGraph,
  type ArchitectureKind,
  type ArchitectureNode,
} from '../services/architectureGraph';
import { EDGE_LABEL_MAX_CHARS, edgeLabelWidth, layoutArchitecture, NODE_H, NODE_W, reachable, roundedPath, type PlacedNode } from '../services/architectureLayout';

interface FileNode {
  path?: string;
  sourceFile?: string;
  id?: string;
  name?: string;
  layer?: string;
}

interface Connection {
  from?: string;
  to?: string;
  source?: string | { id?: string };
  target?: string | { id?: string };
  label?: string;
  relationship?: string;
  fn?: string;
}

interface Props {
  nodes: FileNode[];
  connections: Connection[];
  repoName?: string;
  onOpenFile?: (path: string) => void;
}

type TraceMode = 'direct' | 'downstream' | 'upstream';

// Same palette as the .architecture-kind-* badges in the details dialog, so a
// card and its badge always read as the same thing. Styling is written as SVG
// attributes rather than CSS so the PNG export carries it.
const KIND_STYLE: Record<ArchitectureKind, { label: string; fill: string; stroke: string; text: string; Icon: LucideIcon }> = {
  ui: { label: 'Interface', fill: '#e3f6f8', stroke: '#147a89', text: '#0d4a54', Icon: AppWindow },
  api: { label: 'API', fill: '#e5f5e9', stroke: '#1d7a3c', text: '#14532a', Icon: Route },
  service: { label: 'Services', fill: '#f1e9fa', stroke: '#7c3fa8', text: '#4c2470', Icon: Cpu },
  data: { label: 'Data', fill: '#faf1dc', stroke: '#92600a', text: '#5c3d06', Icon: Database },
  infrastructure: { label: 'Infrastructure', fill: '#fbe9f3', stroke: '#b8306f', text: '#701e46', Icon: Server },
  test: { label: 'Tests', fill: '#fbe6e6', stroke: '#c22b3a', text: '#7a1a24', Icon: FlaskConical },
  external: { label: 'External', fill: '#e6effa', stroke: '#2f6fd1', text: '#1d4488', Icon: Globe },
};
const KIND_ORDER: ArchitectureKind[] = ['ui', 'api', 'service', 'data', 'infrastructure', 'external', 'test'];

const FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const INK = '#111827';
const MUTED = '#64748B';
const CANVAS = '#F6F8FB';
// Monospace advance is ~0.6em, which makes text fitting exact enough without measuring.
const charsFor = (width: number, fontSize: number) => Math.max(4, Math.floor(width / (fontSize * 0.6)));
const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const truncateStart = (text: string, max: number) => (text.length > max ? `…${text.slice(text.length - max + 1)}` : text);

function commonFolder(paths: string[]): string {
  let prefix = paths[0]?.split('/').slice(0, -1) ?? [];
  for (const path of paths) {
    const parts = path.split('/').slice(0, -1);
    let i = 0;
    while (i < prefix.length && prefix[i] === parts[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix.join('/');
}

// Fit to the canvas width, never above natural size; a tall system scrolls
// vertically, and below this floor it scrolls sideways rather than shrink past legibility.
const MIN_SCALE = 0.55;
const CANVAS_PADDING = 64;

export default function ArchitectureDiagram({ nodes, connections, repoName = 'Repository', onOpenFile }: Props) {
  const baseGraph = useMemo(() => buildArchitectureGraph(nodes, connections), [nodes, connections]);
  const [graph, setGraph] = useState<ArchitectureGraph>(baseGraph);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [lensKind, setLensKind] = useState<ArchitectureKind | null>(null);
  const [traceMode, setTraceMode] = useState<TraceMode>('direct');
  const [enriching, setEnriching] = useState(false);
  const [message, setMessage] = useState('');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, '');

  // A click on empty canvas clears the trace.
  function onCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('.architecture-node, .architecture-legend-item, button')) return;
    setSelectedId(null);
    setLensKind(null);
  }

  // A new analysis replaces the graph and drops any trace into the old one.
  const [graphSource, setGraphSource] = useState(baseGraph);
  if (graphSource !== baseGraph) {
    setGraphSource(baseGraph);
    setGraph(baseGraph);
    setSelectedId(null);
    setLensKind(null);
  }

  useEffect(() => {
    if (!selectedId && !lensKind) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !detailsOpen) { setSelectedId(null); setLensKind(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, lensKind, detailsOpen]);

  const layout = useMemo(() => layoutArchitecture(graph), [graph]);
  const mermaidSource = useMemo(() => compileArchitectureMermaid(graph), [graph]);
  const nodeById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph]);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;

  // What is lit: a selected component's trace, else a hovered component's
  // neighbours, else a legend lens. Everything else dims.
  const focus = useMemo(() => {
    const anchor = selectedId ?? hoverId;
    const isLit = (edge: ArchitectureEdge, lit: Set<string>) => lit.has(edge.source) && lit.has(edge.target);
    if (anchor && nodeById.has(anchor)) {
      const mode: TraceMode = selectedId ? traceMode : 'direct';
      const lit = new Set<string>([anchor]);
      const edges = new Set<string>();
      if (mode === 'direct') {
        for (const edge of graph.edges) {
          if (edge.source !== anchor && edge.target !== anchor) continue;
          lit.add(edge.source); lit.add(edge.target); edges.add(edge.id);
        }
      } else {
        for (const id of reachable(graph, anchor, mode)) lit.add(id);
        for (const edge of graph.edges) {
          const [near, far] = mode === 'downstream' ? [edge.source, edge.target] : [edge.target, edge.source];
          if (lit.has(near) && lit.has(far) && far !== anchor) edges.add(edge.id);
        }
      }
      return { anchor, nodes: lit, edges, reached: lit.size - 1 };
    }
    if (lensKind) {
      const lit = new Set(graph.nodes.filter(node => node.kind === lensKind).map(node => node.id));
      return { anchor: null, nodes: lit, edges: new Set(graph.edges.filter(edge => isLit(edge, lit)).map(edge => edge.id)), reached: lit.size };
    }
    return null;
  }, [graph, nodeById, selectedId, hoverId, traceMode, lensKind]);

  // Width-fit scale, so the whole system spans the canvas without zooming.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setCanvasSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [graph.nodes.length]);
  const scale = canvasSize.width
    ? Math.max(MIN_SCALE, Math.min((canvasSize.width - CANVAS_PADDING) / layout.width, 1))
    : 1;

  async function copyMermaid() {
    await navigator.clipboard.writeText(mermaidSource);
    setMessage('Mermaid copied to clipboard.');
  }

  function downloadPng() {
    const element = svgRef.current;
    if (!element) return;
    // The clone keeps only attribute styling, so the export is the full,
    // undimmed diagram regardless of the current trace.
    const clone = element.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(layout.width));
    clone.setAttribute('height', String(layout.height));
    clone.removeAttribute('style');
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = layout.width * 2;
      canvas.height = layout.height * 2;
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(url); return; }
      context.scale(2, 2);
      context.drawImage(image, 0, 0, layout.width, layout.height);
      const link = document.createElement('a');
      link.download = `${repoName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-architecture.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
    image.onerror = () => { URL.revokeObjectURL(url); setMessage('Unable to export the diagram.'); };
    image.src = url;
  }

  async function generateExplanation() {
    setEnriching(true);
    setMessage('');
    try {
      const response = await fetch(`${appConfig.apiUrl}/api/architecture/enrich`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Explanation is not configured.');
      setGraph(current => applyArchitectureEnrichment(current, payload));
      setMessage('Architecture explanation generated.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to generate an explanation.');
    } finally {
      setEnriching(false);
    }
  }

  function selectNode(id: string) {
    setLensKind(null);
    setSelectedId(current => (current === id ? null : id));
  }

  if (!graph.nodes.length) return (
    <section className="architecture-empty">
      <Boxes size={42} />
      <h2>No system architecture yet</h2>
      <p>Analyze a repository to derive components and their validated connections.</p>
    </section>
  );

  const legendItems = KIND_ORDER
    .map(kind => ({ kind, count: graph.nodes.filter(node => node.kind === kind).length, textWidth: KIND_STYLE[kind].label.length * 6.9 }))
    .filter(item => item.count)
    .map((item, i, items) => ({ ...item, x: items.slice(0, i).reduce((sum, prev) => sum + prev.textWidth + 68, 0) }));
  const edgesInOrder = focus ? [...layout.edges].sort((a, b) => Number(focus.edges.has(a.edge.id)) - Number(focus.edges.has(b.edge.id))) : layout.edges;
  const labelledEdges = focus ? layout.edges.filter(item => focus.edges.has(item.edge.id) && item.edge.label && item.edge.label !== 'depends on') : [];

  return (
    <section className="architecture-workspace">
      <header className="architecture-header">
        <div>
          <span className="architecture-eyebrow"><Boxes size={14} /> System Architecture</span>
        </div>
        <div className="architecture-actions">
          <Button type="button" variant="ghost" onClick={generateExplanation} disabled={enriching}><Sparkles size={15} />{enriching ? 'Generating…' : 'Generate explanation'}</Button>
          <Button type="button" variant="ghost" onClick={copyMermaid}><Clipboard size={15} />Copy Mermaid</Button>
          <Button type="button" variant="ghost" onClick={downloadPng}><Download size={15} />PNG</Button>
        </div>
      </header>

      <div className="architecture-status">
        <span><CheckCircle2 size={14} />Validated against {nodes.length} repository files</span>
        <span>{graph.groups.length} areas · {graph.nodes.length} components · {graph.edges.length} connections</span>
        {message
          ? <span className="architecture-message">{message}</span>
          : <span className="architecture-hint">Click a component to trace it · double-click for details</span>}
      </div>

      <div className="architecture-layout architecture-layout-full">
        <div
          className="architecture-canvas"
          ref={canvasRef}
          onClick={onCanvasClick}
        >
          <div className="architecture-svg">
            <svg
              ref={svgRef}
              xmlns="http://www.w3.org/2000/svg"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              width={layout.width * scale}
              height={layout.height * scale}
              className={`architecture-diagram${focus ? ' has-focus' : ''}`}
              role="group"
              aria-label={`${repoName} system architecture`}
              fontFamily={FONT}
            >
              <defs>
                <pattern id={`${uid}-dots`} width="22" height="22" patternUnits="userSpaceOnUse">
                  <circle cx="1.5" cy="1.5" r="1.1" fill="#E2E8F0" />
                </pattern>
                <filter id={`${uid}-shadow`} x="-10%" y="-20%" width="120%" height="150%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#141820" floodOpacity="0.08" />
                </filter>
                {KIND_ORDER.map(kind => (
                  <marker key={kind} id={`${uid}-arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M0,0.5 L10,5 L0,9.5 Z" fill={KIND_STYLE[kind].stroke} />
                  </marker>
                ))}
              </defs>

              <rect width={layout.width} height={layout.height} fill={CANVAS} />
              <rect width={layout.width} height={layout.height} fill={`url(#${uid}-dots)`} />

              {layout.lanes.map(lane => (
                <g key={lane.id} className="architecture-lane">
                  <rect x={lane.x} y={lane.y} width={lane.w} height={lane.h} rx="14" fill="#FFFFFF" fillOpacity="0.6" stroke="#CBD5E1" strokeWidth="1.2" strokeDasharray="6 5" />
                  {lane.kind && <rect x={lane.x + 16} y={lane.y + 15} width="9" height="9" rx="2.5" fill={KIND_STYLE[lane.kind].fill} stroke={KIND_STYLE[lane.kind].stroke} strokeWidth="1.4" />}
                  <text x={lane.x + (lane.kind ? 33 : 16)} y={lane.y + 23.5} fontSize="11.5" fill={MUTED} letterSpacing="0.02em" stroke={CANVAS} strokeWidth="5" paintOrder="stroke" strokeLinejoin="round">
                    {`${String(lane.index + 1).padStart(2, '0')} / ${truncate(lane.label, charsFor(lane.w - 60, 11.5))}`}
                  </text>
                </g>
              ))}

              {edgesInOrder.map(item => {
                const source = nodeById.get(item.edge.source)!;
                const target = nodeById.get(item.edge.target)!;
                const style = KIND_STYLE[source.kind];
                const lit = focus?.edges.has(item.edge.id);
                const d = roundedPath(item.points);
                return (
                  <g key={item.edge.id} className={`architecture-edge${lit ? ' is-active' : ''}`}>
                    <title>{`${source.label} → ${target.label}${item.edge.label && item.edge.label !== 'depends on' ? ` · ${item.edge.label}` : ''}`}</title>
                    <path className="architecture-edge-line" d={d} fill="none" stroke={style.stroke} strokeOpacity="0.72" strokeWidth="1.6" strokeDasharray={item.dashed ? '5 4' : undefined} markerEnd={`url(#${uid}-arrow-${source.kind})`} />
                    {lit && <path className="architecture-edge-flow" d={d} fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeDasharray="3 13" strokeLinecap="round" />}
                    <path d={d} fill="none" stroke="transparent" strokeWidth="12" />
                  </g>
                );
              })}

              {layout.nodes.map(item => (
                <ComponentCard
                  key={item.node.id}
                  item={item}
                  uid={uid}
                  selected={item.node.id === selectedId}
                  active={!focus || focus.nodes.has(item.node.id)}
                  onSelect={() => selectNode(item.node.id)}
                  onOpen={() => { setSelectedId(item.node.id); setDetailsOpen(true); }}
                  onHover={hovering => setHoverId(hovering ? item.node.id : null)}
                />
              ))}

              {labelledEdges.map(item => {
                const text = truncate(item.edge.label, EDGE_LABEL_MAX_CHARS);
                const width = edgeLabelWidth(item.edge.label);
                return (
                  <g key={`label-${item.edge.id}`} className="architecture-edge-label" transform={`translate(${item.labelAt[0]},${item.labelAt[1]})`}>
                    <rect x={-width / 2} y="-9" width={width} height="18" rx="5" fill="#FFFFFF" stroke={KIND_STYLE[nodeById.get(item.edge.source)!.kind].stroke} strokeOpacity="0.45" />
                    <text textAnchor="middle" y="3.5" fontSize="10" fill={KIND_STYLE[nodeById.get(item.edge.source)!.kind].text}>{text}</text>
                  </g>
                );
              })}

              <g transform={`translate(${layout.lanes[0]?.x ?? 0},${layout.legendY})`}>
                <text y="14" fontSize="13" fontWeight="700" fill={INK}>Legend</text>
                {legendItems.map(({ kind, count, textWidth, x }) => {
                    const style = KIND_STYLE[kind];
                    const width = textWidth + 54;
                    return (
                      <g
                        key={kind}
                        className={`architecture-legend-item${lensKind === kind ? ' is-on' : ''}${lensKind && lensKind !== kind ? ' is-off' : ''}`}
                        transform={`translate(${x},30)`}
                        role="button"
                        tabIndex={0}
                        aria-pressed={lensKind === kind}
                        aria-label={`Highlight ${style.label} components`}
                        onClick={() => { setSelectedId(null); setLensKind(current => (current === kind ? null : kind)); }}
                        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(null); setLensKind(current => (current === kind ? null : kind)); } }}
                      >
                        <rect x="-6" y="-6" width={width + 8} height="28" rx="8" fill="transparent" className="architecture-legend-hit" />
                        <rect x="0" y="2" width="14" height="12" rx="3" fill={style.fill} stroke={style.stroke} strokeWidth="1.5" />
                        <text x="20" y="12.5" fontSize="11.5" fill={MUTED}>{style.label}</text>
                        <circle cx={textWidth + 34} cy="8" r="9" fill="#FFFFFF" stroke="#CBD5E1" />
                        <text x={textWidth + 34} y="11.5" fontSize="10" textAnchor="middle" fill={MUTED}>{count}</text>
                      </g>
                    );
                })}
              </g>
            </svg>
          </div>

          {selected && (
            <div className="architecture-focus-bar" role="toolbar" aria-label="Trace controls">
              <span className="architecture-focus-name">
                <i style={{ background: KIND_STYLE[selected.kind].fill, borderColor: KIND_STYLE[selected.kind].stroke }} />
                {selected.label}
              </span>
              <span className="architecture-focus-modes">
                {(['direct', 'downstream', 'upstream'] as TraceMode[]).map(mode => (
                  <button key={mode} type="button" className={traceMode === mode ? 'is-on' : ''} onClick={() => setTraceMode(mode)}>
                    {mode === 'direct' ? 'Direct' : mode === 'downstream' ? 'Downstream' : 'Upstream'}
                  </button>
                ))}
              </span>
              <span className="architecture-focus-count"><Crosshair size={12} />{focus?.reached ?? 0} reached</span>
              <Button type="button" variant="ghost" onClick={() => setDetailsOpen(true)}><Info size={13} />Details</Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSelectedId(null)} aria-label="Clear trace"><X size={14} /></Button>
            </div>
          )}

        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={open => setDetailsOpen(open)}>
        <DialogContent
          className="modal architecture-details-dialog p-0 gap-0 border-0 rounded-none shadow-none bg-transparent max-w-none sm:max-w-none"
          showCloseButton={false}
        >
          <div className="modal-header">
            <div className="modal-title"><Boxes size={16} strokeWidth={1.8} /> Component details</div>
            <Button type="button" variant="ghost" size="icon-sm" className="modal-close" onClick={() => setDetailsOpen(false)} aria-label="Close"><X size={15} strokeWidth={1.9} /></Button>
          </div>
          <div className="modal-body architecture-details">
            {selected ? <ComponentDetails node={selected} graph={graph} onOpenFile={onOpenFile} onSelectNode={setSelectedId} /> : <p>Select a component in the diagram.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ComponentCard({ item, uid, selected, active, onSelect, onOpen, onHover }: {
  item: PlacedNode;
  uid: string;
  selected: boolean;
  active: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const { node } = item;
  const style = KIND_STYLE[node.kind];
  const { Icon } = style;
  const folder = commonFolder(node.paths);
  const files = `${node.paths.length} file${node.paths.length === 1 ? '' : 's'}`;
  const sublabel = `${truncateStart(folder || 'repo root', charsFor(NODE_W - 46, 10) - files.length - 3)} · ${files}`;
  return (
    <g
      className={`architecture-node${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
      transform={`translate(${item.x},${item.y})`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${node.label}, ${style.label} component, ${files}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); onOpen(); }
        if (event.key === ' ') { event.preventDefault(); onSelect(); }
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <title>{node.description}</title>
      {selected && <rect x="-5" y="-5" width={NODE_W + 10} height={NODE_H + 10} rx="14" fill="none" stroke={style.stroke} strokeOpacity="0.28" strokeWidth="5" />}
      <rect className="architecture-node-box" width={NODE_W} height={NODE_H} rx="10" fill={style.fill} stroke={style.stroke} strokeWidth={selected ? 2.4 : 1.5} filter={`url(#${uid}-shadow)`} />
      <rect x="1" y="12" width="3" height={NODE_H - 24} rx="1.5" fill={style.stroke} />
      <Icon x={14} y={15} width={16} height={16} color={style.stroke} strokeWidth={2} aria-hidden="true" />
      <text x="38" y="28" fontSize="13" fontWeight="700" fill={INK}>{truncate(node.label, charsFor(NODE_W - 50, 13))}</text>
      <text x="38" y="47" fontSize="10" fill={style.text} fillOpacity="0.82">{sublabel}</text>
    </g>
  );
}

function ComponentDetails({ node, graph, onOpenFile, onSelectNode }: {
  node: ArchitectureNode;
  graph: ArchitectureGraph;
  onOpenFile?: (path: string) => void;
  onSelectNode: (id: string) => void;
}) {
  const nodeById = new Map(graph.nodes.map(item => [item.id, item]));
  const outgoing = graph.edges.filter(edge => edge.source === node.id);
  const incoming = graph.edges.filter(edge => edge.target === node.id);
  const connectionCount = outgoing.length + incoming.length;

  return <>
    <div className="architecture-details-head">
      <div className={`architecture-kind architecture-kind-${node.kind}`}>{node.kind}</div>
      <h2>{node.label}</h2>
      <p>{node.description}</p>
    </div>

    {connectionCount > 0 && (
      <section className="architecture-details-section">
        <h3>Connections <span className="architecture-details-count">{connectionCount}</span></h3>
        <div className="architecture-connections">
          {outgoing.map(edge => {
            const target = nodeById.get(edge.target);
            return target ? (
              <Button type="button" variant="ghost" key={edge.id} className="architecture-connection" onClick={() => onSelectNode(target.id)}>
                <span className="architecture-connection-dir is-uses"><ArrowUpRight size={11} strokeWidth={2.4} /> uses</span>
                <span className="architecture-connection-name">{target.label}</span>
                {edge.label && edge.label !== 'depends on' && <em>{edge.label}</em>}
              </Button>
            ) : null;
          })}
          {incoming.map(edge => {
            const source = nodeById.get(edge.source);
            return source ? (
              <Button type="button" variant="ghost" key={edge.id} className="architecture-connection" onClick={() => onSelectNode(source.id)}>
                <span className="architecture-connection-dir is-usedby"><ArrowDownLeft size={11} strokeWidth={2.4} /> used by</span>
                <span className="architecture-connection-name">{source.label}</span>
                {edge.label && edge.label !== 'depends on' && <em>{edge.label}</em>}
              </Button>
            ) : null;
          })}
        </div>
      </section>
    )}

    <section className="architecture-details-section">
      <h3>Repository evidence <span className="architecture-details-count">{node.paths.length}</span></h3>
      <div className="architecture-files">
        {node.paths.map(path => {
          const fileName = path.split('/').pop() || path;
          const folder = path.slice(0, Math.max(0, path.length - fileName.length - 1));
          return (
            <Button type="button" variant="ghost" key={path} className="architecture-file" onClick={() => onOpenFile?.(path)}>
              <FileCode2 size={14} strokeWidth={1.8} />
              <span className="architecture-file-copy">
                <strong>{fileName}</strong>
                {folder && <em>{folder}</em>}
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  </>;
}
