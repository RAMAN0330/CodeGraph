import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Boxes, CheckCircle2, Clipboard, Download, FileCode2, Info, Maximize2, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react';
import { appConfig } from '../../../app/config';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

// Discrete stops, so one wheel notch or one button press is one visible jump.
// 1 means "fit the whole diagram in the canvas", which is what 100% reads as.
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const CANVAS_PADDING = 96;

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

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom(current => {
      const index = ZOOM_STEPS.findIndex(step => step > current + 1e-6);
      const at = index === -1 ? ZOOM_STEPS.length - 1 : Math.max(0, index - 1);
      return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, at + direction))];
    });
  }, []);
  const resetZoom = () => setZoom(1);

  // One notch per gesture: a trackpad emits wheel events far faster than a
  // discrete step is readable, so the rest of the inertia is dropped.
  const lastWheelAt = useRef(0);
  function onCanvasWheel(event: React.WheelEvent) {
    // Plain mouse-wheel/trackpad zooms the diagram directly (no modifier
    // key needed), matching the button controls.
    event.preventDefault();
    const now = event.timeStamp;
    if (now - lastWheelAt.current < 220) return;
    lastWheelAt.current = now;
    stepZoom(event.deltaY > 0 ? -1 : 1);
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
          //
          // htmlLabels must be off at the top level too, not just under
          // flowchart: with only the nested flag, node labels still render
          // inside <foreignObject>, which DOMPurify's SVG profile strips —
          // every component box came out empty while edge labels survived.
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', htmlLabels: false, flowchart: { curve: 'stepBefore', htmlLabels: false } });
          mermaidConfigured = true;
        }
        const result = await mermaid.render(`architecture_${Date.now()}`, mermaidSource);
        if (!cancelled) setSvg(purifierModule.default.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true } }));
      })
      .catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Unable to render the architecture.'); })
      .finally(() => { if (!cancelled) setRendering(false); });
    return () => { cancelled = true; };
  }, [graph.nodes.length, mermaidSource]);

  // Mermaid emits an intrinsically-sized SVG that is routinely wider than the
  // canvas. Sizing it from its own viewBox against the canvas makes zoom 1 mean
  // "the whole system fits", and keeps the sizing in layout so the canvas only
  // scrolls once the user has actually zoomed past the fit.
  useLayoutEffect(() => {
    const container = diagramRef.current;
    const element = container?.querySelector('svg');
    if (!container || !element) return;

    const box = element.viewBox.baseVal;
    const naturalWidth = box?.width || element.getBoundingClientRect().width;
    const naturalHeight = box?.height || element.getBoundingClientRect().height;
    if (!naturalWidth || !naturalHeight) return;

    const applyScale = () => {
      const fit = Math.min(
        (container.clientWidth - CANVAS_PADDING) / naturalWidth,
        (container.clientHeight - CANVAS_PADDING) / naturalHeight,
        1,
      );
      const scale = Math.max(fit, 0.05) * zoom;
      element.style.width = `${naturalWidth * scale}px`;
      element.style.height = `${naturalHeight * scale}px`;
    };

    applyScale();
    const observer = new ResizeObserver(applyScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [svg, zoom]);

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
      context.fillStyle = '#f6f7f9';
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
          <Button type="button" variant="ghost" onClick={generateExplanation} disabled={enriching}><Sparkles size={15} />{enriching ? 'Generating…' : 'Generate explanation'}</Button>
          <Button type="button" variant="ghost" onClick={copyMermaid}><Clipboard size={15} />Copy Mermaid</Button>
          <Button type="button" variant="ghost" onClick={downloadPng} disabled={!svg}><Download size={15} />PNG</Button>
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
            <div className="architecture-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          )}
          {!rendering && svg && (
            <div className="architecture-zoom-controls">
              <Button type="button" variant="ghost" onClick={() => stepZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} title="Zoom in"><ZoomIn size={15} /></Button>
              <Button type="button" variant="ghost" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]} title="Zoom out"><ZoomOut size={15} /></Button>
              <Button type="button" variant="ghost" onClick={resetZoom} title="Fit to view"><Maximize2 size={13} /></Button>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
          )}
          <Button type="button" variant="ghost" className="architecture-details-fab" onClick={() => setDetailsOpen(true)}>
            <Info size={14} /> Component details
          </Button>
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
