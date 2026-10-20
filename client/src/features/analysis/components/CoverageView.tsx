import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertCircle, CheckCircle2, Download, FileQuestion, FileUp, FlaskConical, ShieldAlert, Trash2, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { Page, PageHeader, Section } from '../../../shared/components/Page';
import { StateCard } from '../../../shared/components/StateCard';
import { toneFill, toneText, type Tone } from '../../../shared/components/dashboardTones';
import { downloadCsv } from '../../../shared/services/exportCsv';
import { appConfig } from '../../../app/config';
import { CoverageFormatError, coverageRisk, matchCoverageToRepo, parseCoverage, percent, type LineCounts } from '../services/coverage';

interface Props { owner: string; repo: string; branch?: string; data: any; onOpenFile: (path: string) => void }
interface Report { format: string; files: Record<string, LineCounts>; uploadedBy: string | null; uploadedAt: string }

// Where each supported report usually comes from, so the empty state says how to get one.
const FORMATS = [
  { name: 'lcov', file: 'lcov.info', tools: 'Jest, Vitest, c8, nyc, Karma, gcov, cargo-llvm-cov', how: 'vitest run --coverage --coverage.reporter=lcov' },
  { name: 'Cobertura XML', file: 'coverage.xml', tools: 'coverage.py / pytest-cov, .NET coverlet, JaCoCo converters, PHPUnit', how: 'pytest --cov --cov-report=xml' },
  { name: 'Istanbul summary', file: 'coverage-summary.json', tools: 'Jest, nyc, Vitest with the json-summary reporter', how: 'jest --coverage --coverageReporters=json-summary' },
];

const coverageTone = (pct: number): Tone => pct >= 80 ? 'good' : pct >= 50 ? 'warn' : 'bad';

const TEST_PATH = /(\.test\.|\.spec\.|_test\.|(^|\/)test_|__tests__|(^|\/)tests?\/)/i;

function endpoint(value: any): string {
  return typeof value === 'object' && value ? value.id : value;
}

