import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Bug, Check, Copy, Database, Download, ExternalLink, FileCode2, Globe, Info,
  KeyRound, LayoutGrid, List, Lock, Package, Play, Search, ShieldAlert, ShieldCheck, Terminal, Wrench,
} from 'lucide-react';
import type { VulnResult } from '../../../security/services/osv';
import { referenceFor } from '../../../security/data/issueReference';
import { vulnReach, type Reach } from '../../../security/services/vulnReach';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';
import { Page, PageHeader, Section, Segmented, Toolbar } from '../../../../shared/components/Page';
import { toneText, type Tone } from '../../../../shared/components/dashboardTones';
import { downloadCsv } from '../../../../shared/services/exportCsv';

type Severity = 'high' | 'medium' | 'low' | 'info';
type SortKey = 'severity' | 'title' | 'file';

interface SecurityIssue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  desc: string;
  file?: string;
  path?: string;
  line?: number;
  code?: string;
}

interface Props {
  // packageUsage + connections give dependency advisories their reach.
  data: { securityIssues?: SecurityIssue[]; packageUsage?: Record<string, string[]>; connections?: any[] } | null;
  vulns: VulnResult[];
  vulnLoading: boolean;
  vulnError: string | null;
  onSelectIssue?: (issue: SecurityIssue) => void;
  onRescan?: () => void;
  scanning?: boolean;
  repoInfo?: { owner: string; repo: string } | null;
  currentBranch?: string;
  onOpenFile?: (path: string) => void;
}

/** A code finding and a dependency advisory, normalised into one row type. */
interface Finding {
  id: string;
  kind: 'code' | 'dependency';
  severity: Severity;
  title: string;
  desc: string;
  file?: string;
  path?: string;
  line?: number;
  code?: string;
  url?: string;
  raw?: SecurityIssue;
  // Dependency advisories: which files import the package (null = unknown).
  reach?: Reach | null;
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };
const SEVERITY_TONE: Record<Severity, Tone> = { high: 'bad', medium: 'warn', low: 'neutral', info: 'neutral' };
const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-[var(--color-danger)]',
  medium: 'bg-[var(--color-warning)]',
  low: 'bg-muted-foreground',
  info: 'border border-muted-foreground bg-transparent',
};
const SORT_LABEL: Record<SortKey, string> = { severity: 'Severity', title: 'Title', file: 'File' };
// Large repos produce hundreds of findings; render in pages so the list stays quick.
const PAGE_SIZE = 150;

const DEP_SEVERITY: Record<VulnResult['severity'], Severity> = {
  CRITICAL: 'high', HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'info',
};

/** Detector title -> glyph. Keeps the list scannable by weakness class. */
function iconFor(finding: Finding) {
  if (finding.kind === 'dependency') return Package;
  const t = finding.title;
  if (t === 'Hardcoded Secret') return KeyRound;
  if (t === 'SQL Injection Risk') return Database;
  if (t === 'XSS Vulnerability') return Globe;
  if (t === 'Debug Statements' || t === 'Code Comments' || t === 'Debug Mode Enabled') return Bug;
  if (/Shell|Command|exec|eval|Function Constructor|Import|Pickle|SendKeys/i.test(t)) return Terminal;
  if (/Except|Error|Assert/i.test(t)) return Info;
  return Lock;
}

function reachText(reach: Reach | null | undefined): string {
  if (!reach) return '';
  if (!reach.importers.length) return ' Not imported by any source file — likely build tooling or a transitive dependency.';
  return ` Imported by ${reach.importers.length} file${reach.importers.length === 1 ? '' : 's'}${reach.downstream ? `; ${reach.downstream} more depend on them` : ''}.`;
}

function location(f: Finding) {
  return f.path ? `${f.path}${f.line ? `:${f.line}` : ''}` : '';
}

