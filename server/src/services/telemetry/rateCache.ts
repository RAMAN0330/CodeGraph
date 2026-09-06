import type { ActivityEvent } from '../../types/telemetry';

// In-memory, per-project state used to turn cumulative database counters
// (e.g. Postgres's xact_commit) into a rate between two polls, and to keep a
// short rolling window of "live activity" derived from real deltas seen
// during polling. Both reset on server restart — this is intentionally not
// persisted, since it only needs to bridge the gap between consecutive
// live polls, not provide a durable audit trail.

interface CounterSnapshot {
  atMs: number;
  counters: Record<string, number>;
}

const counterCache = new Map<number, CounterSnapshot>();
const activityCache = new Map<number, ActivityEvent[]>();

const MAX_ACTIVITY_EVENTS = 50;

/** Returns the per-second rate of change for each counter since the last call for this project, or null on the first call. */
export function computeRates(projectId: number, counters: Record<string, number>): Record<string, number> | null {
  const now = Date.now();
  const previous = counterCache.get(projectId);
  counterCache.set(projectId, { atMs: now, counters });
  if (!previous) return null;
  const elapsedSeconds = (now - previous.atMs) / 1000;
  if (elapsedSeconds <= 0) return null;
  const rates: Record<string, number> = {};
  for (const key of Object.keys(counters)) {
    const prevValue = previous.counters[key];
    if (prevValue === undefined) continue;
    const delta = counters[key] - prevValue;
    rates[key] = delta < 0 ? 0 : delta / elapsedSeconds;
  }
  return rates;
}

export function pushActivityEvent(projectId: number, event: ActivityEvent): void {
  const list = activityCache.get(projectId) ?? [];
  list.unshift(event);
  if (list.length > MAX_ACTIVITY_EVENTS) list.length = MAX_ACTIVITY_EVENTS;
  activityCache.set(projectId, list);
}

export function getRecentActivity(projectId: number, limit = 8): ActivityEvent[] {
  return (activityCache.get(projectId) ?? []).slice(0, limit);
}
