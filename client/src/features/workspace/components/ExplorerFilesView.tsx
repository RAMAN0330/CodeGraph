import React, { Suspense, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronRight, Eye, FileCode2, FileWarning, GitBranch,
  Layers, Link2, ShieldCheck, Sparkles, Users, Zap,
} from 'lucide-react';
import { COLORS } from '../../analysis/services/parser';

const BlameHeatmap = React.lazy(() => import('../../git-insights/components/BlameHeatmap'));

interface Props {
  data: any;
  selected: any;
  blastRadius: any;
  repoInfo: any;
  token: string;
  ownership: any;
  ownerLoading: boolean;
  expandedFns: Set<string>;
  onToggleFn: (name: string) => void;
  onClearSelection: () => void;
  onSelectFile: (path: string) => void;
  onViewSource: (path: string, line?: number) => void;
  onSelectIssue: (issue: any) => void;
}

interface Connection {
  file: string;
  fns: { name: string; count: number }[];
}

/** Splits this file's edges into what it imports and what imports it. */
function useConnections(data: any, selectedPath: string | undefined) {
  return useMemo(() => {
    const out: Record<string, Connection> = {};
    const inc: Record<string, Connection> = {};
    if (!selectedPath) return { outgoing: [], incoming: [] };
    (data?.connections ?? []).forEach((c: any) => {
      const src = typeof c.source === 'object' ? c.source.id : c.source;
      const tgt = typeof c.target === 'object' ? c.target.id : c.target;
      if (src === selectedPath) {
        if (!out[tgt]) out[tgt] = { file: tgt, fns: [] };
        out[tgt].fns.push({ name: c.fn, count: c.count });
      }
      if (tgt === selectedPath) {
        if (!inc[src]) inc[src] = { file: src, fns: [] };
        inc[src].fns.push({ name: c.fn, count: c.count });
      }
    });
    const bySize = (a: Connection, b: Connection) => b.fns.length - a.fns.length;
    return {
      outgoing: Object.values(out).sort(bySize),
      incoming: Object.values(inc).sort(bySize),
    };
  }, [data, selectedPath]);
}

