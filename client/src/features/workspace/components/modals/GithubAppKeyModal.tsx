import { Icon } from '../../../../shared/components/Icon';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  privateKey: string;
  onPrivateKeyChange: (value: string) => void;
  onClose: () => void;
}

export default function GithubAppKeyModal({ privateKey, onPrivateKeyChange, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="modal key-modal p-0 gap-0 border-0 rounded-none shadow-none bg-transparent max-w-none sm:max-w-none"
        showCloseButton={false}
      >
        <div className="modal-header">
          <div className="modal-title"><Icon name="key" size="m" /> GitHub App Private Key</div>
          <Button variant="ghost" className="modal-close hover:bg-transparent h-auto p-0" onClick={onClose}>×</Button>
        </div>
        <div className="modal-body">
          <div className="key-info">
            Paste the private key from your GitHub App. This key is stored only in memory and never leaves your browser.
            <br /><br />
            To get a private key:<br />
            1. Go to GitHub → Settings → Developer settings → GitHub Apps<br />
            2. Select your app → Generate a private key<br />
            3. Open the downloaded <code>.pem</code> file and paste its contents below
          </div>
          <div className="form-group">
            <label className="form-label">Private Key (PEM format)</label>
            <Textarea
              className="form-input"
              placeholder={'-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----'}
              value={privateKey}
              onChange={e => onPrivateKeyChange(e.target.value)}
              rows={10}
            />
          </div>
        </div>
        <div className="modal-footer">
          {privateKey && <Button className="top-btn h-auto" onClick={() => onPrivateKeyChange('')} style={{ marginRight: 'auto' }}>Clear Key</Button>}
          <Button className="top-btn h-auto" onClick={onClose}>Cancel</Button>
          <Button className="top-btn primary h-auto" onClick={onClose}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
