import { Icon } from '../../../../shared/components/Icon';

interface Props {
  privateKey: string;
  onPrivateKeyChange: (value: string) => void;
  onClose: () => void;
}

export default function GithubAppKeyModal({ privateKey, onPrivateKeyChange, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal key-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><Icon name="key" size="m" /> GitHub App Private Key</div>
          <button className="modal-close" onClick={onClose}>×</button>
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
            <textarea
              className="form-input"
              placeholder={'-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----'}
              value={privateKey}
              onChange={e => onPrivateKeyChange(e.target.value)}
              rows={10}
            />
          </div>
        </div>
        <div className="modal-footer">
          {privateKey && <button className="top-btn" onClick={() => onPrivateKeyChange('')} style={{ marginRight: 'auto' }}>Clear Key</button>}
          <button className="top-btn" onClick={onClose}>Cancel</button>
          <button className="top-btn primary" onClick={onClose}>Save</button>
        </div>
      </div>
    </div>
  );
}
