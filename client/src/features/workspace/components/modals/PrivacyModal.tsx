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
              <div className="privacy-title">Your Token Stays on the Server</div>
              <div className="privacy-text">A connected GitHub account&apos;s token is stored encrypted on the server and never sent to your browser. A personal access token you paste here stays in this tab&apos;s memory and goes only to GitHub.</div>
            </div>
          </div>
          <div className="privacy-item">
            <div className="privacy-icon"><Icon name="share" size="l" /></div>
            <div>
              <div className="privacy-title">Read-Only, Cached GitHub Access</div>
              <div className="privacy-text">Reads go through the server&apos;s read-only GitHub proxy, which only allows repository, repository-list and rate-limit endpoints and caches responses by ETag so repeat views don&apos;t spend your rate limit.</div>
            </div>
          </div>
          <div className="privacy-item">
            <div className="privacy-icon"><Icon name="ban" size="l" /></div>
            <div>
              <div className="privacy-title">What Is Stored</div>
              <div className="privacy-text">Your sign-in session cookie, analysis results and repository file caches on the server, and your layout (open section, sidebar width) in this browser. No tracking.</div>
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
