import { Icon } from '../../../../shared/components/Icon';
import { DEFAULT_EXCLUDE_CHIPS, parseExcludePatterns } from '../../../analysis/services/parser';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  draft: string;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  launchFolderAfterSave: boolean;
}

export default function ExcludePatternModal({ draft, onDraftChange, onClose, onSave, launchFolderAfterSave }: Props) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="modal p-0 gap-0 border-0 rounded-none shadow-none bg-transparent max-w-none sm:max-w-none"
        style={{ maxWidth: 540 }}
        showCloseButton={false}
      >
        <div className="modal-header">
          <div className="modal-title"><Icon name="ban" size="m" /> Exclude Patterns</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="exclude-count">{parseExcludePatterns(draft).length} custom</div>
            <Button variant="ghost" className="modal-close hover:bg-transparent h-auto p-0" onClick={onClose}>×</Button>
          </div>
        </div>
        <div className="modal-body">
          <div className="exclude-note">
            Common build and cache folders are already excluded by default. Add project-specific patterns here before scanning a repo or opening a local folder.
          </div>
          <div className="exclude-note">
            Supports exact names like <code>.git</code> or <code>attachments</code>, file globs like <code>*.png</code>, and path globs like <code>uploads/**</code> or <code>**/cache/**</code>.
          </div>
          <div className="form-group">
            <label className="form-label">Always Excluded</label>
            <div className="exclude-chip-list">
              {DEFAULT_EXCLUDE_CHIPS.map(pattern => (
                <div key={pattern} className="exclude-chip">{pattern}</div>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Custom Patterns</label>
            <Textarea
              className="form-input exclude-textarea"
              aria-label="Custom exclude patterns"
              placeholder={'attachments\nuploads/**\n**/cache/**\n*.png\n*.log'}
              value={draft}
              onChange={e => onDraftChange(e.target.value)}
              rows={8}
            />
            <div className="exclude-help">Use one pattern per line, or separate patterns with commas. Changes apply to the next analysis or refresh.</div>
          </div>
        </div>
        <div className="modal-footer">
          {draft && <Button className="top-btn h-auto" onClick={() => onDraftChange('')} style={{ marginRight: 'auto' }}>Clear Custom</Button>}
          <Button className="top-btn h-auto" onClick={onClose}>Cancel</Button>
          <Button className="top-btn primary h-auto" onClick={onSave}>{launchFolderAfterSave ? 'Save & Continue' : 'Save'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
