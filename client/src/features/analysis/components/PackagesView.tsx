import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { packageGraph, type PackageEdge } from '../services/packages';

// Packages of a (mono)repository and the dependencies between them
// (client/src/features/analysis/services/packages.ts).

interface Props { data: any; onOpenFile: (path: string) => void }

const rootLabel = (root: string) => root || '(repository root)';

function ruleFor(edge: PackageEdge, fromLabel: string, toLabel: string): string {
  const glob = (root: string) => (root ? `${root}/**` : '**');
  return JSON.stringify({ name: `${fromLabel} must not use ${toLabel}`, from: glob(edge.from), disallow: glob(edge.to) }, null, 2);
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
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Packages</h1>
          <p>{graph.nodes.length > 1
            ? `${graph.nodes.length} packages found from their manifests, and which ones depend on which.${undeclared.length ? ` ${undeclared.length} dependenc${undeclared.length === 1 ? 'y isn’t' : 'ies aren’t'} declared in the using package’s manifest — usually a relative-path reach into another package, which breaks when it’s built or published on its own.` : ''}`
            : graph.nodes.length === 1 ? 'This repository is a single package, so there are no package boundaries to map.' : 'No package manifests (package.json, go.mod, pyproject.toml, Cargo.toml, pom.xml, build.gradle, composer.json) were found.'}</p>
        </div>
      </header>

      {graph.nodes.length > 1 && (
        <div className="guide-grid">
          <section className="guide-card">
            <h2><Boxes size={15} /> Dependencies between packages</h2>
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
          </section>
          <section className="guide-card">
            <h2>Packages</h2>
            <ul className="ask-list">
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
