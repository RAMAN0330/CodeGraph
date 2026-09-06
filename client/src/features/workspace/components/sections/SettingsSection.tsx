import { useState } from 'react';
import {
  Ban, Download, FolderGit2, GitBranch, LogOut, RefreshCw, Settings as SettingsIcon,
  ShieldCheck, UserRound,
} from 'lucide-react';
import { appConfig } from '../../../../app/config';

interface RepoInfo {
  owner: string;
  repo: string;
}

interface Props {
  login: string;
  avatarUrl: string;
  repoInfo?: RepoInfo | null;
  currentBranch?: string;
  isLocalFolder?: boolean;
  excludeCount: number;
  onManageExcludes: () => void;
  onReanalyze: () => void;
  onExportReport: () => void;
  reanalyzing?: boolean;
  hasData: boolean;
}

export default function SettingsSection({
  login, avatarUrl, repoInfo, currentBranch, isLocalFolder, excludeCount,
  onManageExcludes, onReanalyze, onExportReport, reanalyzing, hasData,
}: Props) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch(`${appConfig.apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      window.location.replace('/');
    }
  }
  return (
    <div className="set-page">
      <header className="set-header">
        <span className="set-header-icon"><SettingsIcon size={22} strokeWidth={1.7} /></span>
        <div>
          <h1>Settings</h1>
          <p>Your account and this workspace's analysis preferences.</p>
        </div>
      </header>

      <section className="set-card">
        <header className="set-card-head">
          <h2><UserRound size={14} strokeWidth={2} /> Account</h2>
        </header>
        <div className="set-account">
          <span className="set-account-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <UserRound size={22} strokeWidth={1.6} />}
          </span>
          <div className="set-account-copy">
            <strong>{login || 'Account'}</strong>
            <span>Connected via GitHub</span>
          </div>
          <button className="set-btn danger" onClick={handleSignOut} disabled={signingOut}>
            <LogOut size={14} strokeWidth={1.9} /> {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </section>

      <section className="set-card">
        <header className="set-card-head">
          <h2><FolderGit2 size={14} strokeWidth={2} /> Repository</h2>
        </header>
        {repoInfo ? (
          <div className="set-rows">
            <div className="set-row">
              <div className="set-row-copy">
                <strong>{repoInfo.owner}/{repoInfo.repo}</strong>
                <span>{isLocalFolder ? 'Local folder' : 'GitHub repository'}</span>
              </div>
            </div>
            {currentBranch && (
              <div className="set-row">
                <div className="set-row-copy">
                  <strong><GitBranch size={13} strokeWidth={2} style={{ verticalAlign: '-2px', marginRight: 5 }} />{currentBranch}</strong>
                  <span>Current branch</span>
                </div>
              </div>
            )}
            <div className="set-row">
              <div className="set-row-copy">
                <strong>Re-run analysis</strong>
                <span>Re-scan the repository with the current exclude patterns</span>
              </div>
              <button className="set-btn" onClick={onReanalyze} disabled={reanalyzing}>
                <RefreshCw size={14} strokeWidth={1.9} className={reanalyzing ? 'set-spin' : ''} /> {reanalyzing ? 'Analyzing…' : 'Re-analyze'}
              </button>
            </div>
            <div className="set-row">
              <div className="set-row-copy">
                <strong>Export report</strong>
                <span>Download this analysis as a shareable report</span>
              </div>
              <button className="set-btn" onClick={onExportReport} disabled={!hasData}>
                <Download size={14} strokeWidth={1.9} /> Export
              </button>
            </div>
          </div>
        ) : (
          <p className="set-empty-note">Connect a repository to manage its analysis settings.</p>
        )}
      </section>

      <section className="set-card">
        <header className="set-card-head">
          <h2><Ban size={14} strokeWidth={2} /> Exclude Patterns</h2>
        </header>
        <div className="set-row">
          <div className="set-row-copy">
            <strong>{excludeCount} custom pattern{excludeCount === 1 ? '' : 's'}</strong>
            <span>Folders and files skipped during analysis, on top of the built-in defaults</span>
          </div>
          <button className="set-btn" onClick={onManageExcludes}>Manage</button>
        </div>
      </section>

      <section className="set-card set-about">
        <header className="set-card-head">
          <h2><ShieldCheck size={14} strokeWidth={2} /> About</h2>
        </header>
        <p className="set-empty-note">
          Repository analysis (code graph, patterns, security scan) runs directly in your browser — no third-party AI service is involved.
        </p>
      </section>
    </div>
  );
}
