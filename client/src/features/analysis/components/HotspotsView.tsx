import { useMemo, useState } from 'react';
import { Download, FileCode2, Flame, GitBranch, History, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { Page, PageHeader, Section, Segmented } from '../../../shared/components/Page';
import { StateCard } from '../../../shared/components/StateCard';
import { toneText, type Tone } from '../../../shared/components/dashboardTones';
import { downloadCsv } from '../../../shared/services/exportCsv';

// Hotspots = complex files that also change often (server/src/analysis/hotspots.ts).
// Churn is only fetched for the most complex files, so the chart plots those.

interface Props { data: any; onOpenFile: (path: string) => void }
interface Point { path: string; complexity: number; churn: number }
interface Ranked { path: string; complexity: number; churn: number; authors: number; lastChanged: string | null; score: number }

const W = 640, H = 340, PAD = { top: 16, right: 20, bottom: 44, left: 52 };
const LABELLED = 5;
// Same thresholds as the parser's complexity levels (server/src/analysis/parser.ts).
const LEVELS: { key: string; label: string; min: number; tone: Tone }[] = [
  { key: 'critical', label: 'Critical', min: 31, tone: 'bad' },
  { key: 'high', label: 'High', min: 21, tone: 'warn' },
  { key: 'medium', label: 'Medium', min: 11, tone: 'neutral' },
];

// Round axis: a 1/2/2.5/5×10^n step giving about four intervals, and a max on it.
function axis(value: number): { max: number; ticks: number[] } {
  const raw = Math.max(1, value) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const max = Math.ceil(Math.max(1, value) / step) * step;
  return { max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step) };
}

function base(path: string) {
  return path.split('/').pop() || path;
}

