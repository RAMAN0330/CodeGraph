import { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, CheckCircle2, Clipboard, Download, FileCode2, Sparkles } from 'lucide-react';
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
  const diagramRef = useRef<HTMLDivElement>(null);

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
    Promise.all([import('mermaid'), import('@mermaid-js/layout-elk'), import('dompurify')])
      .then(async ([mermaidModule, elkModule, purifierModule]) => {
        if (cancelled) return;
        const mermaid = mermaidModule.default;
        if (!mermaidConfigured) {
          mermaid.registerLayoutLoaders(elkModule.default);
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark', layout: 'elk', flowchart: { curve: 'basis', htmlLabels: false } });
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
      if (node) setSelectedId(node.id);
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
          <h1>{repoName}</h1>
          <p>{graph.summary}</p>
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

      <div className="architecture-layout">
        <div className="architecture-canvas" ref={diagramRef}>
          {rendering && <div className="architecture-loading"><i /><span>Arranging system components…</span></div>}
          {!rendering && svg && <div className="architecture-svg" dangerouslySetInnerHTML={{ __html: svg }} />}
        </div>
        <aside className="architecture-details">
          <span className="architecture-details-label">Component details</span>
          {selected ? <ComponentDetails node={selected} onOpenFile={onOpenFile} /> : <p>Select a component in the diagram.</p>}
        </aside>
      </div>
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
