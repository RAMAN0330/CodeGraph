import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChevronDown } from 'lucide-react';
import { Icon } from '../../../shared/components/Icon';
import { COLORS, LAYER_COLORS, renderTooltipHtml } from '../../analysis/services/parser';
import CodeCanvas from './CodeCanvas';

type VizType = 'dendro' | 'bundle' | 'code';
type ColorMode = 'folder' | 'layer' | 'churn';

interface Props {
  data: any;
  loading: boolean;
  progress: string;
  folderFilter: string | null;
  selected: any;
  blastRadius: any;
  activeSection: string;
  onSelectFile: (path: string) => void;
  onFilterFolder: (folder: string) => void;
  onClearSelection: () => void;
  onFetchFileContent: (path: string) => Promise<{ content: string | null; error?: string | null }>;
  className?: string;
}

function iconLabel(name: string, label: string) {
  return (
    <>
      <Icon name={name} size="s" /> {label}
    </>
  );
}

export default function RepositoryGraphCanvas({ data, loading, progress, folderFilter, selected, blastRadius, activeSection, onSelectFile, onFilterFolder, onClearSelection, onFetchFileContent, className }: Props) {
  const dendroRef = useRef<HTMLDivElement>(null);
  const bundleRef = useRef<HTMLDivElement>(null);

  const [vizType, setVizType] = useState<VizType>('dendro');
  const [colorMode] = useState<ColorMode>('folder');
  const [legendCollapsed, setLegendCollapsed] = useState(true);

  const onSelectFileRef = useRef(onSelectFile);
  onSelectFileRef.current = onSelectFile;
  const onFilterFolderRef = useRef(onFilterFolder);
  onFilterFolderRef.current = onFilterFolder;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    if (!data) return m;
    if (colorMode === 'folder') {
      (data.folders || []).forEach((f: string, i: number) => { m[f] = COLORS[i % COLORS.length]; });
      m['root'] = COLORS[0];
    } else if (colorMode === 'layer') {
      (data.files || []).forEach((f: any) => { m[f.path] = (LAYER_COLORS as Record<string, string>)[f.layer] || COLORS[0]; });
    } else if (colorMode === 'churn') {
      const maxC = Math.max.apply(null, (data.files || []).map((f: any) => f.churn || 0)) || 1;
      (data.files || []).forEach((f: any) => { const r = (f.churn || 0) / maxC; m[f.path] = r > 0.7 ? '#ff5f5f' : r > 0.4 ? '#ff9f43' : '#22c55e'; });
    }
    return m;
  }, [data, colorMode]);

  // Tree - Radial cluster of nested folder/file hierarchy
  useEffect(function () {
    if (!data || !dendroRef.current || vizType !== 'dendro') return;
    const container = d3.select(dendroRef.current);
    container.selectAll('*').remove();
    const w = dendroRef.current.clientWidth || 800, h = dendroRef.current.clientHeight || 600;
    const svg = container.append('svg').attr('width', w).attr('height', h);
    const g = svg.append('g').attr('transform', 'translate(' + w / 2 + ',' + h / 2 + ')');
    const zoom = d3.zoom().scaleExtent([0.2, 4]).on('zoom', function (e: any) { g.attr('transform', 'translate(' + (w / 2 + e.transform.x) + ',' + (h / 2 + e.transform.y) + ') scale(' + e.transform.k + ')'); });
    svg.call(zoom as any);

    const filteredFiles = folderFilter ? (data as any).files.filter(function (f: any) { return f.folder === folderFilter || f.folder.startsWith(folderFilter + '/'); }) : (data as any).files;

    // Build full nested folder hierarchy
    const rootNode: any = { name: 'root', fullPath: '', children: [], _idx: {} };
    filteredFiles.forEach(function (f: any) {
      let parts = (f.folder || 'root').split('/').filter(Boolean);
      if (!parts.length) parts = ['root'];
      let cur = rootNode, acc = '';
      parts.forEach(function (p: any) {
        acc = acc ? acc + '/' + p : p;
        if (!cur._idx[p]) { const c = { name: p, fullPath: acc, children: [], _idx: {} }; cur._idx[p] = c; cur.children.push(c); }
        cur = cur._idx[p];
      });
      cur.children.push({ name: f.name, path: f.path, fns: f.functions.length, lines: f.lines, folder: f.folder || 'root', layer: f.layer });
    });
    function strip(n: any) { delete n._idx; if (n.children) n.children.forEach(strip); }
    strip(rootNode);

    const root = d3.hierarchy(rootNode);
    let radius = Math.min(w, h) / 2 - 60;
    // Scale radius up for larger trees so leaves don't collide
    const leafCount = root.leaves().length;
    if (leafCount > 120) radius = Math.min(w, h) / 2 - 30 + Math.sqrt(leafCount - 120) * 8;
    d3.cluster().size([2 * Math.PI, radius])(root as any);

    const tooltip = container.append('div').attr('class', 'treemap-tooltip').style('display', 'none').style('position', 'absolute');

    // Radial links
    g.selectAll('path.dendro-link').data((root as any).links()).join('path').attr('class', 'dendro-link')
      .attr('d', d3.linkRadial().angle(function (d: any) { return d.x; }).radius(function (d: any) { return d.y; }) as any)
      .attr('fill', 'none').attr('stroke', 'var(--border)').attr('stroke-width', 1.2).attr('stroke-opacity', 0.6);

    const node = g.selectAll('g.dendro-node').data((root as any).descendants()).join('g').attr('class', 'dendro-node')
      .attr('transform', function (d: any) { return 'rotate(' + (d.x * 180 / Math.PI - 90) + ') translate(' + d.y + ',0)'; }).style('cursor', 'pointer');
    node.append('circle').attr('r', function (d: any) { return d.children ? 4 : 6; })
      .attr('fill', function (d: any) { return d.children ? 'var(--bg3)' : colorMap[d.data.folder] || COLORS[0]; })
      .attr('stroke', function (d: any) { return d.children ? 'var(--t3)' : 'var(--bg0)'; }).attr('stroke-width', 1.5);

    // Leaf labels: tangent to circle, flipped on left half
    node.filter(function (d: any) { return !d.children; }).append('text')
      .attr('dy', '0.31em')
      .attr('x', function (d: any) { return d.x < Math.PI ? 8 : -8; })
      .attr('text-anchor', function (d: any) { return d.x < Math.PI ? 'start' : 'end'; })
      .attr('transform', function (d: any) { return d.x >= Math.PI ? 'rotate(180)' : null; })
      .attr('fill', 'var(--t1)').attr('font-size', '9px').attr('font-family', 'JetBrains Mono')
      .text(function (d: any) { const n = d.data.name.replace(/\.[^.]+$/, ''); return n.length > 22 ? n.slice(0, 20) + '…' : n; });

    // Folder labels
    node.filter(function (d: any) { return d.children && d.depth > 0; }).append('text')
      .attr('dy', '0.31em')
      .attr('x', function (d: any) { return d.x < Math.PI ? -8 : 8; })
      .attr('text-anchor', function (d: any) { return d.x < Math.PI ? 'end' : 'start'; })
      .attr('transform', function (d: any) { return d.x >= Math.PI ? 'rotate(180)' : null; })
      .attr('fill', 'var(--t2)').attr('font-size', '10px').attr('font-weight', '600').attr('font-family', 'JetBrains Mono')
      .text(function (d: any) { return d.data.name; });

    node.on('mouseenter', function (this: any, e: any, d: any) {
      tooltip.html(renderTooltipHtml(d.data.name || 'root', d.data.path ? [
        { label: 'Lines', value: d.data.lines || 0 },
        { label: 'Functions', value: d.data.fns || 0 },
        { label: 'Layer', value: d.data.layer || '—' },
      ] : [{ label: 'Children', value: (d.children || []).length }])).style('display', 'block').style('left', (e.offsetX + 15) + 'px').style('top', (e.offsetY + 15) + 'px');
      d3.select(this).select('circle').transition().duration(150).attr('r', function (n: any) { return n.children ? 7 : 10; }).attr('stroke', 'var(--acc)').attr('stroke-width', 2.5);
    }).on('mousemove', function (e: any) { tooltip.style('left', (e.offsetX + 15) + 'px').style('top', (e.offsetY + 15) + 'px'); })
      .on('mouseleave', function (this: any, _e: any, d: any) {
        tooltip.style('display', 'none');
        d3.select(this).select('circle').transition().duration(150).attr('r', d.children ? 4 : 6).attr('stroke', d.children ? 'var(--t3)' : 'var(--bg0)').attr('stroke-width', 1.5);
      }).on('click', function (e: any, d: any) {
        e.stopPropagation();
        if (d.data.path) onSelectFileRef.current(d.data.path);
        else if (d.data.fullPath) onFilterFolderRef.current(d.data.fullPath);
      });
  }, [data, vizType, colorMap, folderFilter, activeSection]);

  // Circular Bundle visualization - Interactive with zoom, selection, blast radius
  useEffect(function () {
    if (!data || !bundleRef.current || vizType !== 'bundle') return;
    const container = d3.select(bundleRef.current);
    container.selectAll('*').remove();
    const w = bundleRef.current.clientWidth || 800, h = bundleRef.current.clientHeight || 600;
    const svg = container.append('svg').attr('width', w).attr('height', h);
    const mainG = svg.append('g').attr('transform', 'translate(' + w / 2 + ',' + h / 2 + ')');
    const zoom = d3.zoom().scaleExtent([0.4, 3]).on('zoom', function (e: any) { mainG.attr('transform', 'translate(' + (w / 2 + e.transform.x) + ',' + (h / 2 + e.transform.y) + ') scale(' + e.transform.k + ')'); });
    svg.call(zoom as any);
    const radius = Math.min(w, h) / 2 - 100;
    const filteredFiles = folderFilter ? (data as any).files.filter(function (f: any) { return f.folder === folderFilter || f.folder.startsWith(folderFilter + '/'); }) : (data as any).files;
    const files = filteredFiles.slice(0, 70);
    const fileIdx: any = {}; files.forEach(function (f: any, i: any) { fileIdx[f.path] = i; });
    const folderGroups: any = {}; files.forEach(function (f: any) { const folder = f.folder || 'root'; if (!folderGroups[folder]) folderGroups[folder] = []; folderGroups[folder].push(f); });
    let nodes: any[] = [], angle = 0;
    const sortedFolders = Object.entries(folderGroups).sort(function (a: any, b: any) { return b[1].length - a[1].length; });
    sortedFolders.forEach(function (entry: any) {
      const folder = entry[0], fls = entry[1];
      const step = 2 * Math.PI * fls.length / files.length;
      fls.forEach(function (f: any) {
        nodes.push({ id: f.path, name: f.name, folder: folder, angle: angle, x: Math.cos(angle - Math.PI / 2) * radius, y: Math.sin(angle - Math.PI / 2) * radius, layer: f.layer, fns: f.functions.length, lines: f.lines });
        angle += step / fls.length;
      });
    });
    const nodeMap: any = {}; nodes.forEach(function (n: any) { nodeMap[n.id] = n; });
    const links: any[] = [];
    (data as any).connections.forEach(function (c: any) {
      const src = typeof c.source === 'object' ? c.source.id : c.source;
      const tgt = typeof c.target === 'object' ? c.target.id : c.target;
      if (nodeMap[src] && nodeMap[tgt] && src !== tgt) links.push({ source: nodeMap[src], target: nodeMap[tgt], count: c.count || 1 });
    });
    function isBundleLinkMatch(nodeId: any, linkDatum: any) {
      return linkDatum.source.id === nodeId || linkDatum.target.id === nodeId;
    }
    function getBundleLinkColor(linkDatum: any) {
      return colorMap[linkDatum.source.folder] || 'var(--acc)';
    }
    function getBundleDirectConnections(nodeId: any) {
      const connected = new Set([nodeId]);
      links.forEach(function (linkDatum: any) {
        if (isBundleLinkMatch(nodeId, linkDatum)) {
          connected.add(linkDatum.source.id);
          connected.add(linkDatum.target.id);
        }
      });
      return connected;
    }
    const link = mainG.selectAll('path.bundle-link').data(links).join('path').attr('class', 'bundle-link')
      .attr('d', function (d: any) {
        const a1 = d.source.angle, a2 = d.target.angle;
        const x1 = Math.cos(a1 - Math.PI / 2) * (radius - 15), y1 = Math.sin(a1 - Math.PI / 2) * (radius - 15);
        const x2 = Math.cos(a2 - Math.PI / 2) * (radius - 15), y2 = Math.sin(a2 - Math.PI / 2) * (radius - 15);
        const midAngle = (a1 + a2) / 2;
        const tension = 0.3 * radius;
        const cx = Math.cos(midAngle - Math.PI / 2) * tension, cy = Math.sin(midAngle - Math.PI / 2) * tension;
        return 'M' + x1 + ',' + y1 + 'Q' + cx + ',' + cy + ' ' + x2 + ',' + y2;
      })
      .attr('fill', 'none').attr('stroke', getBundleLinkColor)
      .attr('stroke-width', 1.8).attr('stroke-opacity', 0.35);
    const tooltip = container.append('div').attr('class', 'treemap-tooltip').style('display', 'none').style('position', 'absolute');
    const node = mainG.selectAll('g.bundle-node').data(nodes).join('g').attr('class', 'bundle-node').style('cursor', 'pointer')
      .attr('transform', function (d: any) { return 'rotate(' + (d.angle * 180 / Math.PI - 90) + ') translate(' + radius + ',0)' + (d.angle > Math.PI ? ' rotate(180)' : ''); });
    node.append('circle').attr('class', 'bundle-circle').attr('r', 6).attr('fill', function (d: any) { return colorMap[d.folder] || COLORS[0]; }).attr('stroke', 'var(--bg0)').attr('stroke-width', 1.5)
      .attr('transform', function (d: any) { return d.angle > Math.PI ? 'translate(-6,0)' : 'translate(6,0)'; });
    node.append('text').attr('dy', '0.31em').attr('x', function (d: any) { return d.angle > Math.PI ? -14 : 14; }).attr('text-anchor', function (d: any) { return d.angle > Math.PI ? 'end' : 'start'; })
      .attr('fill', 'var(--t2)').attr('font-size', '9px').text(function (d: any) { const n = d.name.replace(/\.[^.]+$/, ''); return n.length > 16 ? n.slice(0, 13) + '…' : n; });
    function applyBundleDefaultState() {
      link.transition().duration(200)
        .attr('stroke-opacity', 0.35)
        .attr('stroke-width', 1.8)
        .attr('stroke', getBundleLinkColor as any);
      node.selectAll('.bundle-circle').transition().duration(200)
        .attr('fill', function (d: any) { return colorMap[d.folder] || COLORS[0]; })
        .attr('opacity', 1)
        .attr('r', 6)
        .attr('stroke', 'var(--bg0)')
        .attr('stroke-width', 1.5);
    }
    function applyBundleHoverState(nodeId: any) {
      const directConnections = getBundleDirectConnections(nodeId);
      link.transition().duration(200)
        .attr('stroke-opacity', function (linkDatum: any) { return isBundleLinkMatch(nodeId, linkDatum) ? 0.88 : 0.04; })
        .attr('stroke-width', function (linkDatum: any) { return isBundleLinkMatch(nodeId, linkDatum) ? 3.1 : 1; })
        .attr('stroke', function (linkDatum: any) { return isBundleLinkMatch(nodeId, linkDatum) ? 'var(--acc)' : getBundleLinkColor(linkDatum); });
      node.selectAll('.bundle-circle').transition().duration(200)
        .attr('opacity', function (nodeDatum: any) { return directConnections.has(nodeDatum.id) ? 1 : 0.22; })
        .attr('r', function (nodeDatum: any) { return nodeDatum.id === nodeId ? 9 : 6; })
        .attr('stroke', function (nodeDatum: any) { return nodeDatum.id === nodeId ? 'var(--acc)' : 'var(--bg0)'; })
        .attr('stroke-width', function (nodeDatum: any) { return nodeDatum.id === nodeId ? 2 : 1.5; });
    }
    function applyBundleSelectionState(nodeId: any, blast: any) {
      const directConnections = getBundleDirectConnections(nodeId);
      const affectedSet = new Set(blast && blast.affected ? blast.affected : []);
      link.transition().duration(300)
        .attr('stroke-opacity', function (linkDatum: any) { return isBundleLinkMatch(nodeId, linkDatum) ? 0.96 : 0.08; })
        .attr('stroke-width', function (linkDatum: any) { return isBundleLinkMatch(nodeId, linkDatum) ? 3.6 : 1.15; })
        .attr('stroke', function (linkDatum: any) { return isBundleLinkMatch(nodeId, linkDatum) ? '#ff9f43' : getBundleLinkColor(linkDatum); });
      node.selectAll('.bundle-circle').transition().duration(300)
        .attr('fill', function (nodeDatum: any) { return nodeDatum.id === nodeId ? '#ff5f5f' : affectedSet.has(nodeDatum.id) ? '#ff9f43' : colorMap[nodeDatum.folder] || COLORS[0]; })
        .attr('opacity', function (nodeDatum: any) { return directConnections.has(nodeDatum.id) || affectedSet.has(nodeDatum.id) ? 1 : 0.22; })
        .attr('r', function (nodeDatum: any) { return nodeDatum.id === nodeId ? 9 : 6; })
        .attr('stroke', function (nodeDatum: any) { return nodeDatum.id === nodeId ? 'var(--acc)' : 'var(--bg0)'; })
        .attr('stroke-width', function (nodeDatum: any) { return nodeDatum.id === nodeId ? 2 : 1.5; });
    }
    node.on('mouseenter', function (e: any, d: any) {
      const rect = bundleRef.current!.getBoundingClientRect();
      tooltip.html(renderTooltipHtml(d.name, [
        { label: 'Lines', value: d.lines || 0 },
        { label: 'Functions', value: d.fns || 0 },
        { label: 'Folder', value: d.folder || 'root' },
      ]))
        .style('display', 'block').style('left', (e.clientX - rect.left + 15) + 'px').style('top', (e.clientY - rect.top + 15) + 'px');
      applyBundleHoverState(d.id);
    }).on('mousemove', function (e: any) { const rect = bundleRef.current!.getBoundingClientRect(); tooltip.style('left', (e.clientX - rect.left + 15) + 'px').style('top', (e.clientY - rect.top + 15) + 'px'); })
      .on('mouseleave', function () {
        tooltip.style('display', 'none');
        if (selected && nodeMap[selected.path]) {
          applyBundleSelectionState(selected.path, blastRadius);
        } else {
          applyBundleDefaultState();
        }
      }).on('click', function (e: any, d: any) {
        e.stopPropagation();
        onSelectFileRef.current(d.id);
      });
    const arcGen = d3.arc().innerRadius(radius + 20).outerRadius(radius + 30);
    let folderAngleStart = 0;
    sortedFolders.forEach(function (entry: any, i: any) {
      const folder = entry[0], count = entry[1].length;
      const span = 2 * Math.PI * count / files.length;
      mainG.append('path').attr('d', arcGen({ startAngle: folderAngleStart, endAngle: folderAngleStart + span } as any) as any)
        .attr('fill', colorMap[folder] || COLORS[i % COLORS.length]).attr('opacity', 0.5).style('cursor', 'pointer')
        .on('click', function () { onFilterFolderRef.current(folder); });
      if (span > 0.15) {
        const midAngle = folderAngleStart + span / 2 - Math.PI / 2;
        mainG.append('text').attr('x', Math.cos(midAngle) * (radius + 40)).attr('y', Math.sin(midAngle) * (radius + 40))
          .attr('text-anchor', 'middle').attr('fill', 'var(--t2)').attr('font-size', '8px')
          .attr('transform', 'rotate(' + (midAngle * 180 / Math.PI + 90) + ',' + Math.cos(midAngle) * (radius + 40) + ',' + Math.sin(midAngle) * (radius + 40) + ')')
          .text(folder.split('/').pop() || 'root');
      }
      folderAngleStart += span;
    });
    svg.on('click', function () {
      onClearSelectionRef.current();
      applyBundleDefaultState();
    });
    if (selected && nodeMap[selected.path]) {
      applyBundleSelectionState(selected.path, blastRadius);
    } else {
      applyBundleDefaultState();
    }
  }, [data, vizType, colorMap, folderFilter, selected, blastRadius, activeSection]);

  return (
    <div className={'canvas-area' + (className ? ' ' + className : '')}>
      {loading ? (
        <div className="loading"><div className="spinner" /><div className="loading-text">Analyzing...</div><div className="loading-progress">{progress}</div></div>
      ) : !data ? (
        <div className="empty-state">
          <div className="empty-state-glow" />
          <div className="empty-state-content">
            <Icon name="logo" size="xxl" className="empty-icon" />
            <div className="empty-title">GraphKeep</div>
            <div className="empty-desc">{'High-performance repository introspection and database visualization.\nEnter a GitHub URL above or open a local folder to get started.'}</div>
            <div className="empty-features">
              <span className="empty-feature"><Icon name="graph" size="s" /> Dependency Graph</span>
              <span className="empty-feature"><Icon name="impact" size="s" /> Blast Radius</span>
              <span className="empty-feature"><Icon name="security" size="s" /> Security Scan</span>
              <span className="empty-feature"><Icon name="puzzle" size="s" /> Pattern Detection</span>
              <span className="empty-feature"><Icon name="users" size="s" /> Code Ownership</span>
              <span className="empty-feature"><Icon name="key" size="s" /> Private Repos</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="viz-selector">
            <button className={'viz-selector-btn' + (vizType === 'dendro' ? ' active' : '')} onClick={() => setVizType('dendro')}>{iconLabel('tree', 'Tree')}</button>
            <button className={'viz-selector-btn' + (vizType === 'bundle' ? ' active' : '')} onClick={() => setVizType('bundle')}>{iconLabel('target', 'Bundle')}</button>
            <button className={'viz-selector-btn' + (vizType === 'code' ? ' active' : '')} onClick={() => setVizType('code')}>{iconLabel('code', 'Code')}</button>
          </div>
          {vizType === 'dendro' && <div ref={dendroRef} className="dendro-container" style={{ width: '100%', height: '100%', position: 'relative' }} />}
          {vizType === 'bundle' && <div ref={bundleRef} className="bundle-container" />}
          {vizType === 'code' && <CodeCanvas data={data} folderFilter={folderFilter} colorMap={colorMap} selected={selected} onSelectFile={onSelectFile} onFetchFileContent={onFetchFileContent} />}
          <div className="canvas-info">
              <div className="info-chip"><strong>{folderFilter ? data.files.filter((f: any) => f.folder === folderFilter || f.folder.startsWith(folderFilter + '/')).length : data.files.length}</strong> files</div>
              <div className="info-chip"><strong>{data.connections.length}</strong> links</div>
              {data.excludePatterns && data.excludePatterns.length > 0 && (
                <div className="info-chip"><Icon name="ban" size="s" /> <strong>{data.excludePatterns.length}</strong> custom excludes</div>
              )}
              {selected && blastRadius && (
                <div className="info-chip"><Icon name="impact" size="s" /> <strong>{blastRadius.count}</strong> dependents{blastRadius.fnsUsed > 0 ? ' • ' + blastRadius.fnsUsed + ' fns used' : ''}</div>
              )}
          </div>
          <div className={'legend' + (legendCollapsed ? ' collapsed' : '')}>
            <div className="legend-header" onClick={() => setLegendCollapsed(!legendCollapsed)}>
              <div className="legend-title" style={{ margin: 0 }}>{colorMode === 'folder' ? 'Folders' : colorMode === 'layer' ? 'Layers' : 'Churn'}</div>
              <span className="legend-toggle icon icon-s"><ChevronDown size={12} strokeWidth={1.9} /></span>
            </div>
            <div className="legend-content">
              {colorMode === 'folder' && (data.folders || []).slice(0, 12).map((f: string, i: number) => (
                <div key={f} className={'legend-item' + (folderFilter === f ? ' active' : '')} onClick={e => { e.stopPropagation(); onFilterFolder(f); }}>
                  <div className="legend-color" style={{ background: colorMap[f] || COLORS[i % COLORS.length] }} />{f || 'root'}
                </div>
              ))}
              {colorMode === 'layer' && Object.entries(LAYER_COLORS).map(([key, value]) => (
                <div key={key} className="legend-item">
                  <div className="legend-color" style={{ background: value }} />
                  {key === 'modules' ? 'Modules' : key === 'forms' ? 'UserForms' : key === 'classes' ? 'Classes' : key}
                </div>
              ))}
              {colorMode === 'churn' && (
                <>
                  <div className="legend-item"><div className="legend-color" style={{ background: '#ff5f5f' }} />High (7+ commits)</div>
                  <div className="legend-item"><div className="legend-color" style={{ background: '#ff9f43' }} />Medium (4-6)</div>
                  <div className="legend-item"><div className="legend-color" style={{ background: '#22c55e' }} />Low (0-3)</div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
