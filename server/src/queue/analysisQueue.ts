import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { runAnalysis } from '../analysis/runAnalysis';
import { env } from '../config/env';
import { enqueueStaleProjectAnalyses, persistAnalysis } from '../services/analysisHistory';
import { sendWeeklyDigests } from '../services/weeklyDigest';
import { getInstallationToken } from '../services/githubApp';
import { buildPrReview, publishPrReview, type PrReviewJobData } from '../services/prReview';

export interface AnalysisJobData {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  token?: string;
}

export type AnalysisJobState = 'waiting' | 'active' | 'completed' | 'failed' | null;

// Independent connection from the `redis` (node-redis) client used for the
// session store in index.ts — BullMQ requires ioredis and its own connection,
// but both simply talk to the same Redis instance.
const connection = env.redisUrl ? new IORedis(env.redisUrl, { maxRetriesPerRequest: null }) : null;

export const analysisQueue = connection ? new Queue<AnalysisJobData>('analysis', { connection }) : null;

function jobId(owner: string, repo: string, branch: string): string {
  return `${owner}/${repo}/${branch}`.toLowerCase();
}

// Re-adding a job with an existing, unresolved jobId is a no-op in BullMQ, so
// concurrent requests for the same repo/branch collapse into one job instead
// of racing each other. A previously failed job (kept around briefly for
// visibility) is removed first so a retry actually re-runs instead of BullMQ
// silently handing back the same failed job for the reused id.
export async function enqueueAnalysisJob(data: AnalysisJobData): Promise<void> {
  if (!analysisQueue) throw new Error('Analysis queue is not configured (REDIS_URL missing).');
  const id = jobId(data.owner, data.repo, data.branch);
  const existing = await analysisQueue.getJob(id);
  if (existing && (await existing.isFailed())) await existing.remove();
  await analysisQueue.add('analyze', data, {
    jobId: id,
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });
}

export async function getAnalysisJobState(owner: string, repo: string, branch: string): Promise<AnalysisJobState> {
  if (!analysisQueue) return null;
  const job = await analysisQueue.getJob(jobId(owner, repo, branch));
  if (!job) return null;
  const state = await job.getState();
  if (state === 'completed' || state === 'failed') return state;
  if (state === 'active') return 'active';
  return 'waiting';
}

// Automatic PR reviews from the GitHub App webhook. One job per PR head
// commit: GitHub redelivering the same event, or two quick pushes resolving
// to the same sha, collapse into a single review.
export const prReviewQueue = connection ? new Queue<PrReviewJobData>('pr-review', { connection }) : null;

export async function enqueuePrReviewJob(data: PrReviewJobData): Promise<void> {
  if (!prReviewQueue) throw new Error('PR review queue is not configured (REDIS_URL missing).');
  await prReviewQueue.add('review', data, {
    jobId: `pr/${data.owner}/${data.repo}/${data.number}/${data.headSha}`.toLowerCase(),
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  });
}

// Housekeeping on a timer: the scheduled sweep that re-analyzes project
// repositories whose default branch moved (see analysisHistory.ts), and the
// weekly digest to project alert webhooks (see weeklyDigest.ts).
const maintenanceQueue = connection ? new Queue('maintenance', { connection }) : null;
const SWEEP_SCHEDULER_ID = 'scheduled-analysis-sweep';
const DIGEST_SCHEDULER_ID = 'weekly-digest';

async function scheduleDigest(): Promise<void> {
  if (!maintenanceQueue) return;
  if (!env.digestCron || env.digestCron === 'off') {
    await maintenanceQueue.removeJobScheduler(DIGEST_SCHEDULER_ID);
    return;
  }
  await maintenanceQueue.upsertJobScheduler(DIGEST_SCHEDULER_ID, { pattern: env.digestCron, tz: 'UTC' }, { name: 'digest' });
}

async function scheduleAnalysisSweep(): Promise<void> {
  if (!maintenanceQueue) return;
  if (env.analysisScheduleMinutes <= 0) {
    await maintenanceQueue.removeJobScheduler(SWEEP_SCHEDULER_ID);
    return;
  }
  await maintenanceQueue.upsertJobScheduler(SWEEP_SCHEDULER_ID, { every: env.analysisScheduleMinutes * 60_000 }, { name: 'sweep' });
}

let analysisWorker: Worker<AnalysisJobData> | null = null;
let prReviewWorker: Worker<PrReviewJobData> | null = null;
let maintenanceWorker: Worker | null = null;

export function startAnalysisWorker(): Worker<AnalysisJobData> | null {
  if (!connection || analysisWorker) return analysisWorker;
  analysisWorker = new Worker<AnalysisJobData>('analysis', async (job: Job<AnalysisJobData>) => {
    const { owner, repo, branch, commitSha, token } = job.data;
    const data = await runAnalysis({ owner, repo, branch, token });
    await persistAnalysis(owner, repo, branch, commitSha, data);
  }, { connection });
  analysisWorker.on('failed', (job, error) => console.error(`Analysis job ${job?.id} failed:`, error));
  prReviewWorker = new Worker<PrReviewJobData>('pr-review', async (job: Job<PrReviewJobData>) => {
    const { owner, repo, number, installationId } = job.data;
    const token = await getInstallationToken(installationId);
    const report = await buildPrReview({ owner, repo, number, token, analysis: 'fresh' });
    // A newer push may have landed while this job waited; its own job will
    // review that commit, so don't post a review for a superseded one.
    if (report.headSha !== job.data.headSha) return;
    await publishPrReview(report, token);
  }, { connection, concurrency: 2 });
  prReviewWorker.on('failed', (job, error) => console.error(`PR review job ${job?.id} failed:`, error));
  maintenanceWorker = new Worker('maintenance', async (job: Job) => {
    if (job.name === 'digest') {
      const sent = await sendWeeklyDigests();
      if (sent) console.log(`Weekly digest sent to ${sent} channel(s).`);
      return;
    }
    const queued = await enqueueStaleProjectAnalyses(enqueueAnalysisJob);
    if (queued) console.log(`Scheduled sweep queued ${queued} analysis job(s).`);
  }, { connection });
  maintenanceWorker.on('failed', (job, error) => console.error(`Maintenance job ${job?.id} failed:`, error));
  scheduleAnalysisSweep().catch(error => console.error('Could not schedule the analysis sweep:', error));
  scheduleDigest().catch(error => console.error('Could not schedule the weekly digest:', error));
  return analysisWorker;
}

export async function stopAnalysisWorker(): Promise<void> {
  await analysisWorker?.close();
  await prReviewWorker?.close();
  await maintenanceWorker?.close();
  await connection?.quit();
}
