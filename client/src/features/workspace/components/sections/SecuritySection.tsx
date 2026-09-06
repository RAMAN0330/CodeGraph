import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bug, Check, ChevronRight, Copy, Database, ExternalLink, Globe, Info,
  KeyRound, LayoutGrid, List, Lock, Package, Play, Search, ShieldAlert,
  ShieldCheck, Terminal, X,
} from 'lucide-react';
import type { VulnResult } from '../../../security/services/osv';
import { referenceFor } from '../../../security/data/issueReference';

type Severity = 'high' | 'medium' | 'low' | 'info';

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
  data: { securityIssues?: SecurityIssue[] } | null;
  vulns: VulnResult[];
  vulnLoading: boolean;
  vulnError: string | null;
  onSelectIssue?: (issue: SecurityIssue) => void;
  onRescan?: () => void;
  scanning?: boolean;
  repoInfo?: { owner: string; repo: string } | null;
  currentBranch?: string;
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
}

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };
const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

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

function toFindings(issues: SecurityIssue[], vulns: VulnResult[]): Finding[] {
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

  const deps: Finding[] = vulns.map((v, i) => ({
    id: `dep-${i}-${v.pkg}-${v.cveId}`,
    kind: 'dependency',
    severity: DEP_SEVERITY[v.severity],
    title: `Vulnerable Dependency: ${v.pkg}`,
    desc: v.summary || `${v.pkg} ${v.version} is affected by a published advisory.`,
    file: `${v.pkg}@${v.version}`,
    path: `${v.ecosystem} · ${v.pkg} ${v.version}`,
    code: v.cveId,
    url: v.url,
  }));

  return [...code, ...deps];
}

