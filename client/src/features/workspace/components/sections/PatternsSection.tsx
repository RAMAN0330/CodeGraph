import { useMemo, useState } from 'react';
import {
  AlertTriangle, Box, Building2, CheckCircle2, Database, Download, Eye, Factory, FileCode2,
  Globe, Layers, Lightbulb, Link2, Lock, Puzzle, Radio, RefreshCw, Route, ScrollText,
  Search, Shapes, Sparkles, Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { downloadCsv } from '../../../../shared/services/exportCsv';
import { patternReferenceFor } from '../../../analysis/data/patternReference';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../../shared/components/Page';
import { toneText } from '../../../../shared/components/dashboardTones';

interface PatternFile {
  name: string;
  path: string;
  fns?: number;
  lines?: number;
}

interface Pattern {
  icon: string;
  name: string;
  desc: string;
  severity?: 'info' | 'warning';
  isAnti?: boolean;
  files: PatternFile[];
  metrics?: Record<string, number>;
}

interface Props {
  data: { patterns?: Pattern[] } | null;
  onSelectFile?: (path: string) => void;
  onViewSource?: (path: string, line?: number) => void;
}

type Category = 'all' | 'design' | 'anti';

const ICONS: Record<string, any> = {
  lock: Lock, factory: Factory, eye: Eye, hook: Workflow, spark: Sparkles,
  globe: Globe, layout: Building2, box: Box, building: Building2, route: Route,
  database: Database, layers: Layers, refresh: RefreshCw, puzzle: Puzzle,
  radio: Radio, link: Link2, warning: AlertTriangle, scroll: ScrollText,
};

function iconFor(pattern: Pattern) {
  return ICONS[pattern.icon] ?? Shapes;
}

function isAntiPattern(pattern: Pattern) {
  return !!pattern.isAnti || pattern.severity === 'warning';
}

function KindLabel({ anti }: { anti: boolean }) {
  return anti
    ? <span className={cn('inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold', toneText.warn)}><AlertTriangle className="size-3" />Anti-pattern</span>
    : <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary"><CheckCircle2 className="size-3" />Design pattern</span>;
}

const uniqueFiles = (list: Pattern[]) => new Set(list.flatMap(p => p.files.map(f => f.path))).size;

export default function PatternsSection({ data, onSelectFile, onViewSource }: Props) {
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const patterns = useMemo(() => data?.patterns ?? [], [data]);

  const stats = useMemo(() => {
    const anti = patterns.filter(isAntiPattern);
    const design = patterns.filter(p => !isAntiPattern(p));
    return { anti, design, files: uniqueFiles(patterns), antiFiles: uniqueFiles(anti) };
  }, [patterns]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patterns
      .filter(p => {
        if (category === 'design' && isAntiPattern(p)) return false;
        if (category === 'anti' && !isAntiPattern(p)) return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q) || p.files.some(f => f.path.toLowerCase().includes(q));
      })
      // Anti-patterns first (they need action), then by how many files they touch.
      .sort((a, b) => Number(isAntiPattern(b)) - Number(isAntiPattern(a)) || b.files.length - a.files.length);
  }, [patterns, category, query]);

  const selected = visible.find(p => p.name === selectedName) ?? visible[0] ?? null;

  if (!data) {
    return (
      <Page>
        <PageHeader icon={Shapes} tone="patterns" title="Patterns" description="Design patterns and anti-patterns detected across your codebase." />
        <Section className="flex-1"><StateCard icon={Shapes} title="No analysis yet">Analyze a repository to detect design patterns and anti-patterns in its code structure.</StateCard></Section>
      </Page>
    );
  }

  const toggle = (value: Category) => setCategory(category === value ? 'all' : value);
  const groups = [
    { anti: true, title: 'Anti-patterns', hint: 'Structural smells worth fixing', items: visible.filter(isAntiPattern) },
    { anti: false, title: 'Design patterns', hint: 'Recognised structure in your code', items: visible.filter(p => !isAntiPattern(p)) },
  ].filter(g => g.items.length);

  return (
    <Page>
      <PageHeader
        icon={Shapes}
        tone="patterns"
        title="Patterns"
        description="Recognised design patterns show how the code is organised; anti-patterns flag structure that makes it harder to change. Pick one to see what it means and which files it covers."
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!visible.length} onClick={() => downloadCsv('patterns.csv', ['Pattern', 'Type', 'Files', 'Description'], visible.map(p => [p.name, isAntiPattern(p) ? 'Anti-pattern' : 'Design pattern', p.files.length, p.desc]))}>
            <Download className="size-3.5" /> Export CSV
          </Button>
        }
      />

      <SummaryStrip items={[
        { label: 'Anti-patterns', value: stats.anti.length, tone: stats.anti.length ? 'warn' : 'good', sub: category === 'anti' ? 'Click to clear' : stats.anti.length ? 'Review these first' : 'None found', onClick: () => toggle('anti') },
        { label: 'Design patterns', value: stats.design.length, sub: category === 'design' ? 'Click to clear' : 'Recognised structure', onClick: () => toggle('design') },
        { label: 'Files involved', value: stats.files, sub: 'Across all patterns' },
        { label: 'Files with smells', value: stats.antiFiles, tone: stats.antiFiles ? 'warn' : 'good', sub: stats.files ? `${Math.round((stats.antiFiles / stats.files) * 100)}% of files involved` : 'None' },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="p-0 flex flex-col">
          <div className="border-b px-4 py-3">
            <Toolbar count={`${visible.length} pattern${visible.length === 1 ? '' : 's'}`}>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search patterns or files" aria-label="Search patterns" className="h-8 w-52 bg-card pl-8 text-xs" />
              </span>
              <Segmented label="Filter patterns" value={category} onChange={setCategory} options={[
                { value: 'all', label: 'All', count: patterns.length },
                { value: 'anti', label: 'Anti-patterns', count: stats.anti.length },
                { value: 'design', label: 'Design', count: stats.design.length },
              ]} />
            </Toolbar>
          </div>

          {visible.length === 0 ? (
            <StateCard
              icon={Shapes}
              title={patterns.length === 0 ? 'No patterns detected' : 'No matching patterns'}
              action={patterns.length > 0 && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setQuery(''); setCategory('all'); }}>Clear filters</Button>}
            >
              {patterns.length === 0
                ? 'Patterns are detected from code structure and naming. None matched in this repository; re-analyze after larger changes.'
                : 'Nothing matches this category and search.'}
            </StateCard>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {groups.map(group => (
                <section key={group.title} aria-label={group.title}>
                  <h3 className="sticky top-0 z-10 flex items-center gap-2 border-b bg-[var(--surface-subtle)] px-4 py-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <span className={group.anti ? toneText.warn : 'text-primary'}>{group.title}</span>
                    <span className="font-mono tabular-nums">{group.items.length}</span>
                    <span className="ml-auto truncate font-normal tracking-normal normal-case">{group.hint}</span>
                  </h3>
                  <ul className="divide-y border-b">
                    {group.items.map(pattern => {
                      const Glyph = iconFor(pattern);
                      const active = selected?.name === pattern.name;
                      return (
                        <li key={pattern.name}>
                          <button type="button" onClick={() => setSelectedName(pattern.name)} aria-current={active} className={cn('flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}>
                            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card', group.anti ? toneText.warn : 'text-primary')}><Glyph className="size-4" strokeWidth={1.8} /></span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-[13px] font-semibold">{pattern.name}</span>
                              <span className="truncate text-xs text-muted-foreground">{pattern.desc}</span>
                            </span>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{pattern.files.length} file{pattern.files.length === 1 ? '' : 's'}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Section>

        {selected
          ? <PatternDetail key={selected.name} pattern={selected} onSelectFile={onSelectFile} onViewSource={onViewSource} />
          : <Section className="min-h-[320px]"><StateCard icon={Shapes} title="Nothing selected">Pick a pattern to see what it means and which files it covers.</StateCard></Section>}
      </div>
    </Page>
  );
}

function PatternDetail({
  pattern, onSelectFile, onViewSource,
}: {
  pattern: Pattern;
  onSelectFile?: (path: string) => void;
  onViewSource?: (path: string, line?: number) => void;
}) {
  const Glyph = iconFor(pattern);
  const anti = isAntiPattern(pattern);
  const reference = patternReferenceFor(pattern.name);
  const metrics = Object.entries(pattern.metrics ?? {});
  const heading = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase';

  return (
    <Section className="min-h-[320px]" bodyClassName="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-3" aria-label={`${pattern.name} details`}>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl border bg-card', anti ? toneText.warn : 'text-primary')}><Glyph className="size-5" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <KindLabel anti={anti} />
          <h2 className="mt-1 text-base leading-snug font-semibold">{pattern.name}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{pattern.desc}</p>
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
          {metrics.map(([key, value]) => (
            <div key={key} className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
              <strong className="font-mono text-lg leading-tight font-semibold tabular-nums">{value.toLocaleString()}</strong>
              <span className="truncate text-[11px] text-muted-foreground" title={key}>{key}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <h3 className={heading}>{anti ? "Why it's a risk" : 'What it means'}</h3>
        <p className="text-[13px] leading-relaxed">{reference.why}</p>
      </div>

      {reference.recommendation && (
        <div className="flex items-start gap-2.5 rounded-lg border bg-card p-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <h3 className={heading}>What to do</h3>
            <p className="mt-1 text-[13px] leading-relaxed">{reference.recommendation}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className={heading}>Affected files · {pattern.files.length}</h3>
        {pattern.files.length === 0 ? (
          <p className="text-xs text-muted-foreground">This pattern was detected without specific files attached.</p>
        ) : (
          <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
            {pattern.files.map((file, i) => (
              <li key={`${file.path}-${i}`} className="flex items-center gap-2 pr-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left text-inherit hover:bg-[var(--surface-hover)]" onClick={() => onSelectFile?.(file.path)} aria-label={`Open ${file.path}`}>
                  <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="truncate text-xs font-semibold">{file.name}</strong>
                    <code className="truncate font-mono text-[11px] text-muted-foreground">{file.path}</code>
                  </span>
                  <span className="shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                    {file.fns != null && <span>{file.fns} fns</span>}
                    {file.fns != null && file.lines != null && ' · '}
                    {file.lines != null && <span>{file.lines.toLocaleString()} lines</span>}
                  </span>
                </button>
                {onViewSource && (
                  <Button variant="ghost" size="icon-sm" onClick={() => onViewSource(file.path)} aria-label={`View source of ${file.path}`}><Eye className="size-3.5" /></Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
