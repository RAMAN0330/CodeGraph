import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import GraphologyGraph from 'graphology';
import Sigma from 'sigma';
import { EdgeArrowProgram } from 'sigma/rendering';
import { deriveFocusedGraph, type GroupedGraphModel } from '../services/groupedGraph';
import { LABEL_COLOR, drawGroupedNodeLabel, releaseWebglContext } from './groupedSigmaRendering';

export interface GroupedSigmaGraphHandle {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  reset(): void;
  focusNode(id: string): void;
  refresh(): void;
}

export interface GroupedSigmaGraphProps {
  model: GroupedGraphModel;
  selectedId: string | null;
  focusMode: 'all' | 'selected-only';
  onSelectNode(id: string): void;
  onOpenFile?: (path: string) => void;
  onStageClick(): void;
  onTooltip?: (tooltip: { title: string; content: string } | null) => void;
  onToggleFolder(id: string): void;
}

const FOLDER_COLORS = ['#61afef', '#98c379', '#c678dd', '#e5c07b', '#56b6c2', '#e06c75'];

function folderColor(folderId: string): string {
  let hash = 0;
  for (let index = 0; index < folderId.length; index += 1) hash = ((hash << 5) - hash + folderId.charCodeAt(index)) | 0;
  return FOLDER_COLORS[Math.abs(hash) % FOLDER_COLORS.length];
}