function relative(iso: string | null) {
  if (!iso) return '—';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function levelOf(score: number) {
  return LEVELS.find(l => score >= l.min) ?? { key: 'low', label: 'Low', min: 0, tone: 'good' as Tone };
}

export default function HotspotsView({ data, onOpenFile }: Props) {
  const status: string = data?.hotspots?.status ?? 'off';
  const windowDays: number = data?.hotspots?.windowDays ?? 180;
  const ranked: Ranked[] = data?.hotspots?.items ?? [];
  const points: Point[] = useMemo(() => (data?.files ?? [])
    .filter((f: any) => (f.churn ?? 0) > 0 && (f.complexity?.score ?? 0) > 0)
    .map((f: any) => ({ path: f.path, complexity: f.complexity.score, churn: f.churn })), [data]);
  const [hover, setHover] = useState<Point | null>(null);

  if (status !== 'ok') return <ComplexityFallback data={data} status={status} onOpenFile={onOpenFile} />;

  const top = new Set(ranked.slice(0, LABELLED).map(h => h.path));
  const xAxis = axis(Math.max(...points.map(p => p.churn), 1));
  const yAxis = axis(Math.max(...points.map(p => p.complexity), 1));
  const xMax = xAxis.max, yMax = yAxis.max;
  const x = (v: number) => PAD.left + (v / xMax) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);
  // The ranking's own boundary: score ∝ complexity × churn, so the files
  // scoring at least the last labelled one lie beyond the curve
  // complexity × churn = k. Shading it keeps chart and table in agreement.
  const k = ranked.length ? Math.min(...ranked.slice(0, LABELLED).map(h => h.complexity * h.churn)) : 0;
  const curve: string[] = [];
  if (k > 0) {
    const from = Math.max(k / yMax, 0.0001);
    for (let i = 0; i <= 40; i++) {
      const c = from + ((xMax - from) * i) / 40;
      curve.push(`${x(c).toFixed(1)},${y(Math.min(yMax, k / c)).toFixed(1)}`);
    }
  }
  const zone = curve.length ? `M${curve.join(' L')} L${x(xMax)},${y(yMax)} Z` : '';
  const tick = 'fill-[var(--text-muted)] text-[11px] tabular-nums';

  return (
    <Page>
      <PageHeader
        icon={Flame}
        tone="quality"
        title="Hotspots"
        description={`Complex files that also change often, where bugs and slow reviews concentrate. Churn counts commits in the last ${windowDays} days for the ${points.length} most complex files.`}
        actions={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!ranked.length} onClick={() => downloadCsv('hotspots.csv', ['File', 'Score', 'Complexity', 'Commits', 'Authors', 'Last change'], ranked.map(h => [h.path, h.score, h.complexity, h.churn, h.authors, h.lastChanged ?? '']))}><Download className="size-3.5" /> Export CSV</Button>}
      />

      {ranked.length > 0 && <SummaryStrip items={[
        { label: 'Top hotspot', value: ranked[0].score, sub: <span title={ranked[0].path}>{base(ranked[0].path)}</span>, tone: 'bad', onClick: () => onOpenFile(ranked[0].path) },
        { label: 'Files that change', value: points.length, sub: `in ${windowDays} days` },
        { label: 'Single-author hotspots', value: ranked.slice(0, LABELLED).filter(h => h.authors === 1).length, tone: ranked.slice(0, LABELLED).some(h => h.authors === 1) ? 'warn' : 'good', sub: `of top ${Math.min(LABELLED, ranked.length)}` },
        { label: 'Most commits', value: Math.max(...ranked.map(h => h.churn)), sub: 'one file' },
      ]} />}

      {points.length === 0 ? (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Section><StateCard icon={History} title="No recent changes in complex files">None of the most complex files changed in the last {windowDays} days, so there are no hotspots. The most complex files are listed for reference.</StateCard></Section>
          <ComplexityList data={data} onOpenFile={onOpenFile} />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,1fr)]">
          <Section title="Complexity vs. change frequency" icon={Flame} className="min-h-[320px]" bodyClassName="flex items-center justify-center">
            <div className="relative w-full">
              <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto max-h-full w-full" role="img" aria-label={`Scatter plot of ${points.length} files: complexity against commits in the last ${windowDays} days. The ranked list holds the same data.`}>
                {yAxis.ticks.map(t => <g key={`y${t}`}><line stroke="var(--border-subtle)" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} /><text className={tick} x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
                {xAxis.ticks.map(t => <text key={`x${t}`} className={tick} x={x(t)} y={H - PAD.bottom + 18} textAnchor="middle">{t}</text>)}
                {zone && <path d={zone} fill="color-mix(in srgb, var(--color-danger) 8%, transparent)" />}
                {zone && <text className="fill-[var(--text-secondary)] text-[11px] font-semibold" x={W - PAD.right - 8} y={PAD.top + 14} textAnchor="end">Top {Math.min(LABELLED, ranked.length)} hotspots</text>}
                <text className="fill-[var(--text-muted)] text-[11px]" x={(PAD.left + W - PAD.right) / 2} y={H - 8} textAnchor="middle">Commits in the last {windowDays} days</text>
                <text className="fill-[var(--text-muted)] text-[11px]" transform={`translate(14 ${(PAD.top + H - PAD.bottom) / 2}) rotate(-90)`} textAnchor="middle">Complexity</text>
                {points.map(p => (
                  <g key={p.path}>
                    <circle cx={x(p.churn)} cy={y(p.complexity)} r={top.has(p.path) ? 6 : 4.5}
                      fill={top.has(p.path) ? 'var(--color-danger)' : 'color-mix(in srgb, var(--viz-1) 55%, transparent)'}
                      stroke={top.has(p.path) ? 'var(--surface-card)' : 'var(--viz-1)'} strokeWidth={top.has(p.path) ? 2 : 1} />
                    <circle className="cursor-pointer outline-none" fill="transparent" cx={x(p.churn)} cy={y(p.complexity)} r={12} tabIndex={0} role="button"
                      aria-label={`${p.path}: complexity ${p.complexity}, ${p.churn} commits`}
                      onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}
                      onClick={() => onOpenFile(p.path)} onKeyDown={e => { if (e.key === 'Enter') onOpenFile(p.path); }} />
                  </g>
                ))}
                {points.filter(p => top.has(p.path)).map(p => (
                  <text key={`l${p.path}`} className="pointer-events-none fill-[var(--text-primary)] text-[11px] font-medium" x={x(p.churn) - 9} y={y(p.complexity) - 9} textAnchor="end">{base(p.path)}</text>
                ))}
              </svg>
              {hover && (
                <div className="pointer-events-none absolute z-10 flex max-w-72 -translate-x-1/2 -translate-y-[calc(100%+12px)] flex-col gap-0.5 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md" style={{ left: `${(x(hover.churn) / W) * 100}%`, top: `${(y(hover.complexity) / H) * 100}%` }} role="status">
                  <strong className="truncate font-mono">{hover.path}</strong>
                  <span className="text-muted-foreground">Complexity {hover.complexity} · {hover.churn} commits · click to open</span>
                </div>
              )}
            </div>
          </Section>

          <Section title="Ranked" meta={`${ranked.length} files`} icon={ListOrdered} className="min-h-[320px]" bodyClassName="p-0">
            <ul className="divide-y">
              {ranked.map((h, i) => (
                <li key={h.path}>
                  <button type="button" onClick={() => onOpenFile(h.path)} title={h.path} className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]">
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card font-mono text-xs font-semibold', i < LABELLED ? toneText.bad : 'text-muted-foreground')}>{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13px] font-semibold">{base(h.path)}</span>
                      <span className="truncate text-xs text-muted-foreground">{h.churn} commits · {h.authors} author{h.authors === 1 ? '' : 's'} · {relative(h.lastChanged)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <b className="font-mono text-sm font-semibold tabular-nums">{h.score}</b>
                      <span className="text-[11px] text-muted-foreground">cx {h.complexity}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </Page>
  );
}

/** Shown when hotspots could not be computed: why, what to do, and the complexity data that is available. */
function ComplexityFallback({ data, status, onOpenFile }: { data: any; status: string; onOpenFile: (path: string) => void }) {
  const files: { path: string; score: number }[] = useMemo(() => (data?.files ?? [])
    .filter((f: any) => f.isCode !== false && (f.complexity?.score ?? 0) > 0)
    .map((f: any) => ({ path: f.path, score: f.complexity.score }))
    .sort((a: any, b: any) => b.score - a.score), [data]);
  const count = (min: number, max = Infinity) => files.filter(f => f.score >= min && f.score < max).length;
  const needsToken = status === 'needs-token';

  return (
    <Page>
      <PageHeader
        icon={Flame}
        tone="quality"
        title="Hotspots"
        description="Complex files that also change often, where bugs and slow reviews concentrate. Hotspots need commit history; until then, the most complex files are below."
        actions={files.length > 0 && <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => downloadCsv('complexity.csv', ['File', 'Complexity', 'Level'], files.map(f => [f.path, f.score, levelOf(f.score).label]))}><Download className="size-3.5" /> Export CSV</Button>}
      />
      {files.length > 0 && <SummaryStrip items={[
        { label: 'Files scored', value: files.length.toLocaleString(), sub: 'Code files with branches' },
        { label: 'Critical', value: count(31), tone: count(31) ? 'bad' : 'good', sub: 'Score over 30' },
        { label: 'High', value: count(21, 31), tone: count(21, 31) ? 'warn' : 'good', sub: 'Score 21 to 30' },
        { label: 'Most complex', value: files[0].score, sub: <span title={files[0].path}>{base(files[0].path)}</span>, tone: levelOf(files[0].score).tone, onClick: () => onOpenFile(files[0].path) },
      ]} />}
      <div className={cn('grid min-h-0 flex-1 gap-3', files.length > 0 && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]')}>
        <Section icon={GitBranch} title="Hotspots unavailable" bodyClassName="flex flex-col justify-center">
          <div className="flex flex-col items-center">
          <StateCard icon={GitBranch} title={needsToken ? 'Commit history is missing' : 'This analysis predates hotspots'}>
            {needsToken
              ? 'Hotspots combine complexity with how often a file changes, and this analysis ran without access to commit history. Connect GitHub from the account menu, then Rescan the repository.'
              : 'Hotspots were added after this analysis ran. Rescan the repository to compute them.'}
          </StateCard>
          <ol className="mx-auto flex max-w-sm flex-col gap-2 text-xs text-muted-foreground">
            {(needsToken ? ['Open the account menu and connect GitHub.', 'Rescan this repository from the workspace header.', 'Come back here: complex files are plotted against their commits.'] : ['Rescan this repository from the workspace header.', 'Come back here: complex files are plotted against their commits.']).map((step, i) => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full border bg-card font-mono text-[11px] font-semibold text-foreground">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          </div>
        </Section>
        {files.length > 0 && <ComplexityList data={data} onOpenFile={onOpenFile} />}
      </div>
    </Page>
  );
}

function ComplexityList({ data, onOpenFile }: { data: any; onOpenFile: (path: string) => void }) {
  const [level, setLevel] = useState<'all' | 'critical' | 'high'>('all');
  const files: { path: string; score: number; lines: number }[] = useMemo(() => (data?.files ?? [])
    .filter((f: any) => f.isCode !== false && (f.complexity?.score ?? 0) > 0)
    .map((f: any) => ({ path: f.path, score: f.complexity.score, lines: f.lines ?? 0 }))
    .sort((a: any, b: any) => b.score - a.score), [data]);
  const shown = files.filter(f => level === 'all' || levelOf(f.score).key === level).slice(0, 100);
  const max = files[0]?.score ?? 1;
  return (
    <Section
      title="Most complex files"
      meta={`top ${shown.length} of ${files.length.toLocaleString()}`}
      icon={FileCode2}
      className="min-h-[320px]"
      bodyClassName="p-0"
      actions={<Segmented label="Complexity level" value={level} onChange={setLevel} options={[
        { value: 'all', label: 'All' },
        { value: 'critical', label: 'Critical', count: files.filter(f => f.score >= 31).length },
        { value: 'high', label: 'High', count: files.filter(f => f.score >= 21 && f.score < 31).length },
      ]} />}
    >
      {shown.length === 0 ? <StateCard icon={FileCode2} title="No files at this level">Pick another level.</StateCard> : (
        <ul className="divide-y">
          {shown.map(f => {
            const lv = levelOf(f.score);
            return (
              <li key={f.path}>
                <button type="button" onClick={() => onOpenFile(f.path)} title={f.path} className="grid w-full grid-cols-[minmax(0,1fr)_minmax(80px,28%)_3rem] items-center gap-3 border-0 bg-transparent px-4 py-2 text-left text-inherit hover:bg-[var(--surface-hover)]">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-semibold">{base(f.path)}</span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{f.path}{f.lines ? ` · ${f.lines.toLocaleString()} lines` : ''}</span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <i className="block h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(2, (f.score / max) * 100)}%` }} />
                  </span>
                  <span className="flex flex-col items-end">
                    <b className="font-mono text-xs font-semibold tabular-nums">{f.score}</b>
                    <span className={cn('text-[10.5px] font-medium', toneText[lv.tone])}>{lv.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