export default function SecuritySection({
  data, vulns, vulnLoading, vulnError, onSelectIssue, onRescan, scanning, repoInfo, currentBranch,
}: Props) {
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'severity' | 'title' | 'file'>('severity');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const findings = useMemo(
    () => toFindings(data?.securityIssues ?? [], vulns ?? []),
    [data, vulns],
  );

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach(f => { c[f.severity]++; });
    return c;
  }, [findings]);

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
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title);
    });
  }, [findings, severityFilter, query, sortBy]);

  const selected = useMemo(
    () => visible.find(f => f.id === selectedId) ?? null,
    [visible, selectedId],
  );

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

  if (!data) {
    return (
      <div className="sec-page">
        <SecurityHeader
          onRescan={onRescan}
          scanning={scanning}
          query={query}
          onQuery={setQuery}
          searchRef={searchRef}
          disabled
        />
        <div className="sec-empty">
          <ShieldAlert size={34} strokeWidth={1.6} />
          <h3>No scan yet</h3>
          <p>Analyze a repository to scan it for vulnerabilities, secrets and security risks.</p>
        </div>
      </div>
    );
  }

  const tabs: (Severity | 'all')[] = ['all', 'high', 'medium', 'low', 'info'];

  const tabsNode = (
    <div className="sec-tabs" role="tablist" aria-label="Filter by severity">
      {tabs.map(tab => {
        const count = tab === 'all' ? findings.length : counts[tab];
        return (
          <button
            key={tab}
            role="tab"
            aria-selected={severityFilter === tab}
            className={`sec-tab sec-tab-${tab}${severityFilter === tab ? ' active' : ''}`}
            onClick={() => setSeverityFilter(tab)}
          >
            {tab === 'all' ? 'All' : SEVERITY_LABEL[tab]}
            <span>{count}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="sec-page">
      <SecurityHeader
        onRescan={onRescan}
        scanning={scanning}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        tabs={tabsNode}
      />

      {vulnError && <div className="sec-notice">{vulnError}</div>}

      <div className={`sec-body${selected ? ' with-detail' : ''}`}>
        <section className="sec-list-panel">
          <header className="sec-list-header">
            <strong>
              {visible.length} security {visible.length === 1 ? 'issue' : 'issues'}
              {vulnLoading && <em> · scanning dependencies…</em>}
            </strong>
            <div className="sec-list-tools">
              <label className="sec-sort">
                Sort by:
                <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
                  <option value="severity">Severity</option>
                  <option value="title">Title</option>
                  <option value="file">File</option>
                </select>
              </label>
              <div className="sec-view-toggle">
                <button
                  className={view === 'list' ? 'active' : ''}
                  onClick={() => setView('list')}
                  aria-label="List view"
                  aria-pressed={view === 'list'}
                ><List size={14} strokeWidth={1.9} /></button>
                <button
                  className={view === 'grid' ? 'active' : ''}
                  onClick={() => setView('grid')}
                  aria-label="Grid view"
                  aria-pressed={view === 'grid'}
                ><LayoutGrid size={14} strokeWidth={1.9} /></button>
              </div>
            </div>
          </header>

          {visible.length === 0 ? (
            <div className="sec-empty sec-empty-inline">
              <ShieldCheck size={30} strokeWidth={1.6} />
              <h3>{findings.length === 0 ? 'No security issues detected' : 'No matching issues'}</h3>
              <p>
                {findings.length === 0
                  ? 'This scan found no vulnerabilities, secrets or risky patterns.'
                  : 'Try a different severity or search term.'}
              </p>
            </div>
          ) : (
            <div className={`sec-list sec-list-${view}`}>
              {visible.map(finding => {
                const Glyph = iconFor(finding);
                return (
                  <button
                    key={finding.id}
                    className={`sec-row sev-${finding.severity}${selectedId === finding.id ? ' selected' : ''}`}
                    onClick={() => select(finding)}
                    aria-current={selectedId === finding.id}
                  >
                    <span className="sec-row-icon"><Glyph size={18} strokeWidth={1.8} /></span>
                    <span className="sec-row-body">
                      <span className="sec-row-title">{finding.title}</span>
                      <span className="sec-row-desc">{finding.desc}</span>
                      {finding.path && (
                        <span className="sec-row-path">
                          {finding.path}{finding.line ? `:${finding.line}` : ''}
                        </span>
                      )}
                    </span>
                    <span className={`sec-badge sev-${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
                    <ChevronRight className="sec-row-chevron" size={16} strokeWidth={1.8} />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selected && (
          <SecurityDetail
            finding={selected}
            onClose={() => setSelectedId(null)}
            onCopy={copy}
            copied={copied}
            repoInfo={repoInfo}
            currentBranch={currentBranch}
          />
        )}
      </div>
    </div>
  );
}

function SecurityHeader({
  onRescan, scanning, query, onQuery, searchRef, disabled, tabs,
}: {
  onRescan?: () => void;
  scanning?: boolean;
  query: string;
  onQuery: (v: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  tabs?: React.ReactNode;
}) {
  return (
    <header className="sec-header">
      <div className="sec-header-copy">
        <h1>Security</h1>
        <p>Scan your code for vulnerabilities, secrets and security risks.</p>
      </div>
      <div className="sec-header-actions">
        {tabs}
        <div className="sec-search">
          <Search size={15} strokeWidth={1.8} />
          <input
            ref={searchRef}
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Search issues, files, or keywords…"
            disabled={disabled}
          />
          <kbd>⌘K</kbd>
        </div>
        {onRescan && (
          <button className="sec-scan-btn" onClick={onRescan} disabled={scanning}>
            <Play size={14} strokeWidth={2} />
            {scanning ? 'Scanning…' : 'Run Scan'}
          </button>
        )}
      </div>
    </header>
  );
}

function SecurityDetail({
  finding, onClose, onCopy, copied, repoInfo, currentBranch,
}: {
  finding: Finding;
  onClose: () => void;
  onCopy: (text: string, key: string) => void;
  copied: string | null;
  repoInfo?: { owner: string; repo: string } | null;
  currentBranch?: string;
}) {
  const Glyph = iconFor(finding);
  const reference = referenceFor(finding.title);
  const isDependency = finding.kind === 'dependency';

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
    <aside className="sec-detail" aria-label={`${finding.title} details`}>
      <header className="sec-detail-head">
        <span className={`sec-detail-icon sev-${finding.severity}`}><Glyph size={22} strokeWidth={1.7} /></span>
        <div className="sec-detail-title">
          <h2>{finding.title}</h2>
          <p>{finding.desc}</p>
        </div>
        <span className={`sec-badge sev-${finding.severity}`}>{SEVERITY_LABEL[finding.severity]} Severity</span>
        <button className="sec-detail-close" onClick={onClose} aria-label="Close details">
          <X size={17} strokeWidth={1.9} />
        </button>
      </header>

      {tags.length > 0 && (
        <div className="sec-chips">
          {tags.map(tag => <span key={tag} className="sec-chip">{tag}</span>)}
        </div>
      )}

      {finding.path && (
        <section className="sec-block">
          <h3>Location</h3>
          <div className="sec-location">
            <div>
              <strong>{finding.file ?? finding.path}</strong>
              <code>{finding.path}{finding.line ? `:${finding.line}` : ''}</code>
            </div>
            {blobUrl && (
              <a className="sec-link-btn" href={blobUrl} target="_blank" rel="noreferrer">
                View on GitHub <ExternalLink size={13} strokeWidth={1.9} />
              </a>
            )}
          </div>
        </section>
      )}

      {finding.code && !isDependency && (
        <section className="sec-block">
          <h3>Vulnerable Code</h3>
          <div className="sec-code">
            <header>
              <span>{(finding.path ?? '').split('.').pop() || 'code'}</span>
              <button onClick={() => onCopy(finding.code!, 'code')}>
                {copied === 'code' ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.9} />}
                {copied === 'code' ? 'Copied' : 'Copy'}
              </button>
            </header>
            <pre>{finding.code}</pre>
          </div>
        </section>
      )}

      <section className="sec-block">
        <h3>Why This Is a Risk</h3>
        <p className="sec-prose">{why}</p>
      </section>

      <section className="sec-block">
        <h3>How to Fix</h3>
        <p className="sec-prose sec-fix"><Check size={15} strokeWidth={2.2} /><span>{fix}</span></p>
      </section>

      {resources.length > 0 && (
        <section className="sec-block">
          <h3>Additional Resources</h3>
          <ul className="sec-resources">
            {resources.map(resource => (
              <li key={resource.url}>
                <a href={resource.url} target="_blank" rel="noreferrer">
                  {resource.label}
                  <ExternalLink size={13} strokeWidth={1.9} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
