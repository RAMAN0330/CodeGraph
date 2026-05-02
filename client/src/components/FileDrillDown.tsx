import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface FnEntry {
  name: string;
  file: string;
  code?: string;
  isExported?: boolean;
}

interface DrillDownFile {
  path: string;
  name: string;
  [key: string]: any;
}

interface Props {
  file: DrillDownFile;
  allFunctions: FnEntry[];
  onClose: () => void;
  x: number;
  y: number;
}

export default function FileDrillDown({ file, allFunctions, onClose, x, y }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const fileFns = allFunctions.filter((f) => f.file === file.path || f.file === file.id);

  const edges: { source: string; target: string }[] = [];
  for (const fn of fileFns) {
    if (!fn.code) continue;
    for (const other of fileFns) {
      if (other.name === fn.name) continue;
      if (fn.code.includes(other.name + '(') || fn.code.includes(other.name + ' (')) {
        edges.push({ source: fn.name, target: other.name });
      }
    }
  }

  useEffect(() => {
    if (!svgRef.current || !fileFns.length) return;

    const W = 380, H = 320;
    const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();

    svg.append('defs').append('marker')
      .attr('id', 'dd-arr')
      .attr('viewBox', '0 -4 10 8')
      .attr('refX', 18)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4')
      .attr('fill', '#58a6ff');

    const nodes: any[] = fileFns.map((f) => ({ id: f.name, exported: f.isExported }));
    const links: any[] = edges.map((e) => ({ source: e.source, target: e.target }));

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .stop();  // stop immediately, we'll tick manually

    // Run simulation synchronously for stable positions
    for (let i = 0; i < 300; i++) sim.tick();

    const g = svg.append('g');

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#58a6ff')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#dd-arr)');

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer');

    node.append('circle')
      .attr('r', 14)
      .attr('fill', (d: any) => d.exported ? '#1a3a1a' : '#1c2128')
      .attr('stroke', (d: any) => d.exported ? '#3fb950' : '#30363d')
      .attr('stroke-width', 1.5);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', 8)
      .attr('fill', '#f0f6fc')
      .attr('pointer-events', 'none')
      .text((d: any) => d.id.length > 10 ? d.id.slice(0, 9) + '…' : d.id);

    // Set positions once, statically
    link
      .attr('x1', (d: any) => (d.source as any).x)
      .attr('y1', (d: any) => (d.source as any).y)
      .attr('x2', (d: any) => (d.target as any).x)
      .attr('y2', (d: any) => (d.target as any).y);
    node.attr('transform', (d: any) => `translate(${(d as any).x ?? 0},${(d as any).y ?? 0})`);

    return () => {
      sim.stop();
    };
  }, [file.path]);

  const clampedX = Math.min(x, window.innerWidth - 420);
  const clampedY = Math.min(Math.max(y, 10), window.innerHeight - 380);

  return (
    <div style={{
      position: 'fixed',
      left: clampedX,
      top: clampedY,
      width: 400,
      zIndex: 3000,
      background: 'rgba(22,27,34,0.98)',
      border: '1px solid #30363d',
      borderRadius: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid #21262d',
      }}>
        <span style={{
          color: '#f0f6fc',
          fontSize: 13,
          fontWeight: 600,
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {file.name || file.id} &mdash; {fileFns.length} function{fileFns.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 4px',
          }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {fileFns.length === 0 ? (
        <div style={{
          padding: 24,
          color: '#484f58',
          fontSize: 13,
          textAlign: 'center',
        }}>
          No functions found in this file
        </div>
      ) : (
        <svg
          ref={svgRef}
          style={{ display: 'block', background: '#0d1117' }}
        />
      )}
    </div>
  );
}
