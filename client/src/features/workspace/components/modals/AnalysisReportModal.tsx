import { Icon } from '../../../../shared/components/Icon';

interface Props {
  onExportReport: (format: 'json' | 'md' | 'txt') => void;
  onExportRawJson: () => void;
  onClose: () => void;
}

export default function AnalysisReportModal({ onExportReport, onExportRawJson, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div className="modal-title"><Icon name="export" size="m" /> Analysis Report</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 8 }}>Analysis Report</div>
          <div style={{ fontSize: 9, color: 'var(--t2)', marginBottom: 10 }}>Complete analysis with files, functions, patterns, security issues, and dependencies</div>
          <div className="export-options">
            <div className="export-option" onClick={() => { onExportReport('json'); onClose(); }}>
              <div className="export-option-icon"><Icon name="code" size="xl" /></div>
              <div className="export-option-label">JSON Report</div>
            </div>
            <div className="export-option" onClick={() => { onExportReport('md'); onClose(); }}>
              <div className="export-option-icon"><Icon name="note" size="xl" /></div>
              <div className="export-option-label">Markdown</div>
            </div>
            <div className="export-option" onClick={() => { onExportReport('txt'); onClose(); }}>
              <div className="export-option-icon"><Icon name="file" size="xl" /></div>
              <div className="export-option-label">Plain Text</div>
            </div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 }}>Raw Data</div>
          <div className="export-options">
            <div className="export-option" onClick={() => { onExportRawJson(); onClose(); }}>
              <div className="export-option-icon"><Icon name="settings" size="xl" /></div>
              <div className="export-option-label">Raw JSON</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
