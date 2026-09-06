import { useState } from 'react';
import React from 'react';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import { Icon } from '../../../shared/components/Icon';
import { StatusDot } from '../../../shared/components/StatusDot';
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
  onCloseDrillDown: () => void;
  onSelectFile: (path: string) => void;
  onViewSource: (path: string, line?: number) => void;
  onSelectIssue: (issue: any) => void;
}

function iconLabel(name: string, label: string) {
  return (
    <>
      <Icon name={name} size="s" /> {label}
    </>
  );
}

export default function ExplorerFileDetailPanel({ data, selected, blastRadius, repoInfo, token, ownership, ownerLoading, expandedFns, onToggleFn, onClearSelection, onCloseDrillDown, onSelectFile, onViewSource, onSelectIssue }: Props) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set(['blast', 'fns']));

  function toggleCard(id: string) {
    setExpandedCards(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const issues = data.issues || [];

  return (
    <>
      <div className="panel-tabs">
        <button className="panel-tab active" onClick={onCloseDrillDown}>{iconLabel(selected ? 'file' : 'search', selected ? 'FILE' : 'ISSUES')}</button>
      </div>
      <div className="panel-content">
        {selected ? (
          <>
            <button className="top-btn" style={{ width: '100%', marginBottom: 12 }} onClick={onClearSelection}>
              <span className="icon icon-s" style={{ marginRight: 4 }}><ArrowLeft size={12} strokeWidth={1.9} /></span>
              Back to Issues
            </button>
            <div className="panel-header" style={{ margin: '0 -12px 12px', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="panel-title"><Icon name="file" size="m" /> {selected.name}</div>
                  <div className="panel-subtitle">{selected.folder || 'root'} • {selected.layer} • {selected.lines} lines{selected.complexity && selected.complexity.score > 0 ? ' • Complexity: ' + selected.complexity.score : ''}</div>
                </div>
                <button className="view-file-btn" onClick={() => onViewSource(selected.path)}>{iconLabel('eye', 'View Source')}</button>
              </div>
            </div>

            {repoInfo && selected && (
              <BlameHeatmap owner={repoInfo.owner} repo={repoInfo.repo} token={token} filePath={selected.path} />
            )}

            {blastRadius && (
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="card-header" onClick={() => toggleCard('blast')}>
                  <div className="card-title"><span className={'card-toggle' + (expandedCards.has('blast') ? ' open' : '')}><ChevronRight size={10} strokeWidth={1.9} /></span><Icon name="impact" size="s" /> Impact Analysis</div>
                  <span className={'badge badge-' + (blastRadius.level === 'low' ? 'success' : blastRadius.level === 'medium' ? 'warning' : 'danger')}>{blastRadius.level.toUpperCase()}</span>
                </div>
                {expandedCards.has('blast') && (
                  <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                      <div onClick={() => toggleCard('br-direct')} style={{ background: 'var(--bg0)', padding: 8, borderRadius: 6, textAlign: 'center', cursor: blastRadius.count > 0 ? 'pointer' : 'default', border: '1px solid ' + (expandedCards.has('br-direct') ? 'var(--acc)' : 'transparent'), transition: 'border 0.15s' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--acc)' }}>{blastRadius.count}</div>
                        <div style={{ fontSize: 9, color: 'var(--t3)' }}>Direct Dependents</div>
                      </div>
                      <div onClick={() => toggleCard('br-transitive')} style={{ background: 'var(--bg0)', padding: 8, borderRadius: 6, textAlign: 'center', cursor: (blastRadius.transitiveCount || 0) > 0 ? 'pointer' : 'default', border: '1px solid ' + (expandedCards.has('br-transitive') ? 'var(--purple)' : 'transparent'), transition: 'border 0.15s' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--purple)' }}>{blastRadius.transitiveCount || 0}</div>
                        <div style={{ fontSize: 9, color: 'var(--t3)' }}>Transitive</div>
                      </div>
                      <div onClick={() => toggleCard('br-fns')} style={{ background: 'var(--bg0)', padding: 8, borderRadius: 6, textAlign: 'center', cursor: (blastRadius.fnsUsed || 0) > 0 ? 'pointer' : 'default', border: '1px solid ' + (expandedCards.has('br-fns') ? 'var(--green)' : 'transparent'), transition: 'border 0.15s' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--green)' }}>{blastRadius.fnsUsed || 0}</div>
                        <div style={{ fontSize: 9, color: 'var(--t3)' }}>Fns Exported</div>
                      </div>
                      <div onClick={() => toggleCard('br-deps')} style={{ background: 'var(--bg0)', padding: 8, borderRadius: 6, textAlign: 'center', cursor: (blastRadius.dependencies || []).length > 0 ? 'pointer' : 'default', border: '1px solid ' + (expandedCards.has('br-deps') ? 'var(--orange)' : 'transparent'), transition: 'border 0.15s' }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--orange)' }}>{(blastRadius.dependencies || []).length}</div>
                        <div style={{ fontSize: 9, color: 'var(--t3)' }}>Dependencies</div>
                      </div>
                    </div>
                    {expandedCards.has('br-direct') && blastRadius.affected.length > 0 && (
                      <div className="blast-detail" style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 6 }}>Files that import from this:</div>
                        {blastRadius.affected.map((path: string) => (
                          <div key={path} className="blast-file" onClick={() => onSelectFile(path)}><Icon name="file" size="s" /> {path.split('/').pop()}</div>
                        ))}
                      </div>
                    )}
                    {expandedCards.has('br-transitive') && (
                      <div className="blast-detail" style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 6, color: 'var(--purple)' }}>Transitive dependents (files that depend on direct dependents):</div>
                        <div style={{ fontSize: 9, color: 'var(--t3)', padding: '4px 0' }}>{(blastRadius.transitiveCount || 0) + ' files indirectly affected if this file changes'}</div>
                        {blastRadius.affected.slice(0, 5).map((path: string) => (
                          <div key={path} className="blast-file" onClick={() => onSelectFile(path)}><Icon name="file" size="s" /> {path.split('/').pop()}</div>
                        ))}
                      </div>
                    )}
                    {expandedCards.has('br-fns') && (
                      <div className="blast-detail" style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 6, color: 'var(--green)' }}>{'Exported functions (' + (blastRadius.fnsUsed || 0) + ' used, ' + blastRadius.totalCalls + ' calls):'}</div>
                        {(data.functions || []).filter((f: any) => f.file === selected.path && f.isExported).map((f: any) => (
                          <div key={f.name} className="blast-file"><Icon name="function" size="s" /> {f.name}</div>
                        ))}
                      </div>
                    )}
                    {expandedCards.has('br-deps') && (blastRadius.dependencies || []).length > 0 && (
                      <div className="blast-detail" style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, marginBottom: 6, color: 'var(--orange)' }}>Dependencies (risk if these change):</div>
                        {blastRadius.dependencies.map((path: string) => (
                          <div key={path} className="blast-file" onClick={() => onSelectFile(path)}><Icon name="file" size="s" /> {path.split('/').pop()}</div>
                        ))}
                      </div>
                    )}
                    {(blastRadius.count > 0 || blastRadius.fnsUsed > 0) && !expandedCards.has('br-direct') && !expandedCards.has('br-fns') && (
                      <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 8, padding: '6px 8px', background: 'var(--bg0)', borderRadius: 4 }}>
                        {blastRadius.count > 0 ? blastRadius.count + ' file' + (blastRadius.count > 1 ? 's' : '') + ' directly depend on this file' : ''}
                        {blastRadius.count > 0 && blastRadius.fnsUsed > 0 ? ' • ' : ''}
                        {blastRadius.fnsUsed > 0 ? blastRadius.fnsUsed + ' function' + (blastRadius.fnsUsed > 1 ? 's' : '') + ' used ' + blastRadius.totalCalls + ' times' : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <ConnectionsCard data={data} selected={selected} expandedCards={expandedCards} toggleCard={toggleCard} onSelectFile={onSelectFile} />

            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-header" onClick={() => toggleCard('own')}>
                <div className="card-title"><span className={'card-toggle' + (expandedCards.has('own') ? ' open' : '')}><ChevronRight size={10} strokeWidth={1.9} /></span><Icon name="users" size="s" /> Ownership</div>
              </div>
              {expandedCards.has('own') && (
                <div className="card-body">
                  {ownerLoading ? (
                    <div className="loading-owner">Loading ownership data...</div>
                  ) : ownership && ownership.length > 0 ? (
                    <>
                      <div className="owner-bar">{ownership.slice(0, 5).map((o: any, i: number) => (
                        <div key={i} className="owner-segment" style={{ width: o.percent + '%', background: COLORS[i % COLORS.length] }} />
                      ))}</div>
                      <div className="owner-list">{ownership.slice(0, 5).map((o: any, i: number) => (
                        <div key={i} className="owner-item">
                          <div className="owner-avatar" style={{ background: COLORS[i % COLORS.length] }}>{o.name[0].toUpperCase()}</div>
                          <span className="owner-name">{o.name}</span>
                          <span className="owner-percent">{o.percent}%</span>
                        </div>
                      ))}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--t3)', padding: 8 }}>No ownership data available</div>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-header" onClick={() => toggleCard('fns')}>
                <div className="card-title"><span className={'card-toggle' + (expandedCards.has('fns') ? ' open' : '')}><ChevronRight size={10} strokeWidth={1.9} /></span><Icon name="bolt" size="s" /> Functions ({selected.functions.length})</div>
              </div>
              {expandedCards.has('fns') && (
                <div className="card-body" style={{ padding: 8 }}>
                  {selected.functions.length === 0 ? (
                    <div style={{ fontSize: 10, color: 'var(--t3)', padding: 8, textAlign: 'center' }}>No functions detected</div>
                  ) : selected.functions.map((fn: any) => {
                    const st = data.fnStats[fn.name];
                    const isExpanded = expandedFns.has(fn.name);
                    const intCalls = st ? st.internal : 0, extCalls = st ? st.external : 0;
                    return (
                      <div key={fn.name} className="fn-item">
                        <div className="fn-header" onClick={() => onToggleFn(fn.name)}>
                          <span className="fn-name">{fn.name}()</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button className="view-file-btn" onClick={e => { e.stopPropagation(); onViewSource(selected.path, fn.line); }} title="View source"><Icon name="eye" size="s" /></button>
                            <span className="fn-line">L{fn.line}</span>
                            <span className="badge badge-default" title="Internal calls (same file)">{intCalls} int</span>
                            <span className={'badge ' + (extCalls > 10 ? 'badge-danger' : extCalls > 0 ? 'badge-warning' : 'badge-default')} title="External calls (other files)">{extCalls} ext</span>
                          </span>
                        </div>
                        {isExpanded && (
                          <>
                            {fn.code && <div className="fn-code">{fn.code}</div>}
                            {st && st.callers && st.callers.length > 0 && (
                              <div className="fn-callers">
                                <div className="fn-callers-title">External callers:</div>
                                {st.callers.slice(0, 8).map((c: any, i: number) => (
                                  <div key={i} className="fn-caller" onClick={() => onSelectFile(c.file)}>
                                    <Icon name="file" size="s" />
                                    <span>{c.name}</span>
                                    <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>{c.count}×</span>
                                  </div>
                                ))}
                                {st.callers.length > 8 && <div style={{ fontSize: 9, color: 'var(--t3)', padding: '4px 6px' }}>+{st.callers.length - 8} more</div>}
                              </div>
                            )}
                            {intCalls === 0 && extCalls === 0 && (
                              <div style={{ fontSize: 9, color: 'var(--orange)', padding: 8, textAlign: 'center', background: 'rgba(255,159,67,0.1)', borderRadius: 4 }}>
                                <Icon name="warning" size="s" /> This function is never called
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}><Icon name="search" size="m" /> Architecture Issues ({issues.length})</div>
            {issues.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Icon name="spark" size="xxl" className="empty-icon" /><div style={{ color: 'var(--green)' }}>No issues detected!</div></div>
            ) : issues.map((issue: any, i: number) => (
              <div key={i} className={'security-item ' + (issue.type === 'critical' ? 'high' : 'medium')} style={{ cursor: 'pointer' }} onClick={() => onSelectIssue(issue)}>
                <div className="security-header">
                  <StatusDot color={issue.type === 'critical' ? 'var(--red)' : 'var(--orange)'} />
                  <span className="security-title">{issue.title}</span>
                </div>
                <div className="security-desc">{issue.desc}</div>
                <div style={{ fontSize: 9, color: 'var(--acc)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Click for details ({issue.items ? issue.items.length : 0} items)
                  <span className="icon icon-s"><ArrowRight size={11} strokeWidth={1.9} /></span>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

interface ConnectionsCardProps {
  data: any;
  selected: any;
  expandedCards: Set<string>;
  toggleCard: (id: string) => void;
  onSelectFile: (path: string) => void;
}

function ConnectionsCard({ data, selected, expandedCards, toggleCard, onSelectFile }: ConnectionsCardProps) {
  const connByFile: { out: Record<string, any>; in: Record<string, any> } = { out: {}, in: {} };
  (data.connections || []).forEach((c: any) => {
    const src = typeof c.source === 'object' ? c.source.id : c.source;
    const tgt = typeof c.target === 'object' ? c.target.id : c.target;
    if (src === selected.path) {
      if (!connByFile.out[tgt]) connByFile.out[tgt] = { file: tgt, fns: [] };
      connByFile.out[tgt].fns.push({ name: c.fn, count: c.count });
    }
    if (tgt === selected.path) {
      if (!connByFile.in[src]) connByFile.in[src] = { file: src, fns: [] };
      connByFile.in[src].fns.push({ name: c.fn, count: c.count });
    }
  });
  const outgoing: any[] = Object.values(connByFile.out).sort((a: any, b: any) => b.fns.length - a.fns.length);
  const incoming: any[] = Object.values(connByFile.in).sort((a: any, b: any) => b.fns.length - a.fns.length);
  const totalConns = outgoing.length + incoming.length;
  if (totalConns === 0) return null;

  function renderConnRow(conn: any, prefix: string) {
    const isOpen = expandedCards.has(prefix + conn.file);
    return (
      <div key={conn.file} className="conn-item">
        <div className="conn-header" onClick={e => { e.stopPropagation(); toggleCard(prefix + conn.file); }}>
          <span className={'card-toggle' + (isOpen ? ' open' : '')} style={{ marginRight: 6 }}><ChevronRight size={10} strokeWidth={1.9} /></span>
          <span className="conn-file-icon"><Icon name="file" size="s" /></span>
          <span className="conn-file-name">{conn.file.split('/').pop()}</span>
          <span className="badge badge-default" style={{ marginLeft: 'auto' }}>{conn.fns.length} fn{conn.fns.length !== 1 ? 's' : ''}</span>
        </div>
        {isOpen && (
          <div className="conn-fns">
            {conn.fns.map((fn: any, i: number) => (
              <div key={i} className="conn-fn">
                <span className="conn-fn-name">{fn.name}()</span>
                <span className="conn-fn-count">{fn.count}×</span>
              </div>
            ))}
            <div className="conn-goto" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => onSelectFile(conn.file)}>
              <span className="icon icon-s"><ArrowRight size={11} strokeWidth={1.9} /></span>
              View {conn.file.split('/').pop()}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header" onClick={() => toggleCard('conns')}>
        <div className="card-title"><span className={'card-toggle' + (expandedCards.has('conns') ? ' open' : '')}><ChevronRight size={10} strokeWidth={1.9} /></span><Icon name="link" size="s" /> Connections</div>
        <span className="badge badge-default">{totalConns}</span>
      </div>
      {expandedCards.has('conns') && (
        <div className="card-body" style={{ padding: 0 }}>
          {outgoing.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--t3)', padding: '8px 12px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>Uses ({outgoing.length} files)</div>
              {outgoing.slice(0, 15).map(conn => renderConnRow(conn, 'conn-out-'))}
              {outgoing.length > 15 && <div style={{ fontSize: 9, color: 'var(--t3)', padding: 8, textAlign: 'center' }}>+{outgoing.length - 15} more files</div>}
            </>
          )}
          {incoming.length > 0 && (
            <>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--t3)', padding: '8px 12px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', borderTop: outgoing.length > 0 ? '1px solid var(--border)' : 'none' }}>Used by ({incoming.length} files)</div>
              {incoming.slice(0, 15).map(conn => renderConnRow(conn, 'conn-in-'))}
              {incoming.length > 15 && <div style={{ fontSize: 9, color: 'var(--t3)', padding: 8, textAlign: 'center' }}>+{incoming.length - 15} more files</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
