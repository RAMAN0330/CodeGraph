import { Icon } from '../../../../shared/components/Icon';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Props {
  onClose: () => void;
}

export default function PrivacyModal({ onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="modal privacy-modal p-0 gap-0 border-0 rounded-none shadow-none bg-transparent max-w-none sm:max-w-none"
        showCloseButton={false}
      >
        <div className="modal-header">
          <div className="modal-title"><Icon name="lock" size="m" /> Privacy &amp; Security</div>
          <Button variant="ghost" className="modal-close h-auto p-0" onClick={onClose}>×</Button>
        </div>
        <div className="modal-body">
          <div className="privacy-item">
            <div className="privacy-icon"><Icon name="globe" size="l" /></div>
            <div>
              <div className="privacy-title">100% Browser-Based</div>
              <div className="privacy-text">Structrace runs entirely in your browser. No backend servers, no data collection.</div>
            </div>
          </div>
          <div className="privacy-item">
            <div className="privacy-icon"><Icon name="key" size="l" /></div>
            <div>
              <div className="privacy-title">Your Token Stays Local</div>
              <div className="privacy-text">Your GitHub token is stored only in your browser&apos;s memory. It&apos;s never saved, logged, or transmitted anywhere except directly to GitHub&apos;s API.</div>
            </div>
          </div>
          <div className="privacy-item">
            <div className="privacy-icon"><Icon name="share" size="l" /></div>
            <div>
              <div className="privacy-title">Direct API Calls</div>
              <div className="privacy-text">All GitHub API calls go directly from your browser to api.github.com. We have no proxy, no middleware, no way to intercept your data.</div>
            </div>
          </div>
          <div className="privacy-item">
            <div className="privacy-icon"><Icon name="ban" size="l" /></div>
            <div>
              <div className="privacy-title">Nothing Persisted</div>
              <div className="privacy-text">Close the tab and everything is gone. No cookies, no local storage, no tracking. Check the source code - it&apos;s all in one HTML file!</div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: 12, background: 'var(--accbg)', borderRadius: 8, fontSize: 10, color: 'var(--t1)' }}>
            <Icon name="spark" size="s" /> Tip: Create a{' '}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" style={{ color: 'var(--acc)' }}>Personal Access Token</a>{' '}
            with only "public_repo" scope for extra peace of mind when analyzing public repositories.
          </div>
        </div>
        <div className="modal-footer">
          <Button className="top-btn primary h-auto" onClick={onClose}>Got it!</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