const GroupedSigmaGraph = forwardRef<GroupedSigmaGraphHandle, GroupedSigmaGraphProps>(function GroupedSigmaGraph(props, ref) {
  const { model, selectedId, focusMode, onToggleFolder } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Sigma | null>(null);
  const graphRef = useRef<GraphologyGraph | null>(null);
  const overlaysRef = useRef(new Map<string, HTMLDivElement>());
  const controlsRef = useRef(new Map<string, HTMLDivElement>());
  const hoveredNodeRef = useRef<string | null>(null);
  const interactionRef = useRef({ selectedId, focusMode, focused: deriveFocusedGraph(model, selectedId) });
  const callbacksRef = useRef(props);
  const [webglError, setWebglError] = useState(false);

  callbacksRef.current = props;
  interactionRef.current = { selectedId, focusMode, focused: deriveFocusedGraph(model, selectedId) };

  useImperativeHandle(ref, () => ({
    zoomIn: () => { void rendererRef.current?.getCamera().animatedZoom({ duration: 180 }); },
    zoomOut: () => { void rendererRef.current?.getCamera().animatedUnzoom({ duration: 180 }); },
    fit: () => { void rendererRef.current?.getCamera().animatedReset({ duration: 250 }); },
    reset: () => { void rendererRef.current?.getCamera().animatedReset({ duration: 250 }); },
    focusNode: (id: string) => {
      const renderer = rendererRef.current;
      const graph = graphRef.current;
      if (!renderer || !graph?.hasNode(id)) return;
      const displayData = renderer.getNodeDisplayData(id);
      if (displayData) void renderer.getCamera().animate(displayData, { duration: 300 });
    },
    refresh: () => { rendererRef.current?.refresh(); },
  }), []);

  useEffect(() => {
    rendererRef.current?.refresh();
  }, [selectedId, focusMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !model.nodes.length) return;

    const canvas = document.createElement('canvas');
    const probeContext = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!probeContext) {
      setWebglError(true);
      return;
    }
    releaseWebglContext(probeContext);

    const graph = new GraphologyGraph({ multi: false, type: 'directed' });
    for (const node of model.visibleNodes) graph.addNode(node.id, {
      x: node.x,
      y: node.y,
      label: node.label,
      size: Math.max(5, Math.min(12, 5 + Math.sqrt(node.degree + 1))),
      color: folderColor(node.folderId),
      path: node.path,
      folderId: node.folderId,
      extension: node.extension,
      incoming: node.incoming,
      outgoing: node.outgoing,
    });
    for (const edge of model.edges) {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        size: Math.min(3, .7 + Math.log2(edge.count + 1)),
        color: edge.crossFolder ? '#596675' : '#3f4854',
        type: 'arrow',
      });
    }
    graphRef.current = graph;

    let renderer: Sigma;
    try {
      renderer = new Sigma(graph, container, {
        renderLabels: true,
        labelDensity: 1,
        labelGridCellSize: 90,
        labelRenderedSizeThreshold: 5,
        labelColor: { color: LABEL_COLOR },
        defaultDrawNodeLabel: drawGroupedNodeLabel,
        defaultDrawNodeHover: drawGroupedNodeLabel,
        minCameraRatio: .04,
        defaultEdgeType: 'arrow',
        edgeProgramClasses: { arrow: EdgeArrowProgram },
        stagePadding: 36,
        zIndex: true,
        nodeReducer: (node, data) => {
          const { selectedId: activeId, focusMode: activeMode, focused } = interactionRef.current;
          const hovered = hoveredNodeRef.current === node;
          const related = !activeId || focused.relatedNodeIds.has(node);
          return {
            ...data,
            color: related ? data.color : '#4b515b',
            hidden: Boolean(activeId && activeMode === 'selected-only' && !related),
            forceLabel: node === activeId || hovered,
            highlighted: node === activeId || hovered,
            zIndex: node === activeId ? 3 : hovered ? 2 : related ? 1 : 0,
          };
        },
        edgeReducer: (edge, data) => {
          const { selectedId: activeId, focusMode: activeMode, focused } = interactionRef.current;
          const related = !activeId || focused.relatedEdgeIds.has(edge);
          return {
            ...data,
            color: activeId ? related ? '#abb2bf' : '#343a43' : data.color,
            hidden: Boolean(activeId && activeMode === 'selected-only' && !related),
            size: related && activeId ? Math.max(1.8, Number(data.size)) : data.size,
            type: 'arrow',
            zIndex: related ? 1 : 0,
          };
        },
      });
    } catch {
      graph.clear();
      graphRef.current = null;
      setWebglError(true);
      return;
    }
    rendererRef.current = renderer;

    const tooltipFor = (node: string) => {
      const data = graph.getNodeAttributes(node);
      return {
        title: String(data.label),
        content: `${String(data.path)}\n${String(data.extension || 'file')} · ${Number(data.incoming)} in / ${Number(data.outgoing)} out`,
      };
    };
    const syncOverlays = () => {
      for (const group of model.groups) {
        const overlay = overlaysRef.current.get(group.id);
        const controls = controlsRef.current.get(group.id);
        if (!overlay && !controls) continue;
        const first = renderer.graphToViewport({ x: group.x, y: group.y });
        const second = renderer.graphToViewport({ x: group.x + group.width, y: group.y + group.height });
        const left = Math.min(first.x, second.x);
        const top = Math.min(first.y, second.y);
        const transform = `translate(${left}px, ${top}px)`;
        const width = `${Math.abs(second.x - first.x)}px`;
        if (overlay) {
          overlay.style.transform = transform;
          overlay.style.width = width;
          overlay.style.height = `${Math.abs(second.y - first.y)}px`;
        }
        if (controls) {
          controls.style.transform = transform;
          controls.style.width = width;
        }
      }
    };

    renderer.on('afterRender', syncOverlays);
    renderer.getCamera().on('updated', syncOverlays);
    renderer.on('clickNode', ({ node }) => {
      const { onSelectNode, onOpenFile } = callbacksRef.current;
      onSelectNode(node);
      onOpenFile?.(String(graph.getNodeAttribute(node, 'path')));
    });
    renderer.on('enterNode', ({ node }) => {
      hoveredNodeRef.current = node;
      renderer.refresh();
      callbacksRef.current.onTooltip?.(tooltipFor(node));
    });
    renderer.on('leaveNode', () => {
      hoveredNodeRef.current = null;
      renderer.refresh();
      callbacksRef.current.onTooltip?.(null);
    });
    renderer.on('clickStage', () => {
      hoveredNodeRef.current = null;
      callbacksRef.current.onTooltip?.(null);
      callbacksRef.current.onStageClick();
    });
    renderer.refresh();

    return () => {
      renderer.getCamera().off('updated', syncOverlays);
      renderer.off('afterRender', syncOverlays);
      renderer.kill();
      graph.clear();
      hoveredNodeRef.current = null;
      callbacksRef.current.onTooltip?.(null);
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [model]);

  if (!model.nodes.length) return <div className="graph-empty-state">No dependency nodes match this filter.</div>;
  if (webglError) return <div className="graph-empty-state">WebGL is unavailable. Enable hardware acceleration to view the code graph.</div>;

  const focusedFolderIds = new Set(model.visibleNodes
    .filter(node => interactionRef.current.focused.relatedNodeIds.has(node.id))
    .map(node => node.folderId));

  return <div className="grouped-sigma-graph" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
    {model.groups.map(group => <div
      key={group.id}
      ref={element => { if (element) overlaysRef.current.set(group.id, element); else overlaysRef.current.delete(group.id); }}
      className={`folder-group-overlay${selectedId && !focusedFolderIds.has(group.id) ? ' is-muted' : ''}`}
      style={{
        position: 'absolute', zIndex: 1, pointerEvents: 'none', boxSizing: 'border-box',
        border: '1px solid #3e4652', borderRadius: 12, background: 'rgba(33,37,43,.54)',
        opacity: selectedId && !focusedFolderIds.has(group.id) ? .28 : 1,
      }}
    />)}
    {model.groups.map(group => <div
      key={group.id}
      ref={element => { if (element) controlsRef.current.set(group.id, element); else controlsRef.current.delete(group.id); }}
      className="folder-group-controls"
      style={{
        position: 'absolute', zIndex: 3, pointerEvents: 'none', boxSizing: 'border-box', height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '0 12px', color: LABEL_COLOR, fontSize: 12, fontWeight: 600,
      }}
    >
      <div className="folder-group-heading" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span>{group.label}</span>
        <span>{group.visibleFiles}/{group.totalFiles}</span>
      </div>
      {group.totalFiles > 40 && <button type="button" style={{
        pointerEvents: 'auto', color: LABEL_COLOR, background: '#2c313a', border: '1px solid #596675',
        borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
      }} onClick={() => onToggleFolder(group.id)}>{group.expanded ? 'Collapse' : 'Expand'}</button>}
    </div>)}
    <div ref={containerRef} className="grouped-sigma-stage" style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'transparent' }} />
  </div>;
});

export default GroupedSigmaGraph;
