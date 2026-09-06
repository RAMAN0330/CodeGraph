import { Icon } from '../../../../shared/components/Icon';

interface Props {
  onClose: () => void;
}

export default function PrivacyModal({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal privacy-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><Icon name="lock" size="m" /> Privacy &amp; Security</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="privacy-item">
            <div className="privacy-icon"><Icon name="globe" size="l" /></div>
            <div>
              <div className="privacy-title">100% Browser-Based</div>
              <div className="privacy-text">GraphKeep runs entirely in your browser. No backend servers, no data collection.</div>
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
          <button className="top-btn primary" onClick={onClose}>Got it!</button>
        </div>
      </div>
    </div>
  );
}
