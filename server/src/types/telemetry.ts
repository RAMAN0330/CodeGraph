export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface DbIdentity {
  dbType: 'postgres' | 'mysql';
  version: string | null;
  host: string;
  database: string;
  uptimeSeconds: number | null;
}

export interface HealthMatrixRow {
  category: 'connections' | 'latency' | 'queries' | 'locks' | 'replication' | 'storage' | 'cache' | 'errors';
  status: HealthStatus;
  detail: string | null;
}

export interface ActivityEvent {
  at: string;
  kind: 'slow_query' | 'connection_opened' | 'connection_closed' | 'lock_detected' | 'schema_changed' | 'deadlock';
  summary: string;
  detail?: string;
}

export interface OverviewResponse {
  identity: DbIdentity;
  healthScore: number;
  healthStatus: HealthStatus;
  latencyMs: number | null;
  connections: { active: number; idle: number; waiting: number; total: number; max: number | null };
  opsPerSecond: number | null;
  databaseSizeBytes: number | null;
  activeIssues: number;
  criticalIssues: number;
  throughput: { atSeconds: number; reads: number | null; writes: number | null; total: number | null }[];
  healthMatrix: HealthMatrixRow[];
  recentActivity: ActivityEvent[];
  topQueries: TopQueryRow[] | { available: false; reason: string };
  storageGrowthBytes7d: number | null;
  largestObject: { name: string; sizeBytes: number } | null;
  activeAlerts: EvaluatedAlert[];
}

export interface LatencyPercentiles {
  p50: number | null;
  p95: number | null;
  p99: number | null;
  available: boolean;
  reason?: string;
}

export interface EngineIntelligenceMetric {
  label: string;
  value: string;
  status?: HealthStatus;
}

export interface PerformanceResponse {
  opsPerSecond: number | null;
  latency: LatencyPercentiles;
  connections: { active: number; idle: number; waiting: number; blocked: number };
  throughput: { atSeconds: number; reads: number | null; writes: number | null; transactions: number | null }[];
  engineIntelligence: EngineIntelligenceMetric[];
  activeAlerts: EvaluatedAlert[];
}

export interface TopQueryRow {
  fingerprint: string;
  query: string;
  calls: number;
  avgMs: number;
  p95Ms: number | null;
  totalMs: number;
  rows: number | null;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

export interface QueriesResponse {
  available: boolean;
  reason?: string;
  queries: TopQueryRow[];
}

export interface StorageTableRow {
  name: string;
  schema: string | null;
  rows: number | null;
  dataBytes: number;
  indexBytes: number;
  totalBytes: number;
}

export interface StorageResponse {
  databaseSizeBytes: number | null;
  growth7dBytes: number | null;
  growth7dPercent: number | null;
  indexesBytes: number | null;
  largestObject: { name: string; sizeBytes: number } | null;
  history: { atSeconds: number; sizeBytes: number }[];
  tables: StorageTableRow[];
}

export interface ReplicaRow {
  name: string;
  state: string;
  lagMs: number | null;
}

export interface ReplicationResponse {
  mode: 'standalone' | 'primary' | 'replica';
  replicas: ReplicaRow[];
  note?: string;
}

export interface ActivityResponse {
  events: ActivityEvent[];
}

export interface SecurityUserRow {
  name: string;
  role: string;
  privilege: string;
}

export interface SecurityFinding {
  severity: 'low' | 'medium' | 'high';
  summary: string;
}

export interface SecurityResponse {
  securityScore: number;
  totalUsers: number;
  privilegedAccounts: number;
  users: SecurityUserRow[];
  findings: SecurityFinding[];
}

export interface AlertRule {
  id: number;
  metric: string;
  condition: 'gt' | 'lt';
  threshold: number;
  forMinutes: number;
  enabled: boolean;
  createdAt: string;
}

export interface EvaluatedAlert {
  rule: AlertRule;
  currentValue: number;
  severity: 'warning' | 'high' | 'critical';
}
