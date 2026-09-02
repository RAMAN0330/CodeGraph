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

// ─── helpers ────────────────────────────────────────────────────────────────

function getExtension(path: string): string {
  const m = path.match(/\.([^./\\]+)$/);
  return m ? m[1] : '';
}

function getLayer(file: DrillDownFile): string {
  if (file.layer) return file.layer;
  const p = (file.path || '').toLowerCase();
  if (p.includes('component')) return 'component';
  if (p.includes('page')) return 'page';
  if (p.includes('hook')) return 'hook';
  if (p.includes('util') || p.includes('lib')) return 'util';
  if (p.includes('service')) return 'service';
  if (p.includes('store') || p.includes('context')) return 'state';
  if (p.includes('api') || p.includes('route')) return 'api';
  return 'module';
}

function layerColor(layer: string): string {
  const map: Record<string, string> = {
    component: 'var(--teal-500)',
    page: '#a371f7',
    hook: 'var(--color-warning)',
    util: 'var(--color-info)',
    service: '#56d364',
    state: '#ffa657',
    api: '#ff7b72',
    module: 'var(--text-muted)',
  };
  return map[layer] ?? 'var(--text-muted)';
}

function healthColor(score: number): string {
  if (score >= 80) return 'var(--color-success)';
  if (score >= 50) return '#ffa657';
  return '#ff7b72';
}

// ─── component ──────────────────────────────────────────────────────────────

