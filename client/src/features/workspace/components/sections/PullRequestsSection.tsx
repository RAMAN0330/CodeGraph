import { GitPullRequest } from 'lucide-react';

interface Props {
  prUrl: string;
  onPrUrlChange: (value: string) => void;
  onLoadPr: () => void;
}

export default function PullRequestsSection({ prUrl, onPrUrlChange, onLoadPr }: Props) {
  return (
    <div className="pr-page">
      <div className="pr-card">
        <span className="pr-icon"><GitPullRequest size={22} strokeWidth={1.7} /></span>
        <h1>PR Review</h1>
        <p>Paste a GitHub pull request URL to review its change risk against this repository's analysis.</p>
        <input
          type="text"
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={e => onPrUrlChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && prUrl) onLoadPr(); }}
        />
        <button onClick={onLoadPr} disabled={!prUrl}>Load PR</button>
      </div>
    </div>
  );
}
