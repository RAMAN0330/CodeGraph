import { Icon } from '../../../../shared/components/Icon';
import { getDialogTone } from '../../../analysis/services/parser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
    <Dialog open onOpenChange={(open) => { if (!open) onResolve(false); }}>
      <DialogContent
        className="modal confirm-modal p-0 gap-0 border-0 rounded-none shadow-none bg-transparent max-w-none w-[90%] sm:max-w-none"
        style={{ zIndex: 1200 }}
        showCloseButton={false}
      >
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
          <Button className="top-btn h-auto" onClick={() => onResolve(false)}>{dialog.cancelLabel || 'Cancel'}</Button>
          <Button className="top-btn primary h-auto" style={{ background: tone.color, borderColor: tone.color, color: 'var(--bg0)' }} onClick={() => onResolve(true)}>{dialog.confirmLabel || 'Continue'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
