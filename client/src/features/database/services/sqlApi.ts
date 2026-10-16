import { appConfig } from '../../../app/config';

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  limit: number;
}

export interface PlanNode { depth: number; nodeType: string; relation: string | null; totalCost: number | null; planRows: number | null; detail: string | null }
export interface ExplainResult { durationMs: number; nodes: PlanNode[]; raw: unknown }

export interface BrowseResult extends QueryResult {
  page: number;
  pageSize: number;
  hasMore: boolean;
  estimatedTotal: number | null;
  columnTypes: string[];
}

export interface HistoryEntry { id: number; sql: string; durationMs: number | null; rowCount: number | null; error: string | null; ranAt: string; username: string | null }
export interface SavedQuery { id: number; name: string; sql: string; updatedAt: string; username: string | null; canDelete: boolean }

export interface BrowseParams { schema?: string; table: string; page: number; pageSize: number; sort?: string; dir?: 'asc' | 'desc'; filterColumn?: string; filter?: string }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${appConfig.apiUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (response.status === 401) throw new Error('Your session has expired. Sign in again to keep working.');
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data as T;
}

const base = (projectId: number) => `/api/projects/${projectId}/sql`;

export const sqlApi = {
  run: (projectId: number, sql: string, limit: number, signal?: AbortSignal) =>
    request<QueryResult>(`${base(projectId)}/run`, { method: 'POST', body: JSON.stringify({ sql, limit }), signal }),
  explain: (projectId: number, sql: string, signal?: AbortSignal) =>
    request<ExplainResult>(`${base(projectId)}/run`, { method: 'POST', body: JSON.stringify({ sql, explain: true }), signal }),
  browse: (projectId: number, params: BrowseParams, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
    return request<BrowseResult>(`${base(projectId)}/browse?${query}`, { signal });
  },
  history: (projectId: number) => request<HistoryEntry[]>(`${base(projectId)}/history`),
  saved: (projectId: number) => request<SavedQuery[]>(`${base(projectId)}/saved`),
  save: (projectId: number, name: string, sql: string) =>
    request<{ id: number }>(`${base(projectId)}/saved`, { method: 'POST', body: JSON.stringify({ name, sql }) }),
  removeSaved: (projectId: number, id: number) => request<void>(`${base(projectId)}/saved/${id}`, { method: 'DELETE' }),
};

// Results as CSV (RFC 4180 quoting) for the copy/download actions.
export function toCsv(columns: string[], rows: unknown[][]): string {
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\n');
}

export function qualifiedName(table: { name: string; schema?: string }): string {
  return table.schema && table.schema !== 'public' ? `${table.schema}.${table.name}` : table.name;
}

const LARGE_SCAN_ROWS = 10_000;

// Plan nodes worth a second look, with what usually fixes them.
export function planWarnings(nodes: PlanNode[]): string[] {
  const warnings: string[] = [];
  for (const node of nodes) {
    if (node.nodeType === 'Seq Scan' && node.relation && node.detail && (node.planRows ?? 0) >= LARGE_SCAN_ROWS) {
      warnings.push(`Sequential scan of ${node.relation} filtering on ${node.detail} (about ${node.planRows!.toLocaleString()} rows). An index on the filtered columns usually avoids this.`);
    }
    if (node.nodeType === 'Nested Loop' && (node.planRows ?? 0) >= LARGE_SCAN_ROWS) {
      warnings.push(`Nested loop producing about ${node.planRows!.toLocaleString()} rows. Check that the join columns are indexed.`);
    }
    if (node.nodeType === 'Sort' && (node.planRows ?? 0) >= LARGE_SCAN_ROWS * 10) {
      warnings.push(`Sorting about ${node.planRows!.toLocaleString()} rows${node.detail ? ` by ${node.detail}` : ''}. An index matching the ORDER BY can remove the sort.`);
    }
  }
  return warnings;
}