function toFindings(issues: SecurityIssue[], vulns: VulnResult[], data: Props['data']): Finding[] {
  const code: Finding[] = issues.map((issue, i) => ({
    id: `code-${i}-${issue.path ?? issue.file ?? ''}-${issue.title}`,
    kind: 'code',
    severity: issue.severity,
    title: issue.title,
    desc: issue.desc,
    file: issue.file,
    path: issue.path,
    line: issue.line,
    code: issue.code,
    raw: issue,
  }));

  const deps: Finding[] = vulns.map((v, i) => {
    const reach = vulnReach(v.pkg, v.ecosystem, data);
    return {
      id: `dep-${i}-${v.pkg}-${v.cveId}`,
      kind: 'dependency',
      severity: DEP_SEVERITY[v.severity],
      title: `Vulnerable Dependency: ${v.pkg}`,
      desc: (v.summary || `${v.pkg} ${v.version} is affected by a published advisory.`) + reachText(reach),
      reach,
      file: `${v.pkg}@${v.version}`,
      path: `${v.ecosystem} · ${v.pkg} ${v.version}`,
      code: v.cveId,
      url: v.url,
    };
  });

  return [...code, ...deps];
}

function SeverityLabel({ severity, suffix }: { severity: Severity; suffix?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold', toneText[SEVERITY_TONE[severity]])}>
      <i className={cn('size-1.5 rounded-full', SEVERITY_DOT[severity])} aria-hidden="true" />{SEVERITY_LABEL[severity]}{suffix}
    </span>
  );
}

