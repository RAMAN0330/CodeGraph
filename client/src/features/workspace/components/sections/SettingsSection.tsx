import { useState, type ReactNode } from 'react';
import {
  Ban, Download, FolderGit2, GitBranch, LogOut, RefreshCw, Settings as SettingsIcon,
  ShieldCheck, SlidersHorizontal, UserRound,
} from 'lucide-react';
import { appConfig } from '../../../../app/config';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Page, PageHeader, Section } from '../../../../shared/components/Page';
import { SummaryStrip } from '../../../../shared/components/SummaryStrip';
import { StateCard } from '../../../../shared/components/StateCard';

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

/** One setting: what it is and why it matters on the left, its control on the right. */
function Row({ title, description, children }: { title: ReactNode; description: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong className="truncate text-[13px] font-semibold">{title}</strong>
        <span className="text-xs leading-snug text-muted-foreground">{description}</span>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
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

  const btn = 'h-8 gap-1.5 text-xs';

  return (
    <Page>
      <PageHeader icon={SettingsIcon} tone="settings" title="Settings" description="Your account and this workspace's analysis preferences." />

      <SummaryStrip items={[
        { label: 'Signed in as', value: login || '—', sub: 'GitHub account' },
        { label: 'Source', value: repoInfo ? (isLocalFolder ? 'Local' : 'GitHub') : '—', sub: repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : 'No repository connected' },
        { label: 'Analysis', value: reanalyzing ? 'Running' : hasData ? 'Ready' : 'None', tone: reanalyzing ? 'warn' : hasData ? 'good' : 'neutral', sub: currentBranch ? `Branch ${currentBranch}` : undefined },
        { label: 'Exclude patterns', value: excludeCount, sub: 'Manage', onClick: onManageExcludes },
      ]} />

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto lg:grid-cols-2 lg:grid-rows-2">
        <Section title="Account" icon={UserRound} bodyClassName="py-1">
          <div className="flex items-center gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border bg-card text-muted-foreground">
              {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : <UserRound className="size-5" strokeWidth={1.6} />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <strong className="truncate text-[13px] font-semibold">{login || 'Account'}</strong>
              <span className="text-xs text-muted-foreground">Connected via GitHub</span>
            </div>
          </div>
          <div className="border-t">
            <Row title="Sign out" description="End this session on this device. Your analyses and notes stay saved.">
              <Button variant="outline" size="sm" className={cn(btn, 'text-[var(--color-danger)]')} onClick={handleSignOut} disabled={signingOut}>
                <LogOut className="size-3.5" /> {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </Row>
          </div>
        </Section>

        <Section title="Repository" icon={FolderGit2} bodyClassName="py-1">
          {repoInfo ? (
            <div className="divide-y">
              <Row title={`${repoInfo.owner}/${repoInfo.repo}`} description={isLocalFolder ? 'Local folder, read in this browser' : 'GitHub repository'} />
              {currentBranch && (
                <Row title={<span className="inline-flex items-center gap-1.5"><GitBranch className="size-3.5 text-muted-foreground" />{currentBranch}</span>} description="Current branch. Switch it from the branch menu in the top bar." />
              )}
            </div>
          ) : (
            <StateCard icon={FolderGit2} title="No repository connected">Connect a repository to manage its analysis settings.</StateCard>
          )}
        </Section>

        <Section title="Analysis" icon={SlidersHorizontal} bodyClassName="py-1">
          <div className="divide-y">
            <Row title={<span className="inline-flex items-center gap-1.5"><Ban className="size-3.5 text-muted-foreground" />{excludeCount} custom exclude pattern{excludeCount === 1 ? '' : 's'}</span>} description="Folders and files skipped during analysis, on top of the built-in defaults.">
              <Button variant="outline" size="sm" className={btn} onClick={onManageExcludes}>Manage</Button>
            </Row>
            <Row title="Re-run analysis" description={repoInfo ? 'Re-scan the repository with the current exclude patterns.' : 'Connect a repository first.'}>
              <Button variant="outline" size="sm" className={btn} onClick={onReanalyze} disabled={reanalyzing || !repoInfo}>
                <RefreshCw className={cn('size-3.5', reanalyzing && 'animate-spin')} /> {reanalyzing ? 'Analyzing…' : 'Re-analyze'}
              </Button>
            </Row>
          </div>
        </Section>

        <Section title="Data and privacy" icon={ShieldCheck} bodyClassName="py-1">
          <div className="divide-y">
            <Row title="Export report" description={hasData ? 'Download this analysis as a shareable report.' : 'Available once an analysis has finished.'}>
              <Button variant="outline" size="sm" className={btn} onClick={onExportReport} disabled={!hasData || !repoInfo}>
                <Download className="size-3.5" /> Export
              </Button>
            </Row>
            <Row title="Where analysis runs" description="Repository analysis (code graph, patterns, security scan) runs directly in your browser. No third-party AI service is involved." />
          </div>
        </Section>
      </div>
    </Page>
  );
}
