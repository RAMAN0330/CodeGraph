import { detectRegressions, snapshotOf, type Regression } from '../analysis/sharedRules';
import { saveAnalysis, getAnalysis } from '../db/analysisStore';
import { insertAlerts, insertSnapshot, latestSnapshot } from '../db/analysisHistory';
import { listAlertWebhooksForRepository, listWatchedRepositories } from '../db/projectStore';
import { revealSecret } from './credentialCipher';
import { formatAlertMessage, sendWebhookMessage } from './alertNotifier';
import { GitHubApiError, fetchLatestCommitSha } from './githubService';
import { workspaceUrlFor } from './appLinks';
import type { AnalysisJobData } from '../queue/analysisQueue';

// Every finished analysis goes through here: stored for the workspace,
// snapshotted for history, and compared with the previous commit's snapshot.
// Regressions are recorded and pushed to the repository's alert webhooks.
export async function persistAnalysis(owner: string, repo: string, branch: string, commitSha: string, data: unknown): Promise<Regression[]> {
  await saveAnalysis(owner, repo, branch, commitSha, data);
  const snapshot = snapshotOf(data, new Date().toISOString(), commitSha);
  const previous = await latestSnapshot(owner, repo, branch);
  // A Rescan of the same commit refreshes the data but isn't a new data point.
  if (previous && previous.commitSha === commitSha) return [];
  await insertSnapshot(owner, repo, branch, snapshot);
  const regressions = detectRegressions(previous, snapshot);
  if (!regressions.length) return regressions;
  await insertAlerts(owner, repo, branch, commitSha, regressions);
  const text = formatAlertMessage({ owner, repo, branch, commitSha, regressions, workspaceUrl: workspaceUrlFor(owner, repo) });
  const urls = await listAlertWebhooksForRepository(owner, repo);
  await Promise.all(urls.map(url => sendWebhookMessage(url, text).catch(error => console.error(`Alert webhook for ${owner}/${repo} failed:`, error.message))));
  return regressions;
}

async function headShaFor(owner: string, repo: string, token: string | undefined): Promise<{ sha: string | null; token?: string }> {
  try {
    return { sha: await fetchLatestCommitSha(owner, repo, undefined, token), token };
  } catch (error) {
    // A connection GitHub no longer accepts shouldn't stop public repos.
    if (token && error instanceof GitHubApiError && error.status === 401) return { sha: await fetchLatestCommitSha(owner, repo, undefined, undefined) };
    throw error;
  }
}

// Scheduled sweep: re-analyze the default branch of every repository attached
// to a codebase project whose HEAD moved since its stored analysis. Analysis
// jobs are deduplicated per repo/branch, so overlapping sweeps are harmless.
export async function enqueueStaleProjectAnalyses(enqueue: (job: AnalysisJobData) => Promise<void>): Promise<number> {
  let queued = 0;
  for (const watched of await listWatchedRepositories()) {
    const { owner, repo } = watched;
    try {
      const head = await headShaFor(owner, repo, revealSecret(watched.encryptedToken) ?? undefined);
      if (!head.sha) continue;
      const stored = await getAnalysis(owner, repo, 'HEAD');
      if (stored?.commitSha === head.sha) continue;
      await enqueue({ owner, repo, branch: 'HEAD', commitSha: head.sha, token: head.token });
      queued++;
    } catch (error: any) {
      console.error(`Scheduled analysis check for ${owner}/${repo} failed:`, error.message);
    }
  }
  return queued;
}
