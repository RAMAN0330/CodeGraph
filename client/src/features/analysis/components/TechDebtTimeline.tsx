import { useState, useEffect } from 'react';
import { AlertTriangle, FileCode2, FlaskConical, History, Skull } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SummaryStrip } from '../../../shared/components/SummaryStrip';
import { Page, PageHeader, Section } from '../../../shared/components/Page';
import { StateCard } from '../../../shared/components/StateCard';
import { githubFetch } from '../../repository/services/github';
import TrendChart, { vizColor } from './TrendChart';

interface DataPoint {
  index: number;
  sha7: string;
  date: string;
  message: string;
  totalFiles: number;
  testFiles: number;
  debtFiles: number;
  isCurrent: boolean;
}

interface TechDebtTimelineProps {
  owner: string;
  repo: string;
  token: string;
  currentData: any;
}

const TEST = (p: string) => p.includes('.test.') || p.includes('.spec.');
const DEBT = /legacy|old_|temp_|hack|todo/i;
const shortDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

export default function TechDebtTimeline({ owner, repo, token, currentData }: TechDebtTimelineProps) {
  const [points, setPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const commitsRes = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`, token);
        if (!commitsRes.ok) throw new Error(`GitHub API error: ${commitsRes.status}`);
        const commits: any[] = await commitsRes.json();
        if (!Array.isArray(commits) || commits.length === 0) throw new Error('No commits found');

        // Oldest first. Historical trees are fetched in parallel; the newest commit reuses the current analysis.
        const chronological = [...commits].reverse();
        const dataPoints = await Promise.all(chronological.map(async (commit, i): Promise<DataPoint> => {
          const isCurrent = i === chronological.length - 1;
          let totalFiles = 0, testFiles = 0, debtFiles = 0;
          if (isCurrent && currentData?.stats) {
            const paths: string[] = (currentData.files || []).map((f: any) => f.path || f.name || '');
            totalFiles = currentData.stats.files || 0;
            testFiles = paths.filter(TEST).length;
            debtFiles = paths.filter(p => DEBT.test(p)).length;
          } else {
            try {
              const treeRes = await githubFetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commit.sha}?recursive=1`, token);
              if (treeRes.ok) {
                const blobs: string[] = ((await treeRes.json()).tree || []).filter((item: any) => item.type === 'blob').map((item: any) => item.path);
                totalFiles = blobs.length;
                testFiles = blobs.filter(TEST).length;
                debtFiles = blobs.filter(p => DEBT.test(p)).length;
              }
            } catch {
              // Use 0 counts if tree fetch fails
            }
          }
          return {
            index: i,
            sha7: commit.sha.slice(0, 7),
            date: commit.commit?.author?.date ?? '',
            message: (commit.commit?.message ?? '').split('\n')[0],
            totalFiles, testFiles, debtFiles, isCurrent,
          };
        }));

        // A tree that failed to load reads as 0 files; leave it out rather than chart a fake drop.
        const readable = dataPoints.filter(p => p.isCurrent || p.totalFiles > 0).map((p, i) => ({ ...p, index: i }));
        if (!cancelled) { setPoints(readable); setSkipped(dataPoints.length - readable.length); }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to build tech debt timeline');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [owner, repo, token]); // eslint-disable-line react-hooks/exhaustive-deps -- currentData only fills the newest point

  const header = (
    <PageHeader
      icon={History}
      tone="quality"
      title="Tech debt timeline"
      description={points.length
        ? `File, test and debt-named file counts across the last ${points.length} commits. The newest point is the current analysis.${skipped ? ` ${skipped} commit${skipped === 1 ? '' : 's'} could not be read and ${skipped === 1 ? 'is' : 'are'} left out.` : ''}`
        : 'File, test and debt-named file counts across recent commits.'}
    />
  );

  if (loading) {
    return (
      <Page>
        {header}
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[84px] rounded-xl" />)}</div>
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Section title="Files" meta="Reading commit trees…"><Skeleton className="h-full min-h-48 w-full" /></Section>
          <div className="grid min-h-0 gap-3 lg:grid-rows-2">
            <Section title="Test files"><Skeleton className="h-full min-h-24 w-full" /></Section>
            <Section title="Debt-named files"><Skeleton className="h-full min-h-24 w-full" /></Section>
          </div>
        </div>
      </Page>
    );
  }
  if (error || !points.length) {
    return (
      <Page>
        {header}
        <Section className="flex-1">
          <StateCard icon={AlertTriangle} title={error ? 'Could not read commit history' : 'No commits found'}>
            {error ? `${error}. Check that GitHub is connected from the account menu and that this repository is reachable, then reopen this page.` : 'This branch has no commits to chart yet.'}
          </StateCard>
        </Section>
      </Page>
    );
  }

  const stats = currentData?.stats || {};
  const first = points[0], last = points[points.length - 1];
  const delta = (key: 'totalFiles' | 'testFiles' | 'debtFiles') => {
    const d = last[key] - first[key];
    return `${d > 0 ? '+' : ''}${d} over ${points.length} commits`;
  };
  const labels = points.map(p => p.sha7);
  const sublabels = points.map(p => shortDate(p.date));
  const title = (i: number) => (
    <span className="flex flex-col gap-0.5">
      <span className="font-mono">{points[i].sha7} · {shortDate(points[i].date)}{points[i].isCurrent ? ' · current' : ''}</span>
      {points[i].message && <span className="line-clamp-2 font-normal text-muted-foreground">{points[i].message}</span>}
    </span>
  );
  const chart = (key: 'totalFiles' | 'testFiles' | 'debtFiles', label: string) => (
    <TrendChart
      labels={labels}
      sublabels={sublabels}
      series={[{ label, color: vizColor(0), values: points.map(p => p[key]) }]}
      tooltipTitle={title}
      ariaLabel={`${label} across the last ${points.length} commits`}
    />
  );

  return (
    <Page>
      {header}
      <SummaryStrip items={[
        { label: 'Files', value: last.totalFiles, sub: delta('totalFiles') },
        { label: 'Test files', value: last.testFiles, tone: last.testFiles >= first.testFiles ? 'good' : 'warn', sub: delta('testFiles') },
        { label: 'Debt-named files', value: last.debtFiles, tone: last.debtFiles ? 'warn' : 'good', sub: delta('debtFiles') },
        { label: 'Dead functions', value: stats.dead ?? 0, tone: stats.dead ? 'bad' : 'good', sub: 'Current analysis' },
        { label: 'Issues', value: currentData?.issues?.length ?? 0, tone: currentData?.issues?.length ? 'warn' : 'good', sub: 'Current analysis' },
        { label: 'Duplicates', value: stats.duplicates ?? 0, tone: stats.duplicates ? 'warn' : 'good', sub: 'Current analysis' },
      ]} />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Files" meta="all tracked files" icon={FileCode2} className="min-h-[300px]" bodyClassName="flex flex-col">{chart('totalFiles', 'Files')}</Section>
        <div className="grid min-h-0 gap-3 lg:grid-rows-2">
          <Section title="Test files" meta=".test. / .spec." icon={FlaskConical} className="min-h-[200px]" bodyClassName="flex flex-col">{chart('testFiles', 'Test files')}</Section>
          <Section title="Debt-named files" meta="legacy, old_, temp_, hack, todo" icon={Skull} className="min-h-[200px]" bodyClassName="flex flex-col">{chart('debtFiles', 'Debt-named files')}</Section>
        </div>
      </div>
    </Page>
  );
}
