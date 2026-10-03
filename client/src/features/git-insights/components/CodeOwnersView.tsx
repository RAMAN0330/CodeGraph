import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GitHub } from '../../repository/services/github';
import {
  LOCATIONS, auditCodeowners, parseCodeowners, renderCodeowners, suggestAreas, suggestOwners,
  type AreaActivity, type Finding,
} from '../services/codeowners';

// Suggested CODEOWNERS from who actually commits where, plus an audit of the
// repository's existing file (services/codeowners.ts).

interface Props { owner: string; repo: string; branch?: string; data: any }

const MONTHS = 12;
const CONCURRENCY = 3;

async function areaActivity(owner: string, repo: string, branch: string | undefined, area: string, files: number): Promise<AreaActivity> {
  const since = new Date(Date.now() - MONTHS * 30 * 86_400_000).toISOString();
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=100&since=${encodeURIComponent(since)}&path=${encodeURIComponent(area)}${branch ? `&sha=${encodeURIComponent(branch)}` : ''}`;
  const commits: any[] = await GitHub.request(url).catch(() => []);
  const counts = new Map<string, number>();
  commits.forEach(c => {
    const login: string | undefined = c?.author?.login;
    if (login && !login.endsWith('[bot]') && c?.author?.type !== 'Bot') counts.set(login, (counts.get(login) ?? 0) + 1);
  });
  return { area, files, commits: [...counts.values()].reduce((a, b) => a + b, 0), authors: [...counts].map(([login, n]) => ({ login, commits: n })) };
}

function describe(f: Finding): React.ReactNode {
  if (f.kind === 'stale-owner') return <><code>{f.owner}</code> owns <code>{f.pattern}</code> (line {f.line}) but hasn't committed under <code>{f.area}/</code> in {MONTHS} months.</>;
  if (f.kind === 'no-match') return <><code>{f.pattern}</code> (line {f.line}) matches no file in the repository.</>;
  return <><code>{f.area}/</code> ({f.files} files) has no owner{f.suggested.length ? <> — suggested: {f.suggested.join(' ')}</> : null}.</>;
}

export default function CodeOwnersView({ owner, repo, branch, data }: Props) {
  const paths: string[] = useMemo(() => (data?.files ?? []).map((f: any) => f.path), [data]);
  const areas = useMemo(() => suggestAreas(paths), [paths]);
  const [activity, setActivity] = useState<AreaActivity[] | null>(null);
  const [existing, setExisting] = useState<{ path: string; text: string } | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setActivity(null);
    setExisting(undefined);
    (async () => {
      for (const location of LOCATIONS) {
        const text = await GitHub.getFile(owner, repo, location, branch).catch(() => null);
        if (text) { if (!cancelled) setExisting({ path: location, text }); return; }
      }
      if (!cancelled) setExisting(null);
    })();
    (async () => {
      const results: AreaActivity[] = new Array(areas.length);
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, areas.length) }, async () => {
        while (next < areas.length) {
          const i = next++;
          results[i] = await areaActivity(owner, repo, branch, areas[i].area, areas[i].files);
        }
      }));
      if (!cancelled) setActivity(results);
    })();
    return () => { cancelled = true; };
  }, [owner, repo, branch, areas]);

  const suggestions = useMemo(() => (activity ? suggestOwners(activity) : []), [activity]);
  const generated = useMemo(() => renderCodeowners(suggestions, MONTHS), [suggestions]);
  const findings = useMemo(
    () => (activity && existing ? auditCodeowners(parseCodeowners(existing.text), paths, activity, suggestions) : []),
    [activity, existing, paths, suggestions],
  );
  const quiet = activity ? activity.filter(a => a.commits === 0).map(a => a.area) : [];

  const copy = () => {
    navigator.clipboard.writeText(generated).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Code owners</h1>
          <p>Who actually maintains each area, from the last {MONTHS} months of commits — as a CODEOWNERS file you can review and commit, and an audit of the one you have.</p>
        </div>
        <Button className="guide-copy" onClick={copy} disabled={!suggestions.length}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy CODEOWNERS</>}</Button>
      </header>

      {activity === null ? <div className="guide-card"><p className="guide-empty">Reading commit history for {areas.length} areas…</p></div> : (
        <div className="guide-grid">
          <section className="guide-card">
            <h2><UserCheck size={15} /> Suggested owners</h2>
            {suggestions.length ? (
              <table className="hotspots-table">
                <thead><tr><th scope="col">Area</th><th scope="col">Owners</th><th scope="col">Their share</th><th scope="col">Commits</th></tr></thead>
                <tbody>{suggestions.map(s => <tr key={s.area}><td><code>{s.area}/</code></td><td>{s.owners.join(' ')}</td><td>{s.share}%</td><td>{s.commits}</td></tr>)}</tbody>
              </table>
            ) : <p className="guide-empty">No commits with a GitHub account were found in the last {MONTHS} months{activity.every(a => !a.commits) ? ' — commit history may be unavailable without a GitHub connection' : ''}.</p>}
            {quiet.length > 0 && <p className="coverage-meta codeowners-quiet">No commits in {MONTHS} months: {quiet.map(a => `${a}/`).join(', ')}.</p>}
            {suggestions.length > 0 && <pre className="rules-json">{generated}</pre>}
          </section>
          <section className="guide-card">
            <h2><AlertTriangle size={15} /> {existing ? `Audit of ${existing.path}` : 'No CODEOWNERS file'}</h2>
            {existing === undefined && <p className="guide-empty">Looking for an existing file…</p>}
            {existing === null && <p className="guide-empty">The repository has no CODEOWNERS file. Commit the suggestion as <code>.github/CODEOWNERS</code> so reviews are requested from the right people automatically.</p>}
            {existing && (findings.length
              ? <ul className="ask-list codeowners-findings">{findings.map((f, i) => <li key={i} className={f.kind}><p>{describe(f)}</p></li>)}</ul>
              : <p className="rules-ok"><Check size={13} /> Every rule matches files and every listed person still commits there.</p>)}
          </section>
        </div>
      )}
    </div>
  );
}
