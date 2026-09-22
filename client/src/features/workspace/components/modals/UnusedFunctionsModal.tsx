import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Icon } from '../../../../shared/components/Icon';
import { getAccentBlockStyle } from '../../../analysis/services/parser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeadFunction {
  name: string;
  file: string;
  folder?: string;
  codeLines: number;
  line?: number;
  code?: string;
}

interface Props {
  deadFunctions: DeadFunction[];
  expandedFns: Set<string>;
  setExpandedFns: (fns: Set<string>) => void;
  onClose: () => void;
  onViewSource: (file: string, line?: number) => void;
}

export default function UnusedFunctionsModal({ deadFunctions, expandedFns, setExpandedFns, onClose, onViewSource }: Props) {
  const dedupedFiles = new Set(deadFunctions.map(f => f.file)).size;
  const deadLines = deadFunctions.reduce((s, f) => s + f.codeLines, 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="modal p-0 gap-0 border-0 rounded-none shadow-none bg-transparent max-w-none sm:max-w-none"
        style={{ maxWidth: 650, maxHeight: '85vh' }}
        showCloseButton={false}
      >
        <div className="modal-header">
          <div className="modal-title"><Icon name="warning" size="m" /> Unused Functions</div>
          <Button variant="ghost" className="modal-close hover:bg-transparent h-auto p-0" onClick={onClose}>×</Button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="unused-summary">
            <div className="unused-summary-item">
              <div className="unused-summary-value">{deadFunctions.length}</div>
              <div className="unused-summary-label">Dead Functions</div>
            </div>
            <div className="unused-summary-item">
              <div className="unused-summary-value">{deadLines}</div>
              <div className="unused-summary-label">Dead Lines</div>
            </div>
            <div className="unused-summary-item">
              <div className="unused-summary-value">{dedupedFiles}</div>
              <div className="unused-summary-label">Files Affected</div>
            </div>
          </div>
          <div style={{ ...getAccentBlockStyle('rgba(217,119,6,0.34)', 'rgba(217,119,6,0.08)', {}), fontSize: 10, color: 'var(--t3)', marginBottom: 12, padding: '8px 12px', borderRadius: 6 }}>
            These functions have zero calls from other files or within their own file. They are likely dead code that can be safely removed.
          </div>
          {deadFunctions.map((fn, i) => {
            const key = 'dead-' + fn.name;
            const isExpanded = expandedFns.has(key);
            return (
              <div key={i} className="unused-fn">
                <div className="unused-fn-header" onClick={() => {
                  const next = new Set(expandedFns);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  setExpandedFns(next);
                }}>
                  <div>
                    <span className="unused-fn-name">{fn.name}()</span>
                    <div className="unused-fn-path">
                      <span><Icon name="folder" size="s" /> {fn.folder || 'root'}</span>
                      <span className="icon icon-s"><ArrowRight size={11} strokeWidth={1.9} /></span>
                      <span className="unused-fn-file">{fn.file.split('/').pop()}</span>
                    </div>
                  </div>
                  <div className="unused-fn-meta">
                    <Button variant="ghost" className="view-file-btn h-auto p-0" onClick={e => { e.stopPropagation(); onViewSource(fn.file, fn.line); }} title="View source"><Icon name="eye" size="s" /></Button>
                    <span className="unused-fn-lines">{fn.codeLines} lines</span>
                    {fn.line && <span className="unused-fn-loc">L{fn.line}</span>}
                    <span className="icon icon-s" style={{ color: 'var(--t3)' }}>
                      {isExpanded ? <ChevronDown size={12} strokeWidth={1.9} /> : <ChevronRight size={12} strokeWidth={1.9} />}
                    </span>
                  </div>
                </div>
                {isExpanded && fn.code && (
                  <div className="unused-fn-preview">
                    <div className="unused-fn-code">{fn.code}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8 }}>
          <Button className="top-btn h-auto" onClick={() => setExpandedFns(new Set(deadFunctions.map(fn => 'dead-' + fn.name)))}>Expand All</Button>
          <Button className="top-btn h-auto" onClick={() => setExpandedFns(new Set())}>Collapse All</Button>
          <Button className="top-btn primary h-auto" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
