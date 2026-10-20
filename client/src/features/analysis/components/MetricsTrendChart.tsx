import { useState } from 'react';
import { Activity, GitCommitHorizontal, LineChart as LineChartIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { TrendSnapshot, ActivityPoint } from '../services/trends';
import { Page, PageHeader, Section, Segmented } from '../../../shared/components/Page';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { StateCard } from '../../../shared/components/StateCard';
import type { Tone } from '../../../shared/components/dashboardTones';
import TrendChart, { ChartLegend, vizColor } from './TrendChart';

interface Props {
  snapshots: TrendSnapshot[];
  activityPoints: ActivityPoint[];
  loading: boolean;
  onCommitClick: (sha: string) => void;
}

type MetricKey = 'healthScore' | 'securityCount' | 'fileCount' | 'functionCount' | 'testRatio';

// `better` says which direction is good, so deltas get a state tone.
const METRICS: { key: MetricKey; label: string; short: string; unit?: string; better: 'up' | 'down' | null }[] = [
  { key: 'healthScore', label: 'Health score', short: 'Health', better: 'up' },
  { key: 'securityCount', label: 'Security issues', short: 'Security', better: 'down' },
  { key: 'fileCount', label: 'Files', short: 'Files', better: null },
  { key: 'functionCount', label: 'Functions', short: 'Functions', better: null },
  { key: 'testRatio', label: 'Test ratio', short: 'Tests', unit: '%', better: 'up' },
];

const shortDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

export default function MetricsTrendChart({ snapshots, activityPoints, loading, onCommitClick }: Props) {
  const [metric, setMetric] = useState<MetricKey>('healthScore');
  const def = METRICS.find(m => m.key === metric)!;
  const first = snapshots[0], last = snapshots[snapshots.length - 1];
  const fmt = (v: number) => `${v.toLocaleString()}${def.unit ?? ''}`;
  const totalCommits = activityPoints.reduce((n, p) => n + p.commitCount, 0);
  const peakAuthors = activityPoints.reduce((n, p) => Math.max(n, p.authorCount), 0);

  const tile = (m: typeof METRICS[number]) => {
    const d = last && first ? (last[m.key] as number) - (first[m.key] as number) : 0;
    const tone: Tone = !d || !m.better ? 'neutral' : (d > 0) === (m.better === 'up') ? 'good' : 'bad';
    return {
      label: m.label,
      value: last ? `${(last[m.key] as number).toLocaleString()}${m.unit ?? ''}` : '—',
      sub: snapshots.length > 1 ? `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}${m.unit ?? ''} over ${snapshots.length} commits${metric === m.key ? ' · shown' : ''}` : metric === m.key ? 'Shown' : undefined,
      tone,
      onClick: () => setMetric(m.key),
    };
  };

  return (
    <Page>
      <PageHeader
        icon={LineChartIcon}
        tone="quality"
        title="Trends"
        description="How quality moved across recent commits, and how active the repository has been week by week. Click a point or a commit to open it."
      />

      {loading ? (
        <>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{METRICS.map(m => <Skeleton key={m.key} className="h-[84px] rounded-xl" />)}</div>
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
            <Section title="Quality" meta="Analysing recent commits…" icon={LineChartIcon}><Skeleton className="h-full min-h-48 w-full" /></Section>
            <Section title="Commits"><div className="flex flex-col gap-3">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div></Section>
          </div>
        </>
      ) : snapshots.length < 2 && activityPoints.length === 0 ? (
        <Section className="flex-1">
          <StateCard icon={LineChartIcon} title="Not enough history yet">
            Trends need at least two analysable commits on this branch. Push a few commits (or switch to a branch with history), then reopen this page.
          </StateCard>
        </Section>
      ) : (
        <>
          {last && <SummaryStrip items={METRICS.map(tile)} />}
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] lg:grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <Section
              title="Quality"
              meta={`last ${snapshots.length} commits`}
              icon={LineChartIcon}
              className="min-h-[300px]"
              bodyClassName="flex flex-col"
              actions={<Segmented label="Metric" value={metric} onChange={setMetric} options={METRICS.map(m => ({ value: m.key, label: m.short }))} />}
            >
              {snapshots.length < 2
                ? <StateCard icon={LineChartIcon} title="Not enough commits">Quality trends need at least two analysable commits.</StateCard>
                : <TrendChart
                    labels={snapshots.map(s => s.shortSha)}
                    sublabels={snapshots.map(s => shortDate(s.date))}
                    series={[{ label: def.label, color: vizColor(0), values: snapshots.map(s => s[metric] as number) }]}
                    format={fmt}
                    ariaLabel={`${def.label} across the last ${snapshots.length} commits`}
                    tooltipTitle={i => <span className="flex flex-col gap-0.5"><span className="font-mono">{snapshots[i].shortSha} · {shortDate(snapshots[i].date)}</span><span className="line-clamp-2 font-normal text-muted-foreground">{snapshots[i].message}</span></span>}
                    onPointClick={i => onCommitClick(snapshots[i].sha)}
                  />}
            </Section>

            <Section title="Commits" meta={`${snapshots.length} analysed`} icon={GitCommitHorizontal} className="min-h-[260px] lg:row-span-2" bodyClassName="p-0">
              {snapshots.length === 0 ? <StateCard icon={GitCommitHorizontal} title="No analysed commits">Commit metrics could not be read for this branch.</StateCard> : (
                <ul className="divide-y">
                  {[...snapshots].reverse().map((s, idx) => {
                    const prev = snapshots[snapshots.length - 2 - idx];
                    const d = prev ? (s[metric] as number) - (prev[metric] as number) : 0;
                    const tone = !d || !def.better ? 'text-muted-foreground' : (d > 0) === (def.better === 'up') ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]';
                    return (
                      <li key={s.sha}>
                        <button type="button" onClick={() => onCommitClick(s.sha)} className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-card text-muted-foreground"><GitCommitHorizontal className="size-4" /></span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[13px] font-semibold">{s.message || s.shortSha}</span>
                            <span className="truncate text-xs text-muted-foreground"><span className="font-mono">{s.shortSha}</span> · {s.author} · {shortDate(s.date)}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end">
                            <b className="font-mono text-xs font-semibold tabular-nums">{fmt(s[metric] as number)}</b>
                            {prev && <span className={cn('font-mono text-[11px] tabular-nums', tone)}>{d > 0 ? '+' : ''}{Math.round(d * 10) / 10}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section
              title="Activity"
              meta={activityPoints.length ? `${totalCommits} commits over ${activityPoints.length} weeks · up to ${peakAuthors} author${peakAuthors === 1 ? '' : 's'} a week` : undefined}
              icon={Activity}
              className="min-h-[220px]"
              bodyClassName="flex flex-col gap-2"
            >
              {activityPoints.length === 0 ? <StateCard icon={Activity} title="No recent activity">No commits were found in the last weeks.</StateCard> : (() => {
                const series = [
                  { label: 'Commits', color: vizColor(0), values: activityPoints.map(p => p.commitCount) },
                  { label: 'Authors', color: vizColor(1), values: activityPoints.map(p => p.authorCount) },
                ];
                return <>
                  <ChartLegend series={series} />
                  <TrendChart kind="bar" labels={activityPoints.map(p => p.weekLabel)} series={series} ariaLabel="Commits and authors per week" tooltipTitle={i => `Week of ${activityPoints[i].weekLabel}`} />
                </>;
              })()}
            </Section>
          </div>
        </>
      )}
    </Page>
  );
}
