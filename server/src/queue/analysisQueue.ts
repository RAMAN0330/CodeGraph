import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import { runAnalysis } from '../analysis/runAnalysis';
import { saveAnalysis } from '../db/analysisStore';

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

let analysisWorker: Worker<AnalysisJobData> | null = null;

export function startAnalysisWorker(): Worker<AnalysisJobData> | null {
  if (!connection || analysisWorker) return analysisWorker;
  analysisWorker = new Worker<AnalysisJobData>('analysis', async (job: Job<AnalysisJobData>) => {
    const { owner, repo, branch, commitSha, token } = job.data;
    const data = await runAnalysis({ owner, repo, branch, token });
    await saveAnalysis(owner, repo, branch, commitSha, data);
  }, { connection });
  analysisWorker.on('failed', (job, error) => console.error(`Analysis job ${job?.id} failed:`, error));
  return analysisWorker;
}

export async function stopAnalysisWorker(): Promise<void> {
  await analysisWorker?.close();
  await connection?.quit();
}
