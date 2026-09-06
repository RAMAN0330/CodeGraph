import { Icon } from '../../../../shared/components/Icon';
import { getDialogTone } from '../../../analysis/services/parser';

export interface ConfirmDialogState {
  title: string;
  message: string;
  tone?: string;
  icon?: string;
  cancelLabel?: string;
  confirmLabel?: string;
}

interface Props {
  dialog: ConfirmDialogState;
  onResolve: (result: boolean) => void;
}

export default function ConfirmDialog({ dialog, onResolve }: Props) {
  const tone = getDialogTone(dialog.tone);
  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => onResolve(false)}>
      <div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-body">
          <div className="confirm-content">
            <div className="confirm-icon" style={{ color: tone.color, background: tone.background, border: '1px solid ' + tone.borderColor }}>
              <Icon name={dialog.icon || 'warning'} size="l" />
            </div>
            <div className="confirm-copy">
              <div className="confirm-title">{dialog.title}</div>
              <div className="confirm-message">{dialog.message}</div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="top-btn" onClick={() => onResolve(false)}>{dialog.cancelLabel || 'Cancel'}</button>
          <button className="top-btn primary" style={{ background: tone.color, borderColor: tone.color, color: 'var(--bg0)' }} onClick={() => onResolve(true)}>{dialog.confirmLabel || 'Continue'}</button>
        </div>
      </div>
    </div>
  );
}