export default function SecuritySection({
  data, vulns, vulnLoading, vulnError, onSelectIssue, onRescan, scanning, repoInfo, currentBranch, onOpenFile,
}: Props) {
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('severity');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const searchRef = useRef<HTMLInputElement>(null);

  const findings = useMemo(
    () => toFindings(data?.securityIssues ?? [], vulns ?? [], data),
    [data, vulns],
  );

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach(f => { c[f.severity]++; });
    return c;
  }, [findings]);

  // Files with the most findings: where fixing time pays back first.
  const topFile = useMemo(() => {
    const perFile = new Map<string, number>();
    findings.forEach(f => { if (f.kind === 'code' && f.path) perFile.set(f.path, (perFile.get(f.path) ?? 0) + 1); });
    return [...perFile.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [findings]);
  const dependencyCount = findings.filter(f => f.kind === 'dependency').length;
  const reachable = findings.filter(f => f.kind === 'dependency' && f.reach?.importers.length).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = findings.filter(f => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (!q) return true;
      return [f.title, f.desc, f.path, f.file, f.code]
        .some(v => v && v.toLowerCase().includes(q));
    });
    return filtered.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'file') return (a.path ?? '').localeCompare(b.path ?? '');
      // Same severity: advisories for packages the code actually imports, widest reach first.
      const reachOf = (f: Finding) => (f.reach ? f.reach.importers.length + f.reach.downstream : -1);
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || reachOf(b) - reachOf(a) || a.title.localeCompare(b.title);
    });
  }, [findings, severityFilter, query, sortBy]);

  // The detail pane always shows something: the chosen finding, else the top one.
  const selected = visible.find(f => f.id === selectedId) ?? visible[0] ?? null;

  // ⌘K / Ctrl-K focuses the finding search, matching the shortcut shown in the field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1600);
    }).catch(() => {});
  }

  function select(finding: Finding) {
    setSelectedId(finding.id);
    if (finding.kind === 'code' && finding.raw) onSelectIssue?.(finding.raw);
  }

  const setSeverity = (value: Severity | 'all') => { setSeverityFilter(value); setLimit(PAGE_SIZE); };
  const toggleSeverity = (value: Severity) => setSeverity(severityFilter === value ? 'all' : value);

  const scanButton = onRescan && (
    <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onRescan} disabled={scanning}>
      <Play className="size-3.5" /> {scanning ? 'Scanning…' : 'Run scan'}
    </Button>
  );

  if (!data) {
    return (
      <Page>
        <PageHeader icon={ShieldAlert} tone="security" title="Security" description="Scan your code and dependencies for vulnerabilities, secrets and risky patterns." actions={scanButton} />
        <Section className="flex-1"><StateCard icon={ShieldAlert} title="No scan yet" action={scanButton}>Analyze a repository to scan it for vulnerabilities, secrets and security risks.</StateCard></Section>
      </Page>
    );
  }

  const exportCsv = () => downloadCsv(
    'security-findings.csv',
    ['Severity', 'Type', 'Title', 'Location', 'Line', 'Description'],
    visible.map(f => [SEVERITY_LABEL[f.severity], f.kind, f.title, f.path ?? '', f.line ?? '', f.desc]),
  );
  const sub = (s: Severity, idle: string) => (severityFilter === s ? 'Click to clear' : idle);

  return (
    <Page>
      <PageHeader
        icon={ShieldAlert}
        tone="security"
        title="Security"
        description="Vulnerabilities, secrets and risky patterns in your code, plus published advisories for your dependencies. Each finding says where it is and how to fix it."
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!visible.length} onClick={exportCsv}>
              <Download className="size-3.5" /> Export CSV
            </Button>
            {scanButton}
          </>
        }
      />

      <SummaryStrip items={[
        { label: 'High', value: counts.high, tone: counts.high ? 'bad' : 'good', sub: sub('high', counts.high ? 'Fix first' : 'None found'), onClick: () => toggleSeverity('high') },
        { label: 'Medium', value: counts.medium, tone: counts.medium ? 'warn' : 'good', sub: sub('medium', counts.medium ? 'Plan a fix' : 'None found'), onClick: () => toggleSeverity('medium') },
        { label: 'Low', value: counts.low, sub: sub('low', 'Hardening'), onClick: () => toggleSeverity('low') },
        { label: 'Info', value: counts.info, sub: sub('info', 'Unrated advisories'), onClick: () => toggleSeverity('info') },
        { label: 'Dependencies', value: vulnLoading ? '…' : dependencyCount, tone: reachable ? 'warn' : 'neutral', sub: vulnLoading ? 'Scanning' : reachable ? `${reachable} imported by your code` : 'None reachable' },
        { label: 'Most findings', value: topFile ? topFile[1] : 0, sub: topFile ? <span title={topFile[0]}>{topFile[0].split('/').slice(-2).join('/')}</span> : 'No hot file', onClick: topFile ? () => { setQuery(topFile[0]); setLimit(PAGE_SIZE); } : undefined },
      ]} />

      {vulnError && (
        <p role="alert" className="flex shrink-0 items-center gap-2 rounded-lg border bg-[var(--surface-subtle)] px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className={cn('size-3.5 shrink-0', toneText.warn)} /> Dependency scan unavailable: {vulnError}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)]">
        <Section className="min-h-[320px]" bodyClassName="p-0 flex flex-col">
          <div className="flex flex-col gap-2 border-b px-4 py-3">
            <Toolbar count={<>{visible.length.toLocaleString()} finding{visible.length === 1 ? '' : 's'}{vulnLoading && <span className="ml-2 text-xs font-normal text-muted-foreground">Scanning dependencies…</span>}</>}>
              <Select value={sortBy} onValueChange={v => setSortBy(v as SortKey)}>
                <SelectTrigger size="sm" className="h-8 bg-card text-xs" aria-label="Sort findings">
                  <span className="text-muted-foreground">Sort:</span><SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map(k => <SelectItem key={k} value={k} className="text-xs">{SORT_LABEL[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Segmented label="Layout" value={view} onChange={setView} options={[
                { value: 'list', label: <><List className="size-3.5" /><span className="sr-only">List view</span></> },
                { value: 'grid', label: <><LayoutGrid className="size-3.5" /><span className="sr-only">Grid view</span></> },
              ]} />
            </Toolbar>
            <div className="flex flex-wrap items-center gap-2">
              <span className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input ref={searchRef} value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE_SIZE); }} placeholder="Search issues, files, CVEs" aria-label="Search findings" className="h-8 bg-card pr-10 pl-8 text-xs" />
                <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-[var(--surface-subtle)] px-1 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
              </span>
              <Segmented label="Filter by severity" value={severityFilter} onChange={setSeverity} options={[
                { value: 'all', label: 'All', count: findings.length },
                ...(['high', 'medium', 'low', 'info'] as Severity[]).map(s => ({ value: s, label: SEVERITY_LABEL[s], count: counts[s] })),
              ]} />
            </div>
          </div>

          {visible.length === 0 ? (
            <StateCard
              icon={ShieldCheck}
              title={findings.length === 0 ? 'No security issues detected' : 'No matching findings'}
              action={findings.length > 0 && <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setQuery(''); setSeverity('all'); }}>Clear filters</Button>}
            >
              {findings.length === 0
                ? 'This scan found no vulnerabilities, secrets or risky patterns. Run the scan again after new commits.'
                : 'Nothing matches this severity and search. Clear the filters to see every finding.'}
            </StateCard>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className={cn(view === 'list' ? 'divide-y' : 'grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2 p-3')}>
                {visible.slice(0, limit).map(finding => {
                  const Glyph = iconFor(finding);
                  const active = selected?.id === finding.id;
                  const where = finding.kind === 'dependency' ? finding.file : location(finding);
                  return (
                    <li key={finding.id}>
                      {view === 'list' ? (
                        <button type="button" onClick={() => select(finding)} aria-current={active} className={cn('flex w-full items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'bg-[var(--surface-hover)]')}>
                          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg border bg-card', toneText[SEVERITY_TONE[finding.severity]])}><Glyph className="size-4" strokeWidth={1.8} /></span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[13px] font-semibold">{finding.title}</span>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">{where || finding.desc}</span>
                          </span>
                          <SeverityLabel severity={finding.severity} />
                        </button>
                      ) : (
                        <button type="button" onClick={() => select(finding)} aria-current={active} className={cn('flex h-full w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left text-inherit hover:bg-[var(--surface-hover)]', active && 'border-primary bg-[var(--surface-hover)]')}>
                          <span className="flex items-center justify-between gap-2">
                            <span className={cn('grid size-7 place-items-center rounded-md border', toneText[SEVERITY_TONE[finding.severity]])}><Glyph className="size-3.5" strokeWidth={1.8} /></span>
                            <SeverityLabel severity={finding.severity} />
                          </span>
                          <span className="line-clamp-2 text-[13px] font-semibold">{finding.title}</span>
                          <span className="line-clamp-2 text-xs text-muted-foreground">{finding.desc}</span>
                          {where && <span className="mt-auto truncate font-mono text-[11px] text-muted-foreground">{where}</span>}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {visible.length > limit && (
                <div className="p-3 text-center">
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setLimit(l => l + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, visible.length - limit)} more of {(visible.length - limit).toLocaleString()}</Button>
                </div>
              )}
            </div>
          )}
        </Section>

        {selected
          ? <SecurityDetail key={selected.id} finding={selected} onCopy={copy} copied={copied} repoInfo={repoInfo} currentBranch={currentBranch} onOpenFile={onOpenFile} />
          : <Section className="min-h-[320px]"><StateCard icon={ShieldCheck} title="Nothing selected">Pick a finding to see what it is, where it is and how to fix it.</StateCard></Section>}
      </div>
    </Page>
  );
}

function SecurityDetail({
  finding, onCopy, copied, repoInfo, currentBranch, onOpenFile,
}: {
  finding: Finding;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
  repoInfo?: { owner: string; repo: string } | null;
  currentBranch?: string;
  onOpenFile?: (path: string) => void;
}) {
  const Glyph = iconFor(finding);
  const reference = referenceFor(finding.title);
  const isDependency = finding.kind === 'dependency';
  const heading = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase';

  const tags = isDependency
    ? [finding.code, 'Dependency', 'OWASP A06'].filter(Boolean) as string[]
    : reference.tags;

  const why = isDependency
    ? 'A published advisory affects this package at the installed version. Vulnerable dependencies are exploited through your application without any flaw in your own code.'
    : reference.why;

  const fix = isDependency
    ? 'Upgrade to a release that is outside the advisory’s affected range, then re-run the scan to confirm. If no fixed release exists, assess whether the affected code path is reachable.'
    : reference.fix;

  const resources = isDependency
    ? [
        ...(finding.url ? [{ label: `Advisory: ${finding.code || 'details'}`, url: finding.url }] : []),
        { label: 'OWASP Top 10 A06: Vulnerable Components', url: 'https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/' },
      ]
    : reference.resources;

  const blobUrl = repoInfo && finding.path && !isDependency
    ? `https://github.com/${repoInfo.owner}/${repoInfo.repo}/blob/${currentBranch || 'HEAD'}/${finding.path}${finding.line ? `#L${finding.line}` : ''}`
    : null;

  return (
    <Section className="min-h-[320px]" bodyClassName="flex flex-col gap-5 p-5">
      <div className="flex items-start gap-3" aria-label={`${finding.title} details`}>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl border bg-card', toneText[SEVERITY_TONE[finding.severity]])}><Glyph className="size-5" strokeWidth={1.7} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SeverityLabel severity={finding.severity} suffix=" severity" />
            <span className="text-[11px] text-muted-foreground">{isDependency ? 'Dependency advisory' : 'Code finding'}</span>
          </div>
          <h2 className="mt-1 text-base leading-snug font-semibold">{finding.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{finding.desc}</p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map(tag => <span key={tag} className="rounded-md border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{tag}</span>)}
            </div>
          )}
        </div>
      </div>

      {finding.path && (
        <div className="flex flex-col gap-1.5">
          <h3 className={heading}>Where</h3>
          <div className="flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-2 pl-3">
            {isDependency ? <Package className="size-4 shrink-0 text-muted-foreground" /> : <FileCode2 className="size-4 shrink-0 text-muted-foreground" />}
            <div className="flex min-w-0 flex-1 flex-col">
              <strong className="truncate text-xs font-semibold">{finding.file ?? finding.path}</strong>
              <code className="truncate font-mono text-[11px] text-muted-foreground" title={location(finding)}>{location(finding)}</code>
            </div>
            {!isDependency && onOpenFile && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" onClick={() => onOpenFile(finding.path!)}>Open file</Button>
            )}
            {blobUrl && (
              <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
                <a href={blobUrl} target="_blank" rel="noreferrer" className="no-underline!">GitHub <ExternalLink className="size-3" /></a>
              </Button>
            )}
          </div>
        </div>
      )}

      {isDependency && finding.reach && (
        <div className="flex flex-col gap-1.5">
          <h3 className={heading}>Used by</h3>
          {finding.reach.importers.length ? (
            <>
              <p className="text-xs leading-relaxed text-muted-foreground">{finding.reach.importers.length} file{finding.reach.importers.length === 1 ? ' imports' : 's import'} it{finding.reach.downstream ? `, and ${finding.reach.downstream} more depend on those` : ''}. Check whether these call the affected functions.</p>
              <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
                {finding.reach.importers.slice(0, 15).map(path => (
                  <li key={path}>
                    {onOpenFile
                      ? <button type="button" className="w-full truncate border-0 bg-transparent px-3 py-1.5 text-left font-mono text-[11px] text-primary hover:bg-[var(--surface-hover)]" onClick={() => onOpenFile(path)}>{path}</button>
                      : <code className="block truncate px-3 py-1.5 font-mono text-[11px]">{path}</code>}
                  </li>
                ))}
              </ul>
              {finding.reach.importers.length > 15 && <p className="text-xs text-muted-foreground">+{finding.reach.importers.length - 15} more</p>}
            </>
          ) : <p className="text-xs leading-relaxed text-muted-foreground">No source file imports this package. It's most likely build tooling or pulled in by another dependency. Upgrade it, but reachable advisories come first.</p>}
        </div>
      )}

      {finding.code && !isDependency && (
        <div className="flex flex-col gap-1.5">
          <h3 className={heading}>Flagged code</h3>
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-3 py-1">
              <span className="font-mono text-[11px] text-muted-foreground">{(finding.path ?? '').split('.').pop() || 'code'}{finding.line ? ` · line ${finding.line}` : ''}</span>
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => onCopy(finding.code!, 'code')}>
                {copied === 'code' ? <Check className="size-3" /> : <Copy className="size-3" />}{copied === 'code' ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <pre className="max-h-48 overflow-auto px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">{finding.code}</pre>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <h3 className={heading}>Why it's a risk</h3>
        <p className="text-[13px] leading-relaxed">{why}</p>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border bg-card p-3">
        <Wrench className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <h3 className={heading}>How to fix</h3>
          <p className="mt-1 text-[13px] leading-relaxed">{fix}</p>
        </div>
      </div>

      {resources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className={heading}>Learn more</h3>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {resources.map(resource => (
              <li key={resource.url}>
                <a href={resource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary! no-underline! hover:underline!">
                  {resource.label} <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