export default function ExplorerFilesView({
  data, selected, blastRadius, repoInfo, token, ownership, ownerLoading,
  expandedFns, onToggleFn, onClearSelection, onSelectFile, onViewSource, onSelectIssue,
}: Props) {
  const { outgoing, incoming } = useConnections(data, selected?.path);
  const [connTab, setConnTab] = useState<'uses' | 'usedby'>('uses');

  if (!selected) {
    return <FilesOverview data={data} onSelectFile={onSelectFile} onSelectIssue={onSelectIssue} />;
  }

  const functions = selected.functions ?? [];
  const conns = connTab === 'uses' ? outgoing : incoming;

  return (
    <div className="xfiles">
      <header className="xfiles-head">
        <span className="xfiles-head-icon"><FileCode2 size={22} strokeWidth={1.7} /></span>
        <div className="xfiles-head-copy">
          <h1>{selected.name}</h1>
          <code>{selected.path}</code>
        </div>
        <div className="xfiles-head-meta">
          <span className="xfiles-pill"><Layers size={12} strokeWidth={2} /> {selected.layer || 'unclassified'}</span>
          <span className="xfiles-pill">{selected.lines} lines</span>
          {selected.complexity?.score > 0 && (
            <span className="xfiles-pill">Complexity {selected.complexity.score}</span>
          )}
          {blastRadius && (
            <span className={`xfiles-pill impact-${blastRadius.level}`}>
              {blastRadius.level.toUpperCase()} impact
            </span>
          )}
        </div>
        <div className="xfiles-head-actions">
          <button className="xfiles-btn primary" onClick={() => onViewSource(selected.path)}>
            <Eye size={14} strokeWidth={1.9} /> View Source
          </button>
          <button className="xfiles-btn" onClick={onClearSelection}>Clear</button>
        </div>
      </header>

      {blastRadius && (
        <div className="xfiles-metrics">
          <Metric label="Direct dependents" value={blastRadius.count} tone="acc"
            hint="Files that import from this file" />
          <Metric label="Transitive" value={blastRadius.transitiveCount || 0} tone="purple"
            hint="Files indirectly affected by a change here" />
          <Metric label="Functions exported" value={blastRadius.fnsUsed || 0} tone="green"
            hint={`Used ${blastRadius.totalCalls || 0} times across the repo`} />
          <Metric label="Dependencies" value={(blastRadius.dependencies || []).length} tone="orange"
            hint="Files this one imports from" />
        </div>
      )}

      <div className="xfiles-grid">
        <section className="xfiles-card xfiles-fns">
          <header className="xfiles-card-head">
            <h2><Zap size={14} strokeWidth={2} /> Functions</h2>
            <span className="xfiles-count">{functions.length}</span>
          </header>
          {functions.length === 0 ? (
            <p className="xfiles-empty-note">No functions detected in this file.</p>
          ) : (
            <div className="xfiles-fn-list">
              {functions.map((fn: any) => {
                const stat = data.fnStats?.[fn.name];
                const internal = stat?.internal ?? 0;
                const external = stat?.external ?? 0;
                const open = expandedFns.has(fn.name);
                const dead = internal === 0 && external === 0;
                return (
                  <div key={fn.name} className={`xfiles-fn${open ? ' open' : ''}`}>
                    <button className="xfiles-fn-head" onClick={() => onToggleFn(fn.name)}>
                      <ChevronRight className="xfiles-fn-caret" size={13} strokeWidth={2.2} />
                      <span className="xfiles-fn-name">{fn.name}()</span>
                      <span className="xfiles-fn-line">L{fn.line}</span>
                      {dead
                        ? <span className="xfiles-tag warn"><AlertTriangle size={10} strokeWidth={2.2} /> never called</span>
                        : (
                          <>
                            <span className="xfiles-tag">{internal} int</span>
                            <span className={`xfiles-tag${external > 10 ? ' danger' : external > 0 ? ' warn' : ''}`}>{external} ext</span>
                          </>
                        )}
                      <span
                        className="xfiles-fn-source"
                        role="button"
                        tabIndex={0}
                        title="View source"
                        onClick={e => { e.stopPropagation(); onViewSource(selected.path, fn.line); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onViewSource(selected.path, fn.line); } }}
                      >
                        <Eye size={13} strokeWidth={1.9} />
                      </span>
                    </button>
                    {open && (
                      <div className="xfiles-fn-body">
                        {fn.code && <pre className="xfiles-code">{fn.code}</pre>}
                        {stat?.callers?.length > 0 && (
                          <div className="xfiles-callers">
                            <h4>External callers</h4>
                            {stat.callers.slice(0, 10).map((caller: any, i: number) => (
                              <button key={i} className="xfiles-caller" onClick={() => onSelectFile(caller.file)}>
                                <FileCode2 size={12} strokeWidth={1.8} />
                                <span>{caller.name}</span>
                                <em>{caller.count}×</em>
                              </button>
                            ))}
                            {stat.callers.length > 10 && (
                              <p className="xfiles-more">+{stat.callers.length - 10} more</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="xfiles-side">
          <section className="xfiles-card">
            <header className="xfiles-card-head">
              <h2><Link2 size={14} strokeWidth={2} /> Connections</h2>
              <div className="xfiles-seg">
                <button className={connTab === 'uses' ? 'active' : ''} onClick={() => setConnTab('uses')}>
                  Uses {outgoing.length}
                </button>
                <button className={connTab === 'usedby' ? 'active' : ''} onClick={() => setConnTab('usedby')}>
                  Used by {incoming.length}
                </button>
              </div>
            </header>
            {conns.length === 0 ? (
              <p className="xfiles-empty-note">
                {connTab === 'uses' ? 'This file does not import from other analyzed files.' : 'No analyzed file imports this one.'}
              </p>
            ) : (
              <div className="xfiles-conns">
                {conns.slice(0, 20).map(conn => (
                  <button key={conn.file} className="xfiles-conn" onClick={() => onSelectFile(conn.file)}>
                    <FileCode2 size={13} strokeWidth={1.8} />
                    <span className="xfiles-conn-name">{conn.file.split('/').pop()}</span>
                    <span className="xfiles-conn-path">{conn.file}</span>
                    <em>{conn.fns.length} fn{conn.fns.length !== 1 ? 's' : ''}</em>
                  </button>
                ))}
                {conns.length > 20 && <p className="xfiles-more">+{conns.length - 20} more files</p>}
              </div>
            )}
          </section>

          <section className="xfiles-card">
            <header className="xfiles-card-head">
              <h2><Users size={14} strokeWidth={2} /> Ownership</h2>
            </header>
            {ownerLoading ? (
              <p className="xfiles-empty-note">Loading ownership data…</p>
            ) : ownership?.length > 0 ? (
              <div className="xfiles-owners">
                <div className="xfiles-owner-bar">
                  {ownership.slice(0, 5).map((o: any, i: number) => (
                    <span key={i} style={{ width: `${o.percent}%`, background: COLORS[i % COLORS.length] }} />
                  ))}
                </div>
                {ownership.slice(0, 5).map((o: any, i: number) => (
                  <div key={i} className="xfiles-owner">
                    <span className="xfiles-owner-avatar" style={{ background: COLORS[i % COLORS.length] }}>
                      {o.name[0].toUpperCase()}
                    </span>
                    <span className="xfiles-owner-name">{o.name}</span>
                    <em>{o.percent}%</em>
                  </div>
                ))}
              </div>
            ) : (
              <p className="xfiles-empty-note">No ownership data available.</p>
            )}
          </section>

          {repoInfo && (
            <section className="xfiles-card">
              <header className="xfiles-card-head">
                <h2><GitBranch size={14} strokeWidth={2} /> Change history</h2>
              </header>
              <Suspense fallback={<p className="xfiles-empty-note">Loading blame…</p>}>
                <BlameHeatmap owner={repoInfo.owner} repo={repoInfo.repo} token={token} filePath={selected.path} />
              </Suspense>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  return (
    <div className={`xfiles-metric tone-${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      <em>{hint}</em>
    </div>
  );
}

/** Shown until a file is picked: repo-wide architecture issues plus a nudge. */
function FilesOverview({ data, onSelectFile, onSelectIssue }: {
  data: any;
  onSelectFile: (path: string) => void;
  onSelectIssue: (issue: any) => void;
}) {
  const issues = data?.issues ?? [];
  const files = data?.files ?? [];

  const largest = useMemo(
    () => [...files].sort((a: any, b: any) => (b.lines ?? 0) - (a.lines ?? 0)).slice(0, 8),
    [files],
  );

  return (
    <div className="xfiles">
      <header className="xfiles-head xfiles-head-plain">
        <span className="xfiles-head-icon"><FileCode2 size={22} strokeWidth={1.7} /></span>
        <div className="xfiles-head-copy">
          <h1>Files</h1>
          <p>Select a file in the tree to inspect its impact, connections, ownership and functions.</p>
        </div>
      </header>

      <div className="xfiles-grid">
        <section className="xfiles-card">
          <header className="xfiles-card-head">
            <h2><FileWarning size={14} strokeWidth={2} /> Architecture issues</h2>
            <span className="xfiles-count">{issues.length}</span>
          </header>
          {issues.length === 0 ? (
            <div className="xfiles-clear">
              <ShieldCheck size={26} strokeWidth={1.6} />
              <p>No architecture issues detected.</p>
            </div>
          ) : (
            <div className="xfiles-issues">
              {issues.map((issue: any, i: number) => (
                <button
                  key={i}
                  className={`xfiles-issue ${issue.type === 'critical' ? 'critical' : 'warning'}`}
                  onClick={() => onSelectIssue(issue)}
                >
                  <span className="xfiles-issue-dot" />
                  <span className="xfiles-issue-copy">
                    <strong>{issue.title}</strong>
                    <span>{issue.desc}</span>
                  </span>
                  <em>{issue.items ? issue.items.length : 0} items</em>
                  <ChevronRight size={15} strokeWidth={1.9} />
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="xfiles-side">
          <section className="xfiles-card">
            <header className="xfiles-card-head">
              <h2><Sparkles size={14} strokeWidth={2} /> Largest files</h2>
            </header>
            <div className="xfiles-conns">
              {largest.map((file: any) => (
                <button key={file.path} className="xfiles-conn" onClick={() => onSelectFile(file.path)}>
                  <FileCode2 size={13} strokeWidth={1.8} />
                  <span className="xfiles-conn-name">{file.name}</span>
                  <span className="xfiles-conn-path">{file.folder || 'root'}</span>
                  <em>{file.lines} lines</em>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
