import { ArrowRight } from 'lucide-react';
import { Icon } from '../../../../shared/components/Icon';
import { calcBlast, calcPRRisk, findDependencyChains, findSuggestedReviewers, findTestImpact } from '../../../repository/services/github';

interface Props {
  prUrl: string;
  onPrUrlChange: (value: string) => void;
  onAnalyze: () => void;
  prData: any;
  data: any;
  revertCounts: Record<string, number>;
  onClose: () => void;
}

function iconLabel(name: string, label: string) {
  return (
    <>
      <Icon name={name} size="s" /> {label}
    </>
  );
}

export default function PrReviewModal({ prUrl, onPrUrlChange, onAnalyze, prData, data, revertCounts, onClose }: Props) {
  const risk = prData ? calcPRRisk(prData, data) : null;
  const reviewers = prData ? findSuggestedReviewers(prData, data) : [];
  const testImpact = prData ? findTestImpact(prData, data) : [];
  const chains = prData ? findDependencyChains(prData, data) : [];
  const riskColor = risk ? (risk.level === 'critical' ? 'var(--red)' : risk.level === 'high' ? 'var(--orange)' : risk.level === 'medium' ? 'var(--blue)' : 'var(--green)') : '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal pr-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{iconLabel('chart', 'PR Impact Analyzer')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          <div className="form-group">
            <label className="form-label">Pull Request URL</label>
            <input
              className="form-input"
              aria-label="Pull Request URL"
              placeholder="https://github.com/owner/repo/pull/123"
              value={prUrl}
              onChange={e => onPrUrlChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onAnalyze(); }}
            />
          </div>
          <button className="top-btn primary" aria-label="Analyze Pull Request" onClick={onAnalyze} style={{ marginBottom: 16, width: '100%' }}>{iconLabel('search', 'Analyze PR Impact')}</button>
          {prData && risk && (
            <>
              <div className="pr-header" style={{ marginBottom: 16 }}>
                <div className="pr-title" style={{ fontSize: 14 }}>{prData.title}</div>
                <div className="pr-stats" style={{ marginTop: 8 }}>
                  <span className="pr-add">+{prData.additions || 0}</span>
                  <span className="pr-del">-{prData.deletions || 0}</span>
                  <span style={{ color: 'var(--t3)', marginLeft: 8 }}>{prData.files ? prData.files.length : 0} files</span>
                </div>
              </div>
              <div className="pr-impact-grid">
                <div className="pr-impact-card">
                  <div className="pr-risk-meter">
                    <div className="pr-risk-circle" style={{ borderColor: riskColor, background: 'rgba(' + [risk.level === 'critical' ? '255,95,95' : risk.level === 'high' ? '255,159,67' : risk.level === 'medium' ? '77,159,255' : '34,197,94'].join(',') + ',0.1)' }}>
                      <div className="pr-risk-value" style={{ color: riskColor }}>{risk.score}</div>
                      <div className="pr-risk-text" style={{ color: riskColor }}>{risk.level}</div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 10, color: 'var(--t2)', textAlign: 'center' }}>Risk Score</div>
                  </div>
                  {risk.factors.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {risk.factors.map((f: string, i: number) => (
                        <div key={i} style={{ fontSize: 9, color: 'var(--t2)', padding: '4px 0', borderTop: i > 0 ? '1px solid var(--border2)' : 'none' }}>• {f}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="pr-impact-card">
                  <div className="pr-impact-card-title">{iconLabel('impact', 'Impact Metrics')}</div>
                  <div className="pr-metric-row"><span className="pr-metric-label">Total Blast Radius</span><span className="pr-metric-value">{risk.totalBlast} files</span></div>
                  <div className="pr-metric-row"><span className="pr-metric-label">Files Changed</span><span className="pr-metric-value">{prData.files ? prData.files.length : 0}</span></div>
                  <div className="pr-metric-row"><span className="pr-metric-label">Lines Modified</span><span className="pr-metric-value">{(prData.additions || 0) + (prData.deletions || 0)}</span></div>
                  <div className="pr-metric-row">
                    <span className="pr-metric-label">Net Change</span>
                    <span className="pr-metric-value" style={{ color: (prData.additions || 0) - (prData.deletions || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {(prData.additions || 0) - (prData.deletions || 0) > 0 ? '+' : ''}{(prData.additions || 0) - (prData.deletions || 0)}
                    </span>
                  </div>
                </div>
                {reviewers.length > 0 && (
                  <div className="pr-impact-card">
                    <div className="pr-impact-card-title">{iconLabel('users', 'Suggested Reviewers')}</div>
                    {reviewers.map((r: any, i: number) => (
                      <div key={i} className="pr-reviewer-card">
                        <div className="pr-reviewer-avatar" style={{ background: r.avatar }}>{r.name[0]}</div>
                        <div className="pr-reviewer-info">
                          <div className="pr-reviewer-name">{r.name}</div>
                          <div className="pr-reviewer-reason">{r.reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {testImpact.length > 0 && (
                  <div className="pr-impact-card">
                    <div className="pr-impact-card-title">{iconLabel('beaker', 'Test Impact')}</div>
                    <div className="pr-test-impact">
                      {testImpact.slice(0, 5).map((t: any, i: number) => (
                        <div key={i} className="pr-test-file">
                          <span className="pr-test-icon"><Icon name={t.suggested ? 'spark' : 'security'} size="s" /></span>
                          <span style={{ flex: 1 }}>{t.file}</span>
                          {t.suggested && <span className="badge badge-info">suggested</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {chains.length > 0 && (
                <div className="pr-impact-card" style={{ marginTop: 16 }}>
                  <div className="pr-impact-card-title">{iconLabel('link', 'Dependency Chains')}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 12 }}>Files that import modified files (downstream impact)</div>
                  {chains.map((chain: any[], i: number) => (
                    <div key={i} className="pr-dependency-chain" style={{ marginBottom: 8 }}>
                      {chain.map((node: string, j: number) => (
                        <span key={j}>
                          <span className={'pr-chain-node' + (j === 0 ? ' changed' : '')}>{node}</span>
                          {j < chain.length - 1 && <span className="pr-chain-arrow icon icon-s"><ArrowRight size={11} strokeWidth={1.9} /></span>}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {(risk.hotspots || []).length > 0 && (
                <div className="pr-impact-card" style={{ marginTop: 16 }}>
                  <div className="pr-impact-card-title">{iconLabel('activity', 'Hotspots')}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 12 }}>Files with highest blast radius</div>
                  {(risk.hotspots || []).map((h: any, i: number) => {
                    const maxBlast = Math.max.apply(null, (risk.hotspots || []).map((x: any) => x.blast)) || 1;
                    return (
                      <div key={i} className="pr-hotspot">
                        <span style={{ fontSize: 10, color: 'var(--t1)', minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.file.split('/').pop()}</span>
                        <div className="pr-hotspot-bar">
                          <div className="pr-hotspot-fill" style={{ width: (h.blast / maxBlast * 100) + '%', background: 'linear-gradient(90deg, var(--orange), var(--red))' }} />
                        </div>
                        <span style={{ fontSize: 9, color: 'var(--t3)', minWidth: 50, textAlign: 'right' }}>{h.blast} files</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="pr-impact-card" style={{ marginTop: 16 }}>
                <div className="pr-impact-card-title">{iconLabel('folder', 'Changed Files')}</div>
                <div className="pr-files-list">
                  {prData.files && prData.files.slice(0, 20).map((f: any, i: number) => {
                    const existing = data && data.files.find((df: any) => df.path === f.filename);
                    const blast = existing ? calcBlast(f.filename, data.connections, data.files) : null;
                    const statusColor = f.status === 'added' ? 'var(--green)' : f.status === 'removed' ? 'var(--red)' : 'var(--blue)';
                    return (
                      <div key={i} className="pr-file-row">
                        <div className="pr-file-status" style={{ background: statusColor }} />
                        <div className="pr-file-info">
                          <div className="pr-file-path">{f.filename.split('/').pop()}</div>
                          <div className="pr-file-folder">{f.filename.includes('/') ? f.filename.substring(0, f.filename.lastIndexOf('/')) : 'root'}</div>
                        </div>
                        <div className="pr-file-badges">
                          {f.additions > 0 && <span className="pr-mini-badge" style={{ background: 'rgba(34,197,94,0.2)', color: 'var(--green)' }}>+{f.additions}</span>}
                          {f.deletions > 0 && <span className="pr-mini-badge" style={{ background: 'rgba(255,95,95,0.2)', color: 'var(--red)' }}>-{f.deletions}</span>}
                          {blast && <span className="pr-mini-badge" style={{ background: blast.level === 'low' ? 'rgba(34,197,94,0.2)' : blast.level === 'medium' ? 'rgba(255,159,67,0.2)' : 'rgba(255,95,95,0.2)', color: blast.level === 'low' ? 'var(--green)' : blast.level === 'medium' ? 'var(--orange)' : 'var(--red)' }}><Icon name="impact" size="s" /> {blast.count}</span>}
                          {revertCounts[f.filename || f.path || ''] > 0 && <span style={{ background: '#9e2a2b', color: 'var(--text-primary)', borderRadius: 4, padding: '1px 6px', fontSize: 11, marginLeft: 8 }}>{revertCounts[f.filename || f.path || ''] + ' reverts'}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {prData.files && prData.files.length > 20 && <div style={{ textAlign: 'center', padding: 8, fontSize: 10, color: 'var(--t3)' }}>+{prData.files.length - 20} more files</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
