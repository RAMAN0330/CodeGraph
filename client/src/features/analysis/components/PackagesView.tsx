import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { packageGraph, type PackageEdge } from '../services/packages';

// Packages of a (mono)repository and the dependencies between them
// (client/src/features/analysis/services/packages.ts).

interface Props { data: any; onOpenFile: (path: string) => void }

const rootLabel = (root: string) => root || '(repository root)';

function ruleFor(edge: PackageEdge, fromLabel: string, toLabel: string): string {
  const glob = (root: string) => (root ? `${root}/**` : '**');
  return JSON.stringify({ name: `${fromLabel} must not use ${toLabel}`, from: glob(edge.from), disallow: glob(edge.to) }, null, 2);
}

// Packages on a ring, one arrow per dependency; dashed amber where the manifest doesn't declare it.
function PackageMap({ nodes, edges }: { nodes: { root: string; label: string }[]; edges: PackageEdge[] }) {
  const W = 560, H = 190, cx = W / 2, cy = H / 2, rx = 200, ry = 62;
  const at = new Map(nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return [n.root, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }];
  }));
  return (
    <svg className="mb-3 h-[190px] w-full shrink-0" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Package dependency map">
      <defs>
        <marker id="pkg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" fill="context-stroke" /></marker>
      </defs>
      {edges.map(e => {
        const a = at.get(e.from), b = at.get(e.to);
        if (!a || !b) return null;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const sx = a.x + (dx / len) * 44, sy = a.y + (dy / len) * 16, ex = b.x - (dx / len) * 50, ey = b.y - (dy / len) * 18;
        return <line key={`${e.from}>${e.to}`} x1={sx} y1={sy} x2={ex} y2={ey} stroke={e.undeclared ? 'var(--color-warning)' : 'var(--text-muted)'} strokeWidth="1.5" strokeDasharray={e.undeclared ? '4 3' : undefined} markerEnd="url(#pkg-arrow)" />;
      })}
      {nodes.map(n => {
        const p = at.get(n.root)!;
        const text = n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label;
        const w = Math.max(76, text.length * 6.6 + 20);
        return (
          <g key={n.root}>
            <rect x={p.x - w / 2} y={p.y - 14} width={w} height="28" rx="8" fill="var(--bg1)" stroke="var(--border-medium)" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--t0)">{text}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function PackagesView({ data, onOpenFile }: Props) {
  const graph = useMemo(() => packageGraph(data), [data]);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const label = (root: string) => graph.nodes.find(n => n.root === root)?.label ?? rootLabel(root);

  if (!data?.packages) {
    return <div className="gi-page guide-page"><h1>Packages</h1><div className="guide-card"><p className="guide-empty">This analysis predates package detection. Rescan the repository to map its packages.</p></div></div>;
  }

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(c => (c === key ? null : c)), 2000); }).catch(() => {});
  };
  const undeclared = graph.edges.filter(e => e.undeclared);

  return (
    <div className="gi-page guide-page fit-page">
      <header className="guide-header">
        <div>
          <h1>Packages</h1>
          <p>{graph.nodes.length > 1
            ? `${graph.nodes.length} packages found from their manifests, and which ones depend on which.${undeclared.length ? ` ${undeclared.length} dependenc${undeclared.length === 1 ? 'y isn’t' : 'ies aren’t'} declared in the using package’s manifest — usually a relative-path reach into another package, which breaks when it’s built or published on its own.` : ''}`
            : graph.nodes.length === 1 ? 'This repository is a single package, so there are no package boundaries to map.' : 'No package manifests (package.json, go.mod, pyproject.toml, Cargo.toml, pom.xml, build.gradle, composer.json) were found.'}</p>
        </div>
      </header>

      {graph.nodes.length > 1 && (
        <SummaryStrip items={[
          { label: 'Packages', value: graph.nodes.length, sub: [...new Set(graph.nodes.map(n => n.ecosystem))].join(', ') },
          { label: 'Dependencies', value: graph.edges.length, sub: 'Between packages' },
          { label: 'Undeclared', value: undeclared.length, tone: undeclared.length ? 'warn' : 'good', sub: undeclared.length ? 'Reach past a manifest' : 'All declared' },
        ]} />
      )}

      {graph.nodes.length > 1 && (
        <div className="fit-body" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(260px,1fr)' }}>
          <section className="guide-card fit-pane">
            <h2><Boxes size={15} /> Dependencies between packages</h2>
            <PackageMap nodes={graph.nodes} edges={graph.edges} />
            <div className="fit-scroll">
            {graph.edges.length ? (
              <table className="hotspots-table packages-table">
                <thead><tr><th scope="col"><span className="sr-only">Details</span></th><th scope="col">From</th><th scope="col">Uses</th><th scope="col">Calls</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {graph.edges.map(e => {
                    const key = `${e.from}\u0000${e.to}`;
                    const expanded = open === key;
                    return (
                      <Fragment key={key}>
                        <tr className={e.undeclared ? 'undeclared' : ''}>
                          <td><button type="button" className="endpoints-expand" aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} example dependencies`} onClick={() => setOpen(expanded ? null : key)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></td>
                          <td><code>{label(e.from)}</code></td>
                          <td><code>{label(e.to)}</code>{e.undeclared && <span className="packages-warn"><AlertTriangle size={12} /> not declared</span>}</td>
                          <td>{e.dependencies}</td>
                          <td><button type="button" className="file-notes-link" onClick={() => copy(key, ruleFor(e, label(e.from), label(e.to)))}>{copied === key ? <><Check size={12} /> Rule copied</> : <><Copy size={12} /> Forbid as rule</>}</button></td>
                        </tr>
                        {expanded && (
                          <tr className="endpoints-detail"><td /><td colSpan={4}>
                            <ul className="ask-list">{e.sample.map(s => <li key={s.from + s.to}><div><button type="button" className="guide-file" onClick={() => onOpenFile(s.from)}>{s.from}</button><span aria-hidden="true">→</span><button type="button" className="guide-file" onClick={() => onOpenFile(s.to)}>{s.to}</button></div></li>)}</ul>
                            {e.dependencies > e.sample.length && <p className="guide-empty">+{e.dependencies - e.sample.length} more</p>}
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            ) : <p className="guide-empty">The packages don't call into each other.</p>}
            <p className="coverage-meta packages-hint">“Forbid as rule” copies an entry for <code>structrace.rules.json</code>, enforced by the PR review and <code>structrace check</code>.</p>
            </div>
          </section>
          <section className="guide-card fit-pane">
            <h2>Packages</h2>
            <ul className="ask-list fit-scroll">
              {graph.nodes.map(n => (
                <li key={n.root}><div><strong className="packages-name">{n.label}</strong><span className="guide-layer">{n.ecosystem}</span><small>{n.files} files</small></div><p>{rootLabel(n.root)}</p></li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
