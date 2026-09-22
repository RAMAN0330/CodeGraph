import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { buildCodeCanvasNodes, buildCodeCanvasLinks } from '../services/codeCanvasGraph';
import { buildCodeFlowLayout, CARD_HEIGHT, CARD_WIDTH, type FlowCard } from '../services/codeFlowLayout';

interface CodeCanvasFile {
  path: string;
  name: string;
  folder?: string;
  layer?: string;
  lines?: number;
  functions?: unknown[];
}

interface Props {
  data: { files: CodeCanvasFile[]; connections: any[] } | null;
  folderFilter: string | null;
  colorMap: Record<string, string>;
  selected: any;
  onSelectFile: (path: string) => void;
}

interface CodeFlowCardProps {
  card: FlowCard;
  color: string;
  isSelected: boolean;
  tone: string;
  incomingCount: number;
  outgoingCount: number;
}

// Memoized so hovering one card (which retones every other card between
// normal/muted/upstream/downstream) doesn't re-render cards whose own props
// haven't changed.
const CodeFlowCard = memo(function CodeFlowCard({ card, color, isSelected, tone, incomingCount, outgoingCount }: CodeFlowCardProps) {
  return (
    <div
      data-path={card.id}
      className={`code-flow-card${isSelected ? ' is-selected' : ''}${tone}`}
      style={{ left: card.x, top: card.y, width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      <div className="code-flow-card-header">
        <span className="code-flow-dot" style={{ background: color }} />
        <span className="code-flow-name" title={card.id}>{card.name}</span>
        <span className="code-flow-meta">{card.fnCount} fn · {card.lines} ln</span>
      </div>
      <div className="code-flow-ports">
        {incomingCount > 0 && <span className="code-flow-port in">{incomingCount}</span>}
        {outgoingCount > 0 && <span className="code-flow-port out">{outgoingCount}</span>}
      </div>
    </div>
  );
});

// Below this zoom level individual cards are too small to read anyway, so
// the whole graph swaps to plain dots — this is what keeps a large repo's
// "see the shape of the flow" zoomed-out view cheap instead of laying out
// hundreds of full DOM cards nobody can read at that scale.
const DOT_ZOOM_THRESHOLD = 0.32;
// World-space padding around the viewport so cards don't pop in right at
// the edge of the screen while panning.
const VIEWPORT_OVERSCAN = 400;

interface Viewport { x: number; y: number; k: number; width: number; height: number }

export default function CodeCanvas({ data, folderFilter, colorMap, selected, onSelectFile }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const layout = useMemo(() => {
    if (!data) return null;
    const files = folderFilter
      ? data.files.filter(f => f.folder === folderFilter || (f.folder || '').startsWith(folderFilter + '/'))
      : data.files;
    const nodes = buildCodeCanvasNodes(files);
    const links = buildCodeCanvasLinks(data.connections || [], new Set(nodes.map(n => n.id)));
    return buildCodeFlowLayout(nodes, links);
  }, [data, folderFilter]);

  const cardById = useMemo(() => {
    const map = new Map<string, FlowCard>();
    layout?.cards.forEach(card => map.set(card.id, card));
    return map;
  }, [layout]);

  // Pan and zoom the whole stage — the cards are real DOM, so the same
  // transform has to drive them and the edge layer together. The transform
  // itself is applied straight to the DOM on every tick (no React involved,
  // so panning stays smooth); React only re-renders to recompute which
  // cards/edges are actually visible, and that's throttled to one update
  // per animation frame instead of once per zoom tick.
  useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage || !layout) return;

    let rafId: number | null = null;
    const publishViewport = (transform: d3.ZoomTransform) => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const rect = container.getBoundingClientRect();
        setViewport({ x: transform.x, y: transform.y, k: transform.k, width: rect.width, height: rect.height });
      });
    };

    const zoom = d3.zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.08, 1.6])
      .on('zoom', event => {
        stage.style.transform = `translate(${event.transform.x}px,${event.transform.y}px) scale(${event.transform.k})`;
        publishViewport(event.transform);
      });
    const selection = d3.select(container);
    selection.call(zoom as any);

    // This tab exists to read code, so it opens at 1:1 from the entry column
    // rather than fitting the graph — a whole repo scaled to fit is unreadable.
    // Zooming out to see the shape of the flow is one gesture away.
    const initial = d3.zoomIdentity.translate(20, 20).scale(1);
    selection.call(zoom.transform as any, initial);
    stage.style.transform = `translate(${initial.x}px,${initial.y}px) scale(${initial.k})`;
    const rect = container.getBoundingClientRect();
    setViewport({ x: initial.x, y: initial.y, k: initial.k, width: rect.width, height: rect.height });

    const resizeObserver = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      setViewport(v => (v ? { ...v, width: r.width, height: r.height } : v));
    });
    resizeObserver.observe(container);

    return () => {
      selection.on('.zoom', null);
      resizeObserver.disconnect();
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [layout]);

  const isDotMode = !!viewport && viewport.k < DOT_ZOOM_THRESHOLD;

  // Only the cards and edges intersecting the current viewport (plus a
  // margin) ever become real DOM nodes — this is what keeps a large,
  // densely-linked repo from hanging the tab: node/edge count on screen is
  // bounded by what's visible, not by how big the whole graph is.
  const visible = useMemo(() => {
    if (!layout) return null;
    if (!viewport || !viewport.width) return { cards: layout.cards, edges: isDotMode ? [] : layout.edges };
    const left = -viewport.x / viewport.k - VIEWPORT_OVERSCAN;
    const top = -viewport.y / viewport.k - VIEWPORT_OVERSCAN;
    const right = left + viewport.width / viewport.k + VIEWPORT_OVERSCAN * 2;
    const bottom = top + viewport.height / viewport.k + VIEWPORT_OVERSCAN * 2;

    const cards = layout.cards.filter(card =>
      card.x + CARD_WIDTH >= left && card.x <= right && card.y + CARD_HEIGHT >= top && card.y <= bottom
    );
    if (isDotMode) return { cards, edges: [] };

    const edges = layout.edges.filter(edge => {
      const source = cardById.get(edge.source);
      const target = cardById.get(edge.target);
      if (!source || !target) return false;
      const minX = Math.min(source.x, target.x);
      const maxX = Math.max(source.x, target.x) + CARD_WIDTH;
      const minY = Math.min(source.y, target.y);
      const maxY = Math.max(source.y, target.y) + CARD_HEIGHT;
      return maxX >= left && minX <= right && maxY >= top && minY <= bottom;
    });
    return { cards, edges };
  }, [layout, viewport, isDotMode, cardById]);

  const related = useMemo(() => {
    if (!layout || !hovered) return null;
    return {
      upstream: new Set(layout.incoming[hovered] ?? []),
      downstream: new Set(layout.outgoing[hovered] ?? []),
    };
  }, [layout, hovered]);

  if (!layout || !layout.cards.length) {
    return (
      <div className="code-canvas">
        <div className="code-canvas-hud"><div className="code-canvas-hint">No files to graph.</div></div>
      </div>
    );
  }

  function cardTone(id: string) {
    if (!related) return '';
    if (id === hovered) return ' is-focus';
    if (related.upstream.has(id)) return ' is-upstream';
    if (related.downstream.has(id)) return ' is-downstream';
    return ' is-muted';
  }

  function edgeTone(source: string, target: string) {
    if (!hovered) return '';
    if (target === hovered) return ' is-upstream';
    if (source === hovered) return ' is-downstream';
    return ' is-muted';
  }

  const upstreamCount = hovered ? (layout.incoming[hovered] ?? []).length : 0;
  const downstreamCount = hovered ? (layout.outgoing[hovered] ?? []).length : 0;

  // One stable pair of handlers on the stage, not one per card — delegation
  // via data-path (present on every card and dot) means cards never receive
  // a freshly-allocated closure prop, which is what lets React.memo below
  // actually skip re-rendering untouched cards.
  const handleMouseOver = useCallback((event: React.MouseEvent) => {
    const path = (event.target as HTMLElement).closest<HTMLElement>('[data-path]')?.dataset.path;
    if (path) setHovered(path);
  }, []);
  const handleMouseOut = useCallback((event: React.MouseEvent) => {
    const leaving = (event.target as HTMLElement).closest<HTMLElement>('[data-path]')?.dataset.path;
    const to = event.relatedTarget as HTMLElement | null;
    if (leaving && !to?.closest?.(`[data-path="${leaving}"]`)) {
      setHovered(current => (current === leaving ? null : current));
    }
  }, []);
  const handleClick = useCallback((event: React.MouseEvent) => {
    const path = (event.target as HTMLElement).closest<HTMLElement>('[data-path]')?.dataset.path;
    if (path) onSelectFile(path);
  }, [onSelectFile]);

  const visibleCards = visible?.cards ?? [];
  const visibleEdges = visible?.edges ?? [];

  return (
    <div className={`code-canvas${hovered ? ' is-tracing' : ''}${isDotMode ? ' is-dot-mode' : ''}`} ref={containerRef}>
      <div
        className="code-flow-stage"
        ref={stageRef}
        style={{ width: layout.width, height: layout.height }}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        onClick={handleClick}
      >
        {!isDotMode && (
          <svg className="code-flow-edges" width={layout.width} height={layout.height}>
            <defs>
              <marker id="code-flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
              </marker>
            </defs>
            {visibleEdges.map(edge => (
              <path
                key={edge.id}
                className={`code-flow-edge${edge.backwards ? ' is-return' : ''}${edgeTone(edge.source, edge.target)}`}
                d={edge.path}
                markerEnd="url(#code-flow-arrow)"
              />
            ))}
          </svg>
        )}

        {isDotMode
          ? visibleCards.map(card => (
              <span
                key={card.id}
                data-path={card.id}
                className={`code-flow-dot-marker${selected && selected.path === card.id ? ' is-selected' : ''}`}
                style={{ left: card.x, top: card.y, background: colorMap[card.folder] || 'var(--teal-500)' }}
                title={card.id}
              />
            ))
          : visibleCards.map(card => (
              <CodeFlowCard
                key={card.id}
                card={card}
                color={colorMap[card.folder] || 'var(--teal-500)'}
                isSelected={!!(selected && selected.path === card.id)}
                tone={cardTone(card.id)}
                incomingCount={(layout.incoming[card.id] ?? []).length}
                outgoingCount={(layout.outgoing[card.id] ?? []).length}
              />
            ))}
      </div>

      <div className="code-canvas-hud">
        <div className="code-canvas-hint">
          {isDotMode
            ? `${layout.cards.length} files · zoom in to read them`
            : hovered
              ? `${upstreamCount} file${upstreamCount === 1 ? '' : 's'} import this · it imports ${downstreamCount}`
              : 'Dependencies flow left to right. Hover a file to trace what it connects to.'}
        </div>
      </div>
    </div>
  );
}
