import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { appConfig } from '../../../app/config';
import { CoverageFormatError, coverageRisk, matchCoverageToRepo, parseCoverage, percent, type LineCounts } from '../services/coverage';

interface Props { owner: string; repo: string; branch?: string; data: any; onOpenFile: (path: string) => void }
interface Report { format: string; files: Record<string, LineCounts>; uploadedBy: string | null; uploadedAt: string }

const TEST_PATH = /(\.test\.|\.spec\.|_test\.|(^|\/)test_|__tests__|(^|\/)tests?\/)/i;

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

export default function CoverageView({ owner, repo, branch, data, onOpenFile }: Props) {
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const url = `${appConfig.apiUrl}/api/coverage/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${branch ? `?branch=${encodeURIComponent(branch)}` : ''}`;

  useEffect(() => {
    fetch(url, { credentials: 'include' })
      .then(res => res.json().then(body => ({ res, body })))
      .then(({ res, body }) => { if (!res.ok) throw new Error(body?.error || 'Could not load coverage.'); setReport(body.report); })
      .catch(e => { setReport(null); setMessage({ text: e.message, error: true }); });
  }, [url]);

  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const parsed = parseCoverage(await file.text(), file.name);
      const matched = matchCoverageToRepo(parsed.files, (data?.files ?? []).map((f: any) => f.path));
      const res = await fetch(url, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: parsed.format, files: matched.files }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Upload failed.');
      setReport(body.report);
      const total = Object.keys(parsed.files).length;
      setMessage({ text: `Matched ${total - matched.unmatched} of ${total} files in the report to this repository.${matched.unmatched ? ' The rest are not in this analysis (other packages, generated or deleted files).' : ''}`, error: false });
    } catch (e: any) {
      setMessage({ text: e instanceof CoverageFormatError ? e.message : e.message || 'Upload failed.', error: true });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = () => {
    fetch(url, { method: 'DELETE', credentials: 'include' }).then(res => { if (res.ok) { setReport(null); setMessage(null); } });
  };

  const risks = useMemo(() => (report ? coverageRisk(data, report.files) : []), [report, data]);
  const totals = useMemo(() => {
    if (!report) return null;
    const all = Object.values(report.files).reduce((acc, c) => ({ found: acc.found + c.found, hit: acc.hit + c.hit }), { found: 0, hit: 0 });
    return { percent: percent(all), files: Object.keys(report.files).length };
  }, [report]);
  // Widely used code the report doesn't mention at all — often untested
  // because no test ever imports it.
  const missing = useMemo(() => {
    if (!report) return [];
    const dependents = new Map<string, number>();
    (data?.connections ?? []).forEach((c: any) => { const d = endpoint(c.source); if (d !== endpoint(c.target)) dependents.set(d, (dependents.get(d) ?? 0) + 1); });
    return (data?.files ?? [])
      .filter((f: any) => f.isCode !== false && !TEST_PATH.test(f.path) && !report.files[f.path] && (dependents.get(f.path) ?? 0) >= 3)
      .map((f: any) => ({ path: f.path as string, dependents: dependents.get(f.path) ?? 0 }))
      .sort((a: any, b: any) => b.dependents - a.dependents)
      .slice(0, 10);
  }, [report, data]);

  return (
    <div className="gi-page guide-page">
      <header className="guide-header">
        <div>
          <h1>Test coverage</h1>
          <p>Upload a coverage report from CI to see which widely used files are poorly tested. Accepts <code>lcov.info</code>, Cobertura <code>coverage.xml</code> and Istanbul <code>coverage-summary.json</code>; it's parsed in your browser and only per-file line counts are stored, for your organization.</p>
        </div>
        <div className="coverage-actions">
          <input ref={input} type="file" accept=".info,.lcov,.xml,.json,text/plain,application/xml,application/json" className="sr-only" id="coverage-file" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <Button className="guide-copy" disabled={busy} onClick={() => input.current?.click()}><FileUp size={14} /> {busy ? 'Reading…' : report ? 'Replace report' : 'Upload report'}</Button>
          {report && <Button variant="ghost" className="coverage-remove" onClick={remove} aria-label="Remove coverage report"><Trash2 size={14} /></Button>}
        </div>
      </header>

      {message && <p className={message.error ? 'organization-error' : 'organization-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      {report === undefined && <p className="guide-empty">Loading…</p>}
      {report === null && !message && <div className="guide-card"><p className="guide-empty">No coverage uploaded for this branch yet.</p></div>}

      {report && totals && (
        <>
          <div className="db-usage-impact coverage-stats">
            <div><strong>{totals.percent}%</strong><span>line coverage</span></div>
            <div><strong>{totals.files}</strong><span>files in the report</span></div>
            <div><strong>{risks.length}</strong><span>files at risk</span></div>
          </div>
          <p className="coverage-meta">{report.format} report uploaded {new Date(report.uploadedAt).toLocaleString()}{report.uploadedBy ? ` by ${report.uploadedBy}` : ''}.</p>
          <div className="guide-grid">
            <section className="guide-card">
              <h2><ShieldAlert size={15} /> Widely used, poorly tested</h2>
              {risks.length ? (
                <table className="hotspots-table">
                  <thead><tr><th scope="col">File</th><th scope="col">Coverage</th><th scope="col">Dependents</th><th scope="col">Risk</th></tr></thead>
                  <tbody>
                    {risks.map(r => (
                      <tr key={r.path}>
                        <td><button type="button" className="guide-file" title={r.path} onClick={() => onOpenFile(r.path)}>{r.path}</button></td>
                        <td><span className="coverage-bar" aria-hidden="true"><i style={{ width: `${r.percent}%` }} /></span> {r.percent}%</td>
                        <td>{r.dependents}{r.transitive ? <small> +{r.transitive}</small> : null}</td>
                        <td><b>{r.risk}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="guide-empty">Every file other code depends on is fully covered.</p>}
            </section>
            <section className="guide-card">
              <h2>Missing from the report</h2>
              <p className="coverage-meta">Used by 3+ files but absent from the coverage report — no test loaded them.</p>
              {missing.length ? <ul className="ask-list">{missing.map((m: { path: string; dependents: number }) => <li key={m.path}><div><button type="button" className="guide-file" onClick={() => onOpenFile(m.path)}>{m.path}</button><small>used by {m.dependents}</small></div></li>)}</ul>
                : <p className="guide-empty">None.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
