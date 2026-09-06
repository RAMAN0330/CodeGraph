import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Icon } from '../../../shared/components/Icon';
import { highlightSyntax } from '../../analysis/services/parser';
import { buildCodeCanvasNodes, buildCodeCanvasLinks } from '../services/codeCanvasGraph';
import type { CodeCanvasNode } from '../services/codeCanvasGraph';

interface CodeCanvasFile {
  path: string;
  name: string;
  folder?: string;
  layer?: string;
  lines?: number;
  functions?: unknown[];
}

interface FetchResult {
  content: string | null;
  error?: string | null;
}

interface Props {
  data: { files: CodeCanvasFile[]; connections: any[] } | null;
  folderFilter: string | null;
  colorMap: Record<string, string>;
  selected: any;
  onSelectFile: (path: string) => void;
  onFetchFileContent: (path: string) => Promise<FetchResult>;
}

type SimNode = CodeCanvasNode & d3.SimulationNodeDatum;
type SimLink = { source: string | SimNode; target: string | SimNode; count: number };

type CardState = { status: 'loading' } | { status: 'ready'; content: string } | { status: 'error'; error: string };

const CARD_MAX_HEIGHT = 240;

export default function CodeCanvas({ data, folderFilter, colorMap, selected, onSelectFile, onFetchFileContent }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardsLayerRef = useRef<HTMLDivElement>(null);
  const cardElRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const nodePosRef = useRef<Record<string, { x: number; y: number }>>({});
  const nodeIdsRef = useRef<Set<string>>(new Set());
  const openPathsRef = useRef<string[]>([]);
  const contentByPathRef = useRef<Record<string, CardState>>({});
  const onSelectFileRef = useRef(onSelectFile);
  onSelectFileRef.current = onSelectFile;
  const onFetchFileContentRef = useRef(onFetchFileContent);
  onFetchFileContentRef.current = onFetchFileContent;

  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [contentByPath, setContentByPath] = useState<Record<string, CardState>>({});
  const [fileByPath, setFileByPath] = useState<Record<string, CodeCanvasFile>>({});

  openPathsRef.current = openPaths;
  contentByPathRef.current = contentByPath;

  function loadCard(path: string) {
    if (contentByPathRef.current[path]) return;
    setContentByPath(prev => ({ ...prev, [path]: { status: 'loading' } }));
    onFetchFileContentRef.current(path).then(res => {
      setContentByPath(prev => ({
        ...prev,
        [path]: res && res.content != null
          ? { status: 'ready', content: res.content }
          : { status: 'error', error: (res && res.error) || 'File not accessible' },
      }));
    }).catch((e: any) => {
      setContentByPath(prev => ({ ...prev, [path]: { status: 'error', error: e?.message || 'Failed to load file' } }));
    });
  }

  function handleNodeClick(path: string) {
    onSelectFileRef.current(path);
    if (openPathsRef.current.includes(path)) {
      setOpenPaths(prev => prev.filter(p => p !== path));
    } else {
      setOpenPaths(prev => [...prev, path]);
      loadCard(path);
    }
  }

  const handleNodeClickRef = useRef(handleNodeClick);
  handleNodeClickRef.current = handleNodeClick;

  function closeCard(path: string) {
    setOpenPaths(prev => prev.filter(p => p !== path));
  }

  // Drop cards for files that fell out of the current node set (folder filter, re-analysis).
  useEffect(() => {
    const files = (data && data.files) || [];
    const byPath: Record<string, CodeCanvasFile> = {};
    files.forEach(f => { byPath[f.path] = f; });
    setFileByPath(byPath);
    setOpenPaths(prev => prev.filter(p => nodeIdsRef.current.size === 0 || nodeIdsRef.current.has(p)));
  }, [data]);

  useEffect(function () {
    if (!data || !containerRef.current) return;
    const el = containerRef.current;
    const container = d3.select(el);
    container.selectAll('svg').remove();
    container.selectAll('.treemap-tooltip').remove();
    const w = el.clientWidth || 800, h = el.clientHeight || 600;
    const svg = container.append('svg').attr('width', w).attr('height', h);
    const g = svg.append('g');

    const filteredFiles = folderFilter
      ? data.files.filter(f => f.folder === folderFilter || (f.folder || '').startsWith(folderFilter + '/'))
      : data.files;
    const nodesData = buildCodeCanvasNodes(filteredFiles);
    const nodeIds = new Set(nodesData.map(n => n.id));
    nodeIdsRef.current = nodeIds;
    const linksData = buildCodeCanvasLinks(data.connections || [], nodeIds);

    const folders = Array.from(new Set(nodesData.map(n => n.folder)));
    const folderAngle: Record<string, number> = {};
    folders.forEach((f, i) => { folderAngle[f] = (i / Math.max(1, folders.length)) * Math.PI * 2; });

    const nodes: SimNode[] = nodesData.map(n => {
      const prev = nodePosRef.current[n.id];
      const angle = folderAngle[n.folder];
      const seedR = 130 + Math.random() * 70;
      return {
        ...n,
        x: prev ? prev.x : w / 2 + Math.cos(angle) * seedR,
        y: prev ? prev.y : h / 2 + Math.sin(angle) * seedR,
      };
    });
    const links: SimLink[] = linksData.map(l => ({ ...l }));

    const tooltip = container.append('div').attr('class', 'treemap-tooltip').style('display', 'none').style('position', 'absolute');

    const linkSel = g.selectAll('line.code-link').data(links).join('line').attr('class', 'code-link')
      .attr('stroke', 'var(--border)').attr('stroke-width', 1).attr('stroke-opacity', 0.35);

    const nodeSel = g.selectAll('g.code-node').data(nodes, (d: any) => d.id).join('g').attr('class', 'code-node').style('cursor', 'pointer');
    nodeSel.append('circle')
      .attr('r', (d: any) => 4 + Math.min(6, Math.sqrt(d.fnCount || 1)))
      .attr('fill', (d: any) => colorMap[d.folder] || '#4d9fff')
      .attr('stroke', 'var(--bg0)').attr('stroke-width', 1.2);
    nodeSel.append('text').attr('class', 'code-node-label').attr('dy', -10).attr('text-anchor', 'middle')
      .attr('font-size', '9px').attr('fill', 'var(--t1)').style('pointer-events', 'none').style('opacity', 0)
      .text((d: any) => (d.name.length > 20 ? d.name.slice(0, 18) + '…' : d.name));

    nodeSel.on('mouseenter', function (this: any, e: any, d: any) {
      d3.select(this).select('text.code-node-label').style('opacity', 1);
      d3.select(this).select('circle').transition().duration(120).attr('r', 4 + Math.min(6, Math.sqrt(d.fnCount || 1)) + 2);
      tooltip.html(
        '<div class="treemap-tooltip-title">' + d.name + '</div>' +
        '<div class="treemap-tooltip-stat"><span>Lines:</span><span>' + d.lines + '</span></div>' +
        '<div class="treemap-tooltip-stat"><span>Functions:</span><span>' + d.fnCount + '</span></div>'
      ).style('display', 'block').style('left', (e.offsetX + 15) + 'px').style('top', (e.offsetY + 15) + 'px');
    }).on('mousemove', function (e: any) {
      tooltip.style('left', (e.offsetX + 15) + 'px').style('top', (e.offsetY + 15) + 'px');
    }).on('mouseleave', function (this: any, _e: any, d: any) {
      d3.select(this).select('text.code-node-label').style('opacity', 0);
      d3.select(this).select('circle').transition().duration(120).attr('r', 4 + Math.min(6, Math.sqrt(d.fnCount || 1)));
      tooltip.style('display', 'none');
    }).on('click', function (e: any, d: any) {
      e.stopPropagation();
      handleNodeClickRef.current(d.id);
    });

    const zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', function (e: any) {
      g.attr('transform', e.transform);
      if (cardsLayerRef.current) {
        cardsLayerRef.current.style.transform = 'translate(' + e.transform.x + 'px,' + e.transform.y + 'px) scale(' + e.transform.k + ')';
      }
    });
    svg.call(zoom as any);

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d: any) => d.id).distance(46).strength(0.25))
      .force('charge', d3.forceManyBody().strength(-90))
      .force('collide', d3.forceCollide(16))
      .force('x', d3.forceX<SimNode>((d: any) => w / 2 + Math.cos(folderAngle[d.folder]) * 160).strength(0.05))
      .force('y', d3.forceY<SimNode>((d: any) => h / 2 + Math.sin(folderAngle[d.folder]) * 160).strength(0.05))
      .alpha(0.9).alphaDecay(0.035);

    sim.on('tick', function () {
      linkSel.attr('x1', (d: any) => (d.source as SimNode).x!).attr('y1', (d: any) => (d.source as SimNode).y!)
        .attr('x2', (d: any) => (d.target as SimNode).x!).attr('y2', (d: any) => (d.target as SimNode).y!);
      nodeSel.attr('transform', (d: any) => 'translate(' + d.x + ',' + d.y + ')');
      nodes.forEach(n => { nodePosRef.current[n.id] = { x: n.x!, y: n.y! }; });
      openPathsRef.current.forEach(path => {
        const cardEl = cardElRefs.current[path];
        const pos = nodePosRef.current[path];
        if (cardEl && pos) {
          cardEl.style.left = (pos.x + 16) + 'px';
          cardEl.style.top = (pos.y - Math.min(cardEl.offsetHeight || 120, CARD_MAX_HEIGHT) / 2) + 'px';
          cardEl.style.visibility = 'visible';
        }
      });
    });

    svg.on('click', function () {
      // Clicking empty canvas space doesn't clear selection here — folders/legend already own that gesture.
    });

    return function () { sim.stop(); };
  }, [data, folderFilter, colorMap]);

  const files = (data && data.files) || [];
  const hasNodes = files.length > 0;

  return (
    <div className="code-canvas" ref={containerRef}>
      <div className="code-canvas-cards" ref={cardsLayerRef}>
        {openPaths.map(path => {
          const file = fileByPath[path];
          const name = file ? file.name : path.split('/').pop() || path;
          const entry = contentByPath[path];
          const pos = nodePosRef.current[path];
          const style = pos
            ? { left: (pos.x + 16) + 'px', top: (pos.y - 90) + 'px' }
            : { visibility: 'hidden' as const };
          return (
            <div
              key={path}
              className={'code-card' + (selected && selected.path === path ? ' active' : '')}
              style={style}
              ref={el => { cardElRefs.current[path] = el; }}
            >
              <div className="code-card-header">
                <Icon name="file" size="s" />
                <span className="code-card-name" title={path}>{name}</span>
                <button className="code-card-close" onClick={() => closeCard(path)} title="Close">×</button>
              </div>
              <div className="code-card-body">
                {!entry || entry.status === 'loading' ? (
                  <div className="code-card-loading"><div className="spinner" /></div>
                ) : entry.status === 'error' ? (
                  <div className="code-card-error">{entry.error}</div>
                ) : (
                  <pre className="file-preview-code">
                    {highlightSyntax(entry.content, name).map((lineHtml: string, i: number) => (
                      <div key={i} className="file-preview-line">
                        <span className="file-preview-linenum">{i + 1}</span>
                        <span className="file-preview-text" dangerouslySetInnerHTML={{ __html: lineHtml || ' ' }} />
                      </div>
                    ))}
                  </pre>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="code-canvas-hud">
        <div className="code-canvas-hint">
          {hasNodes ? 'Click a file to open its source. Click again to close. Scroll to zoom, drag to pan.' : 'No files to graph.'}
        </div>
      </div>
    </div>
  );
}
