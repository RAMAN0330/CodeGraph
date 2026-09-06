import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, CheckCircle2, Clipboard, Download, FileCode2, Info, Maximize2, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react';
import { appConfig } from '../../../app/config';
import {
  applyArchitectureEnrichment,
  buildArchitectureGraph,
  compileArchitectureMermaid,
  type ArchitectureGraph,
  type ArchitectureNode,
} from '../services/architectureGraph';

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

let mermaidConfigured = false;

export default function ArchitectureDiagram({ nodes, connections, repoName = 'Repository', onOpenFile }: Props) {
  const baseGraph = useMemo(() => buildArchitectureGraph(nodes, connections), [nodes, connections]);
  const [graph, setGraph] = useState<ArchitectureGraph>(baseGraph);
  const [selectedId, setSelectedId] = useState<string | null>(baseGraph.nodes[0]?.id ?? null);
  const [svg, setSvg] = useState('');
  const [rendering, setRendering] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const diagramRef = useRef<HTMLDivElement>(null);

  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;
  const zoomBy = (delta: number) => setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
  const resetZoom = () => setZoom(1);

  function onCanvasWheel(event: React.WheelEvent) {
    // Plain mouse-wheel/trackpad zooms the diagram directly (no modifier
    // key needed), matching the button controls.
    event.preventDefault();
    zoomBy(event.deltaY > 0 ? -0.08 : 0.08);
  }

  useEffect(() => {
    setGraph(baseGraph);
    setSelectedId(baseGraph.nodes[0]?.id ?? null);
  }, [baseGraph]);

  const mermaidSource = useMemo(() => compileArchitectureMermaid(graph), [graph]);
  const selected = graph.nodes.find(node => node.id === selectedId) ?? null;

  useEffect(() => {
    if (!graph.nodes.length) { setSvg(''); return; }
    let cancelled = false;
    setRendering(true);
    setMessage('');
    Promise.all([import('mermaid'), import('dompurify')])
      .then(async ([mermaidModule, purifierModule]) => {
        if (cancelled) return;
        const mermaid = mermaidModule.default;
        if (!mermaidConfigured) {
          // Mermaid's default (dagre) layout, not the newer @mermaid-js/layout-elk
          // engine: elk's port-based edge routing can silently drop or
          // mis-position node labels on hub components with many in/out
          // edges, rendering an empty box even though the label text and
          // color are configured correctly. Dagre doesn't have this bug.
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', flowchart: { curve: 'basis', htmlLabels: false } });
          mermaidConfigured = true;
        }
        const result = await mermaid.render(`architecture_${Date.now()}`, mermaidSource);
        if (!cancelled) setSvg(purifierModule.default.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true } }));
      })
      .catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to render the architecture.'); })
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [graph.nodes.length, mermaidSource]);

  useEffect(() => {
    const container = diagramRef.current;
    if (!container || !svg) return;
    const handler = (event: Event) => {
      const element = (event.target as Element).closest('.node');
      if (!element) return;
      const node = graph.nodes.find(item => element.id.includes(item.id));
      if (node) { setSelectedId(node.id); setDetailsOpen(true); }
    };
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [graph.nodes, svg]);

  useEffect(() => {
    if (!detailsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setDetailsOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [detailsOpen]);

  async function copyMermaid() {
    await navigator.clipboard.writeText(mermaidSource);
    setMessage('Mermaid copied to clipboard.');
  }

  async function downloadPng() {
    if (!svg) return;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(image.naturalWidth, 1400) * 2;
      canvas.height = Math.max(image.naturalHeight, 800) * 2;
      const context = canvas.getContext('2d');
      if (!context) { URL.revokeObjectURL(url); return; }
      context.scale(2, 2);
      context.fillStyle = '#181a1f';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const link = document.createElement('a');
      link.download = `${repoName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-architecture.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
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

  if (!graph.nodes.length) return (
    <section className="architecture-empty">
      <Boxes size={42} />
      <h2>No system architecture yet</h2>
      <p>Analyze a repository to derive components and their validated connections.</p>
    </section>
  );

  return (
    <section className="architecture-workspace">
      <header className="architecture-header">
        <div>
          <span className="architecture-eyebrow"><Boxes size={14} /> System Architecture</span>
        </div>
        <div className="architecture-actions">
          <button type="button" onClick={generateExplanation} disabled={enriching}><Sparkles size={15} />{enriching ? 'Generating…' : 'Generate explanation'}</button>
          <button type="button" onClick={copyMermaid}><Clipboard size={15} />Copy Mermaid</button>
          <button type="button" onClick={downloadPng} disabled={!svg}><Download size={15} />PNG</button>
        </div>
      </header>

      <div className="architecture-status">
        <span><CheckCircle2 size={14} />Validated against {nodes.length} repository files</span>
        <span>{graph.groups.length} areas · {graph.nodes.length} components · {graph.edges.length} connections</span>
        {message && <span className="architecture-message">{message}</span>}
      </div>

      <div className="architecture-layout architecture-layout-full">
        <div className="architecture-canvas" ref={diagramRef} onWheel={onCanvasWheel}>
          {rendering && <div className="architecture-loading"><i /><span>Arranging system components…</span></div>}
          {!rendering && svg && (
            <div
              className="architecture-svg"
              style={zoom === 1 ? undefined : { transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform .12s ease' }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
          {!rendering && svg && (
            <div className="architecture-zoom-controls">
              <button type="button" onClick={() => zoomBy(0.15)} disabled={zoom >= ZOOM_MAX} title="Zoom in"><ZoomIn size={15} /></button>
              <button type="button" onClick={() => zoomBy(-0.15)} disabled={zoom <= ZOOM_MIN} title="Zoom out"><ZoomOut size={15} /></button>
              <button type="button" onClick={resetZoom} title="Reset zoom"><Maximize2 size={13} /></button>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          )}
          <button type="button" className="architecture-details-fab" onClick={() => setDetailsOpen(true)}>
            <Info size={14} /> Component details
          </button>
        </div>
      </div>

      {detailsOpen && (
        <div className="architecture-details-overlay" onClick={() => setDetailsOpen(false)}>
          <div className="architecture-details-modal" onClick={event => event.stopPropagation()}>
            <div className="architecture-details-modal-header">
              <span className="architecture-details-label">Component details</span>
              <button type="button" onClick={() => setDetailsOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="architecture-details-modal-body architecture-details">
              {selected ? <ComponentDetails node={selected} onOpenFile={onOpenFile} /> : <p>Select a component in the diagram.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ComponentDetails({ node, onOpenFile }: { node: ArchitectureNode; onOpenFile?: (path: string) => void }) {
  return <>
    <div className={`architecture-kind architecture-kind-${node.kind}`}>{node.kind}</div>
    <h2>{node.label}</h2>
    <p>{node.description}</p>
    <h3>Repository evidence</h3>
    <div className="architecture-files">
      {node.paths.map(path => <button type="button" key={path} onClick={() => onOpenFile?.(path)}><FileCode2 size={14} /><span>{path}</span></button>)}
    </div>
  </>;
}
