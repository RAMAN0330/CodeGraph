import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Copy, Layers, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildOnboardingGuide, guideToMarkdown } from '../services/onboardingGuide';
import { computeOwnershipRisk } from '../../git-insights/services/ownershipRisk';

interface Props {
  owner: string;
  repo: string;
  data: any;
  onOpenFile: (path: string) => void;
}

function FileLink({ path, onOpenFile }: { path: string; onOpenFile: (path: string) => void }) {
  return <button type="button" className="guide-file" onClick={() => onOpenFile(path)} title={`Open ${path} in the code graph`}>{path}</button>;
}

export default function OnboardingGuide({ owner, repo, data, onOpenFile }: Props) {
  const guide = useMemo(() => buildOnboardingGuide(data), [data]);
  const [owners, setOwners] = useState<Array<{ folder: string; people: string[] }> | null>(null);
  const [copied, setCopied] = useState(false);

  // Same bounded, cached sampling the Overview's ownership panel uses.
  useEffect(() => {
    let cancelled = false;
    computeOwnershipRisk(owner, repo, data?.files ?? [])
      .then(summary => {
        if (cancelled || !summary) return;
        setOwners(summary.folders
          .filter(f => f.authors.length)
          .map(f => ({ folder: f.folder, people: f.authors.slice(0, 2).map(a => a.name) })));
      })
      .catch(() => { if (!cancelled) setOwners([]); });
    return () => { cancelled = true; };
  }, [owner, repo, data]);

  const copy = () => {
    navigator.clipboard.writeText(guideToMarkdown(guide, `${owner}/${repo}`, owners ?? undefined))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => setCopied(false));
  };

  if (!guide.codeFiles) {
    return <div className="gi-page"><h1>Onboarding guide</h1><p className="guide-empty">No code files were found in this analysis, so there is nothing to build a reading path from.</p></div>;
  }

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Onboarding guide</h1>
          <p>A reading path through {owner}/{repo}, computed from its dependency graph of {guide.codeFiles} code files.</p>
        </div>
        <Button className="guide-copy" onClick={copy}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy as Markdown</>}</Button>
      </header>

      <div className="guide-grid">
        <section className="guide-card guide-path">
          <h2><BookOpen size={15} /> Reading path</h2>
          {guide.readingPath.length ? (
            <ol>
              {guide.readingPath.map(step => (
                <li key={step.path}>
                  <div><FileLink path={step.path} onOpenFile={onOpenFile} /><span className={`guide-layer ${step.kind}`}>{step.kind === 'entry' ? 'start' : step.layer}</span></div>
                  <p>{step.reason}</p>
                </li>
              ))}
            </ol>
          ) : <p className="guide-empty">No dependencies between files were detected, so there is no path to follow. Start with the largest areas below.</p>}
        </section>

        <div className="guide-side">
          {guide.entryPoints.length > 0 && (
            <section className="guide-card">
              <h2>Start here</h2>
              <ul>{guide.entryPoints.map(e => <li key={e.path}><FileLink path={e.path} onOpenFile={onOpenFile} /><small>reaches {e.reach}</small></li>)}</ul>
            </section>
          )}
          {guide.coreModules.length > 0 && (
            <section className="guide-card">
              <h2>Core modules</h2>
              <ul>{guide.coreModules.map(m => <li key={m.path}><FileLink path={m.path} onOpenFile={onOpenFile} /><small>used by {m.dependents}</small></li>)}</ul>
            </section>
          )}
          {guide.cautions.length > 0 && (
            <section className="guide-card guide-caution">
              <h2><AlertTriangle size={14} /> Handle with care</h2>
              <ul>{guide.cautions.map(c => <li key={c.path + c.reason}><FileLink path={c.path} onOpenFile={onOpenFile} /><p>{c.reason}</p></li>)}</ul>
            </section>
          )}
        </div>

        <section className="guide-card">
          <h2><Layers size={15} /> Layers</h2>
          <ul>{guide.layers.map(l => <li key={l.layer}><strong>{l.layer}</strong><small>{l.files} files</small><p>{l.examples.map(e => e.split('/').pop()).join(', ')}</p></li>)}</ul>
        </section>

        <section className="guide-card">
          <h2><Users size={15} /> Who to ask</h2>
          {owners === null ? <p className="guide-empty">Looking up recent committers…</p>
            : owners.length ? <ul>{owners.map(o => <li key={o.folder}><code>{o.folder}/</code><p>{o.people.join(', ')}</p></li>)}</ul>
            : <p className="guide-empty">Commit history isn't available for this repository right now.</p>}
        </section>
      </div>
    </div>
  );
}