export default function CoverageView({ owner, repo, branch, data, onOpenFile }: Props) {
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
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

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !busy) void upload(f);
  };
  const pick = () => input.current?.click();

  return (
    <Page>
      <PageHeader
        icon={FlaskConical}
        tone="quality"
        title="Test coverage"
        description="Upload a coverage report from CI to see which widely used files are poorly tested. Reports are parsed in your browser; only per-file line counts are stored, for your organization."
        actions={<>
          <input ref={input} type="file" accept=".info,.lcov,.xml,.json,text/plain,application/xml,application/json" className="sr-only" id="coverage-file" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          {report && <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={remove} aria-label="Remove coverage report"><Trash2 className="size-3.5" /> Remove</Button>}
          {report !== null && <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || report === undefined} onClick={pick}><FileUp className="size-3.5" /> {busy ? 'Reading…' : report ? 'Replace report' : 'Upload report'}</Button>}
        </>}
      />

      {message && (
        <p className={cn('flex shrink-0 items-start gap-2 rounded-lg border px-3 py-2 text-xs', message.error ? toneText.bad : 'text-foreground')} role={message.error ? 'alert' : 'status'}>
          {message.error ? <AlertCircle className="mt-px size-3.5 shrink-0" /> : <CheckCircle2 className={cn('mt-px size-3.5 shrink-0', toneText.good)} />}
          {message.text}
        </p>
      )}

      {report === undefined && (
        <>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[84px] rounded-xl" />)}</div>
          <Skeleton className="min-h-40 flex-1 rounded-xl" />
        </>
      )}

      {report === null && (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Section title="Upload a report" meta="no coverage for this branch yet" icon={UploadCloud} className="min-h-[320px]" bodyClassName="flex p-4">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn('flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card p-6 text-center transition-colors', dragging && 'border-primary bg-[var(--surface-hover)]')}
            >
              <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"><UploadCloud className="size-6" /></span>
              <h2 className="text-sm font-semibold">Drop a coverage file here</h2>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Use the report your test run already writes in CI. Paths are matched to this repository automatically, even when the report was made in another folder.</p>
              <Button className="mt-1 gap-1.5" disabled={busy} onClick={pick}><FileUp className="size-4" /> {busy ? 'Reading…' : 'Choose a report file'}</Button>
              <p className="text-[11px] text-muted-foreground">.info, .lcov, .xml or .json</p>
            </div>
          </Section>
          <Section title="Supported formats" icon={FileQuestion} className="min-h-[320px]" bodyClassName="flex flex-col gap-3">
            {FORMATS.map(f => (
              <div key={f.name} className="rounded-lg border bg-card px-4 py-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[13px] font-semibold">{f.name}</h3>
                  <code className="ml-auto font-mono text-[11px] text-muted-foreground">{f.file}</code>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{f.tools}</p>
                <code className="mt-2 block truncate rounded-md bg-[var(--surface-subtle)] px-2 py-1 font-mono text-[11px]" title={f.how}>{f.how}</code>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-muted-foreground">Once uploaded, you will see overall line coverage, the widely used files with the weakest coverage, and important files no test loads at all. A report is kept per branch.</p>
          </Section>
        </div>
      )}

      {report && totals && (
        <>
          <SummaryStrip items={[
            { label: 'Line coverage', value: `${totals.percent}%`, tone: coverageTone(totals.percent), sub: 'Across the report' },
            { label: 'Files in report', value: totals.files, sub: `${report.format} · ${new Date(report.uploadedAt).toLocaleDateString()}` },
            { label: 'Files at risk', value: risks.length, tone: risks.length ? 'warn' : 'good', sub: 'Used widely, poorly tested' },
            { label: 'Untested', value: missing.length, tone: missing.length ? 'warn' : 'good', sub: 'Absent from report' },
          ]} />
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
            <Section
              title="Widely used, poorly tested"
              meta={`uploaded ${new Date(report.uploadedAt).toLocaleString()}${report.uploadedBy ? ` by ${report.uploadedBy}` : ''}`}
              icon={ShieldAlert}
              className="min-h-[300px]"
              bodyClassName="p-0"
              actions={risks.length > 0 && <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => downloadCsv('coverage-risk.csv', ['File', 'Coverage %', 'Dependents', 'Risk'], risks.map(r => [r.path, r.percent, r.dependents, r.risk]))}><Download className="size-3.5" /> CSV</Button>}
            >
              {risks.length ? (
                <ul className="divide-y">
                  {risks.map(r => (
                    <li key={r.path}>
                      <button type="button" title={r.path} onClick={() => onOpenFile(r.path)} className="grid w-full grid-cols-[minmax(0,1fr)_minmax(80px,24%)_3.5rem] items-center gap-3 border-0 bg-transparent px-4 py-2 text-left text-inherit hover:bg-[var(--surface-hover)]">
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[13px] font-semibold">{r.path.split('/').pop()}</span>
                          <span className="truncate text-xs text-muted-foreground">used by {r.dependents}{r.transitive ? ` (+${r.transitive} indirectly)` : ''} · risk {r.risk}</span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><i className={cn('block h-full rounded-full', toneFill[coverageTone(r.percent)])} style={{ width: `${Math.max(2, r.percent)}%` }} /></span>
                        <b className={cn('text-right font-mono text-xs font-semibold tabular-nums', toneText[coverageTone(r.percent)])}>{r.percent}%</b>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <StateCard icon={CheckCircle2} title="No risky files">Every file other code depends on is fully covered.</StateCard>}
            </Section>
            <Section title="Missing from the report" meta="used by 3+ files" icon={FileQuestion} className="min-h-[300px]" bodyClassName="p-0">
              {missing.length ? (
                <>
                  <p className="border-b px-4 py-2 text-xs text-muted-foreground">Absent from the coverage report: no test loaded them.</p>
                  <ul className="divide-y">
                    {missing.map((m: { path: string; dependents: number }) => (
                      <li key={m.path}>
                        <button type="button" title={m.path} onClick={() => onOpenFile(m.path)} className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2 text-left text-inherit hover:bg-[var(--surface-hover)]">
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[13px] font-semibold">{m.path.split('/').pop()}</span>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">{m.path}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">used by <b className="font-mono text-foreground">{m.dependents}</b></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : <StateCard icon={CheckCircle2} title="Nothing missing">Every widely used file appears in the report.</StateCard>}
            </Section>
          </div>
        </>
      )}
    </Page>
  );
}
