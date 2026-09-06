import { ArrowRight } from 'lucide-react';
import { Icon } from '../../../../shared/components/Icon';
import { StatusDot } from '../../../../shared/components/StatusDot';
import { getAccentBlockStyle, getSeverityColor } from '../../../analysis/services/parser';

export interface DrillDownState {
  type: 'issue' | 'pattern' | 'security' | 'duplicate';
  data: any;
}

interface Props {
  drillDown: DrillDownState;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  onViewSource: (path: string, line?: number) => void;
}

const FIX_ADVICE: Record<string, string> = {
  'Hardcoded Secret': 'Move credentials to environment variables (process.env) or a secrets manager like AWS Secrets Manager, HashiCorp Vault, or .env files (not committed to git).',
  'SQL Injection Risk': 'Use parameterized queries or prepared statements. Never concatenate user input directly into SQL strings.',
  'XSS Vulnerability': 'Sanitize user input before rendering. Use textContent instead of innerHTML, or use a sanitization library like DOMPurify.',
  'Dynamic Code Execution': 'Avoid eval() entirely. Use JSON.parse() for JSON, or Function constructor only with trusted input.',
};

export default function DrillDownModal({ drillDown, onClose, onSelectFile, onViewSource }: Props) {
  const { type, data } = drillDown;

  const title =
    type === 'issue' ? (
      <>
        <StatusDot color={data.type === 'critical' ? 'var(--red)' : 'var(--orange)'} /> {data.title}
      </>
    ) : type === 'pattern' ? (
      <>
        <Icon name={data.icon} size="m" /> {data.name}
      </>
    ) : type === 'security' ? (
      <>
        <StatusDot color={getSeverityColor(data.severity)} /> {data.title}
      </>
    ) : type === 'duplicate' ? (
      <>
        <Icon name={data.type === 'code' ? 'copy' : 'note'} size="m" /> {(data.type === 'code' ? 'Similar Code' : 'Duplicate Name') + ': ' + data.name}
      </>
    ) : (
      'Details'
    );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {type === 'issue' && (
            <>
              <div style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--t2)' }}>{data.desc}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>All Affected Items ({data.items ? data.items.length : 0})</div>
              {data.items && data.items.map((item: any, j: number) => (
                <div key={j} style={getAccentBlockStyle('rgba(0,255,157,0.28)', 'rgba(0,255,157,0.08)', { padding: 12, marginBottom: 8 })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 11 }}>{item.name}</div>
                    {item.file && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="view-file-btn" onClick={e => { e.stopPropagation(); onViewSource(item.file, item.line); }}><Icon name="eye" size="s" /> View</button>
                        <button style={{ fontSize: 9, padding: '4px 8px', background: 'var(--acc)', color: 'var(--bg0)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => { e.stopPropagation(); onSelectFile(item.file); onClose(); }}>Go to file <span className="icon icon-s"><ArrowRight size={11} strokeWidth={1.9} /></span></button>
                      </div>
                    )}
                  </div>
                  {item.file && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontFamily: 'monospace' }}>{item.file}{item.line ? ' : ' + item.line : ''}</div>}
                  {(item.lines || item.fns || item.imports || item.score) && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      {item.lines && <span style={{ fontSize: 9, color: 'var(--purple)' }}>{item.lines} lines</span>}
                      {item.fns && <span style={{ fontSize: 9, color: 'var(--orange)' }}>{item.fns} functions</span>}
                      {item.imports && <span style={{ fontSize: 9, color: 'var(--blue)' }}>{item.imports} imports</span>}
                      {item.score && <span style={{ fontSize: 9, color: 'var(--red)' }}>Complexity: {item.score}</span>}
                    </div>
                  )}
                  {item.code && <pre style={{ fontSize: 9, background: 'var(--bg2)', padding: 8, borderRadius: 4, marginTop: 8, overflow: 'auto', maxHeight: 100, fontFamily: 'monospace' }}>{item.code}</pre>}
                  {item.suggestion && <div style={{ fontSize: 10, color: 'var(--acc)', marginTop: 8, padding: '6px 8px', background: 'var(--bg2)', borderRadius: 4 }}><Icon name="spark" size="s" /> {item.suggestion}</div>}
                  {item.files && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: 'var(--t3)', marginBottom: 4 }}>Locations:</div>
                      {item.files.map((f: any, k: number) => (
                        <div key={k} style={{ fontSize: 9, color: 'var(--t2)', padding: '4px 8px', background: 'var(--bg2)', borderRadius: 4, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'monospace', cursor: 'pointer', flex: 1 }} onClick={() => { onSelectFile(f.file || f); onClose(); }}>{(typeof f === 'string' ? f.split('/').pop() : (f.file || '').split('/').pop())}{f.line ? ' :' + f.line : ''}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="view-file-btn" onClick={e => { e.stopPropagation(); onViewSource(f.file || f, f.line); }}><Icon name="eye" size="s" /></button>
                            <span className="icon icon-s" style={{ color: 'var(--acc)', cursor: 'pointer' }} onClick={() => { onSelectFile(f.file || f); onClose(); }}><ArrowRight size={11} strokeWidth={1.9} /></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {type === 'pattern' && (
            <>
              <div style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--t2)' }}>{data.desc}</div>
                {data.isAnti && <div style={{ marginTop: 8 }}><span className="badge badge-danger">Anti-pattern</span></div>}
              </div>
              {data.metrics && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  {Object.entries(data.metrics).map(([k, v]: [string, any]) => (
                    <div key={k} style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--acc)' }}>{v}</div>
                      <div style={{ fontSize: 9, color: 'var(--t3)', textTransform: 'capitalize' }}>{k}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>All Files ({data.files.length})</div>
              {data.files.map((f: any, j: number) => (
                <div key={j} style={getAccentBlockStyle('rgba(0,255,157,0.28)', 'rgba(0,255,157,0.08)', { padding: 12, marginBottom: 8 })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 11, cursor: 'pointer' }} onClick={() => { onSelectFile(f.path); onClose(); }}>{f.name}</div>
                    <button className="view-file-btn" onClick={e => { e.stopPropagation(); onViewSource(f.path); }}><Icon name="eye" size="s" /> View</button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontFamily: 'monospace', cursor: 'pointer' }} onClick={() => { onSelectFile(f.path); onClose(); }}>{f.path}</div>
                  {f.fns && <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 4 }}>{f.fns} functions</div>}
                  {f.lines && <div style={{ fontSize: 10, color: 'var(--purple)', marginTop: 4 }}>{f.lines} lines</div>}
                </div>
              ))}
            </>
          )}

          {type === 'security' && (
            <>
              <div style={
                data.severity === 'high'
                  ? getAccentBlockStyle('rgba(255,95,95,0.36)', 'rgba(255,95,95,0.1)', { padding: 12, marginBottom: 16 })
                  : data.severity === 'medium'
                    ? getAccentBlockStyle('rgba(255,159,67,0.34)', 'rgba(255,180,100,0.1)', { padding: 12, marginBottom: 16 })
                    : getAccentBlockStyle('rgba(77,159,255,0.34)', 'rgba(100,180,255,0.1)', { padding: 12, marginBottom: 16 })
              }>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{data.severity.toUpperCase()} Severity</div>
                <div style={{ fontSize: 11, color: 'var(--t2)' }}>{data.desc}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Location</div>
              <div style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: 11, cursor: 'pointer' }} onClick={() => { onSelectFile(data.path); onClose(); }}>{data.file}</div>
                  <button className="view-file-btn" onClick={e => { e.stopPropagation(); onViewSource(data.path, data.line); }}><Icon name="eye" size="s" /> View</button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontFamily: 'monospace', cursor: 'pointer' }} onClick={() => { onSelectFile(data.path); onClose(); }}>{data.path}</div>
                {data.line && <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 4 }}>Line {data.line}</div>}
              </div>
              {data.code && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Code</div>
                  <pre style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, fontSize: 10, fontFamily: 'monospace', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{data.code}</pre>
                </>
              )}
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, marginTop: 16 }}>How to Fix</div>
              <div style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, fontSize: 10 }}>
                {FIX_ADVICE[data.title] || 'Review the flagged code and apply security best practices.'}
              </div>
            </>
          )}

          {type === 'duplicate' && (
            <>
              <div style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--t2)' }}>{data.suggestion}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>All Locations ({data.files.length})</div>
              {data.files.map((f: any, j: number) => (
                <div key={j} style={
                  data.type === 'code'
                    ? getAccentBlockStyle('rgba(167,139,250,0.34)', 'rgba(167,139,250,0.08)', { padding: 12, marginBottom: 8 })
                    : getAccentBlockStyle('rgba(255,159,67,0.34)', 'rgba(255,159,67,0.08)', { padding: 12, marginBottom: 8 })
                }>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 11, cursor: 'pointer' }} onClick={() => { onSelectFile(f.file); onClose(); }}>{f.name || data.name}</div>
                    <button className="view-file-btn" onClick={e => { e.stopPropagation(); onViewSource(f.file, f.line); }}><Icon name="eye" size="s" /> View</button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4, fontFamily: 'monospace', cursor: 'pointer' }} onClick={() => { onSelectFile(f.file); onClose(); }}>{f.file}</div>
                  {f.line && <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 4 }}>Line {f.line}</div>}
                </div>
              ))}
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, marginTop: 16 }}>Suggested Action</div>
              <div style={{ background: 'var(--bg0)', padding: 12, borderRadius: 8, fontSize: 10 }}>
                {data.type === 'code'
                  ? 'Extract the similar code into a shared utility function. This reduces maintenance burden and ensures consistent behavior.'
                  : 'Consider renaming these functions to be more specific, or consolidate them into a single shared function if they serve the same purpose.'}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