export default function FileDrillDown({ file, allFunctions, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const fileFns = allFunctions.filter(
    (f) => f.file === file.path || f.file === (file as any).id,
  );

  const exportedFns = fileFns.filter((f) => f.isExported);
  const internalFns = fileFns.filter((f) => !f.isExported);

  const edges: { source: string; target: string }[] = [];
  for (const fn of fileFns) {
    if (!fn.code) continue;
    for (const other of fileFns) {
      if (other.name === fn.name) continue;
      if (
        fn.code.includes(other.name + '(') ||
        fn.code.includes(other.name + ' (')
      ) {
        edges.push({ source: fn.name, target: other.name });
      }
    }
  }

  // ── D3 graph ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !fileFns.length) return;

    const W = 460;
    const H = 300;
    const svg = d3.select(svgRef.current).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();

    svg
      .append('defs')
      .append('marker')
      .attr('id', 'dd-arr')
      .attr('viewBox', '0 -4 10 8')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L10,0L0,4')
      .attr('fill', 'var(--teal-500)');

    const nodes: any[] = fileFns.map((f) => ({ id: f.name, exported: f.isExported }));
    const links: any[] = edges.map((e) => ({ source: e.source, target: e.target }));

    const sim = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(90))
      .force('charge', d3.forceManyBody().strength(-150))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .stop();

    for (let i = 0; i < 300; i++) sim.tick();

    const g = svg.append('g');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', 'var(--teal-500)')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#dd-arr)');

    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer');

    node
      .append('circle')
      .attr('r', 18)
      .attr('fill', (d: any) => (d.exported ? '#1a3a1a' : 'var(--surface-card)'))
      .attr('stroke', (d: any) => (d.exported ? 'var(--color-success)' : 'var(--border-subtle)'))
      .attr('stroke-width', 1.5);

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', 10)
      .attr('fill', 'var(--text-primary)')
      .attr('pointer-events', 'none')
      .text((d: any) => (d.id.length > 11 ? d.id.slice(0, 10) + '…' : d.id));

    const drag = d3
      .drag<SVGGElement, any>()
      .on('start', function (_event, d) {
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', function (event, d) {
        d.fx = event.x;
        d.fy = event.y;
        d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
        link
          .attr('x1', (l: any) => l.source.x ?? 0)
          .attr('y1', (l: any) => l.source.y ?? 0)
          .attr('x2', (l: any) => l.target.x ?? 0)
          .attr('y2', (l: any) => l.target.y ?? 0);
      })
      .on('end', function (_event, d) {
        d.fx = null;
        d.fy = null;
      });

    node.call(drag as any);

    link
      .attr('x1', (d: any) => (d.source as any).x)
      .attr('y1', (d: any) => (d.source as any).y)
      .attr('x2', (d: any) => (d.target as any).x)
      .attr('y2', (d: any) => (d.target as any).y);
    node.attr('transform', (d: any) => `translate(${(d as any).x ?? 0},${(d as any).y ?? 0})`);

    svg
      .append('text')
      .attr('x', W / 2)
      .attr('y', H - 6)
      .attr('text-anchor', 'middle')
      .attr('font-size', 9)
      .attr('fill', 'var(--text-muted)')
      .attr('pointer-events', 'none')
      .text('scroll to zoom · drag to pan · drag nodes');

    return () => {
      sim.stop();
    };
  }, [file.path]);

  // ── derived metadata ───────────────────────────────────────────────────────
  const ext = getExtension(file.path || file.name || '');
  const layer = getLayer(file);
  const loc: number = file.loc ?? file.lines ?? 0;
  const health: number | null =
    file.health != null ? file.health : file.healthScore ?? null;
  const hasIssues =
    (file.securityIssues && file.securityIssues.length > 0) ||
    (file.issues && file.issues.length > 0);
  const issueList: string[] = [
    ...(file.securityIssues ?? []),
    ...(file.issues ?? []),
  ];

  // ── styles (inline dark theme) ────────────────────────────────────────────
  const s = {
    backdrop: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.72)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } as React.CSSProperties,

    modal: {
      position: 'fixed' as const,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      width: 'min(860px, 92vw)',
      height: 'min(580px, 88vh)',
      background: 'var(--bg-canvas)',
      border: '1px solid var(--surface-subtle)',
      borderRadius: 12,
      boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      zIndex: 1001,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
    } as React.CSSProperties,
  };

  return (
    <>
      {/* backdrop — click to close */}
      <div style={s.backdrop} onClick={onClose} />

      {/* modal — stop propagation so clicking inside doesn't close */}
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* ── header bar ──────────────────────────────────────────────────── */}
        <div
          style={{
            height: 48,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            borderBottom: '1px solid var(--surface-subtle)',
            background: 'var(--surface-card)',
            flexShrink: 0,
          }}
        >
          {/* file name */}
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--teal-500)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 220,
            }}
          >
            {file.name || file.path?.split(/[/\\]/).pop() || 'Unknown'}
          </span>

          {/* full path */}
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: 'var(--text-muted)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={file.path}
          >
            {file.path}
          </span>

          {/* layer badge */}
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 10,
              border: `1px solid color-mix(in srgb, ${layerColor(layer)} 27%, transparent)`,
              color: layerColor(layer),
              background: `${layerColor(layer)}18`,
              whiteSpace: 'nowrap',
            }}
          >
            {layer}
          </span>

          {/* extension badge */}
          {ext && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                background: 'var(--surface-subtle)',
                whiteSpace: 'nowrap',
              }}
            >
              .{ext}
            </span>
          )}

          {/* close button */}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              padding: '2px 4px',
              borderRadius: 4,
              marginLeft: 4,
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── two-column body ──────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {/* ── left column: stats + function list ── */}
          <div
            style={{
              width: '42%',
              minWidth: 0,
              borderRight: '1px solid var(--surface-subtle)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* stats card */}
            <div
              style={{
                padding: '14px 16px 10px',
                borderBottom: '1px solid var(--surface-subtle)',
                background: 'var(--surface-card)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 12px',
                }}
              >
                <Stat label="Lines of code" value={loc > 0 ? loc.toLocaleString() : '—'} />
                <Stat label="Functions" value={fileFns.length} />
                <Stat
                  label="Exported"
                  value={exportedFns.length}
                  valueColor="var(--color-success)"
                />
                <Stat
                  label="Internal"
                  value={internalFns.length}
                  valueColor="var(--text-muted)"
                />
                {health != null && (
                  <Stat
                    label="Health score"
                    value={`${health}%`}
                    valueColor={healthColor(health)}
                    span
                  />
                )}
              </div>
            </div>

            {/* function list */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px 14px',
              }}
            >
              {fileFns.length === 0 ? (
                <div
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 13,
                    textAlign: 'center',
                    marginTop: 24,
                  }}
                >
                  No functions found in this file
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    Functions ({fileFns.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {fileFns.map((fn) => (
                      <span
                        key={fn.name}
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          padding: '3px 9px',
                          borderRadius: 6,
                          background: fn.isExported ? '#1a3a1a' : 'var(--surface-card)',
                          border: `1px solid ${fn.isExported ? '#2ea04333' : 'var(--border-subtle)'}`,
                          color: fn.isExported ? 'var(--color-success)' : 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={fn.name}
                      >
                        {fn.isExported ? '↗ ' : ''}{fn.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── right column: D3 graph ── */}
          <div
            style={{
              width: '58%',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'var(--bg-canvas)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                padding: '10px 14px 6px',
                flexShrink: 0,
              }}
            >
              Call graph
            </div>

            {fileFns.length === 0 ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}
              >
                No functions to visualise
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <svg
                  ref={svgRef}
                  width={460}
                  height={300}
                  style={{
                    display: 'block',
                    background: 'var(--bg-canvas)',
                    width: '100%',
                    height: 300,
                  }}
                />
              </div>
            )}

            {/* legend */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                padding: '8px 14px',
                borderTop: '1px solid var(--surface-subtle)',
                flexShrink: 0,
              }}
            >
              <LegendDot color="var(--color-success)" label="exported" />
              <LegendDot color="var(--border-subtle)" label="internal" />
            </div>
          </div>
        </div>

        {/* ── bottom warning strip ─────────────────────────────────────────── */}
        {hasIssues && (
          <div
            style={{
              borderTop: '1px solid #3d2400',
              background: '#2d1a00',
              padding: '7px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: '#ffa657', fontSize: 13, flexShrink: 0 }}>⚠</span>
            <span
              style={{
                color: '#ffa657',
                fontSize: 11,
                lineHeight: 1.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={issueList.join(' · ')}
            >
              {issueList.slice(0, 3).join(' · ')}
              {issueList.length > 3 && ` · +${issueList.length - 3} more`}
            </span>
          </div>
        )}
      </div>
    </>
  );
}

// ─── tiny sub-components ──────────────────────────────────────────────────────

function Stat({
  label,
  value,
  valueColor,
  span,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  span?: boolean;
}) {
  return (
    <div style={{ gridColumn: span ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: valueColor ?? 'var(--text-primary)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          background: color === 'var(--color-success)' ? '#1a3a1a' : 'var(--surface-card)',
        }}
      />
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}
