import { useEffect, useRef, useState, useCallback } from 'react';
import { appConfig } from '../../../app/config';
import type {
  ActivityResponse, AlertRule, OverviewResponse, PerformanceResponse, QueriesResponse,
  ReplicationResponse, SecurityResponse, StorageResponse,
} from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${appConfig.apiUrl}${path}`, {
    credentials: 'include',
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.success === false) throw new Error(data?.error || 'Request failed.');
  return (data?.data ?? data) as T;
}

export const dbTelemetryApi = {
  overview: (projectId: number) => request<OverviewResponse>(`/api/projects/${projectId}/db/overview`),
  performance: (projectId: number) => request<PerformanceResponse>(`/api/projects/${projectId}/db/performance`),
  queries: (projectId: number) => request<QueriesResponse>(`/api/projects/${projectId}/db/queries`),
  storage: (projectId: number) => request<StorageResponse>(`/api/projects/${projectId}/db/storage`),
  replication: (projectId: number) => request<ReplicationResponse>(`/api/projects/${projectId}/db/replication`),
  activity: (projectId: number) => request<ActivityResponse>(`/api/projects/${projectId}/db/activity`),
  security: (projectId: number) => request<SecurityResponse>(`/api/projects/${projectId}/db/security`),
  listAlertRules: (projectId: number) => request<AlertRule[]>(`/api/projects/${projectId}/db/alerts`),
  createAlertRule: (projectId: number, input: { metric: string; condition: 'gt' | 'lt'; threshold: number; forMinutes: number }) =>
    request<AlertRule>(`/api/projects/${projectId}/db/alerts`, { method: 'POST', body: JSON.stringify(input) }),
  deleteAlertRule: (projectId: number, ruleId: number) =>
    request<void>(`/api/projects/${projectId}/db/alerts/${ruleId}`, { method: 'DELETE' }),
};

interface UseDbTelemetryOptions {
  pollMs?: number;
  paused?: boolean;
}

/** Fetches once immediately, then re-polls on an interval unless paused. Shared by every dashboard page. */
export function useDbTelemetry<T>(fetcher: () => Promise<T>, deps: unknown[], options: UseDbTelemetryOptions = {}) {
  const { pollMs = 10000, paused = false } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
    if (paused || !pollMs) return;
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, paused, pollMs]);

  return { data, loading, error, refresh };
}
