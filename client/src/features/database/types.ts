// Shared schema shapes (previously duplicated separately in DatabaseVisualizer.tsx,
// ERDiagramGraph.tsx, and dbParser.ts).
export interface SchemaColumn { name: string; type: string; nullable: boolean; isPrimary: boolean; }
export interface SchemaFK { column: string; referencedTable: string; referencedColumn: string; }
export interface SchemaIndex { name: string; columns: string[]; unique: boolean; }
export interface SchemaTable {
  name: string; columns: SchemaColumn[]; foreignKeys: SchemaFK[];
  app?: string; file?: string; modelName?: string; dbTableName?: string; line?: number;
  schema?: string; rowEstimate?: number | null; sizeBytes?: number | null; indexes?: SchemaIndex[];
}
export interface Schema { tables: SchemaTable[]; }

// Telemetry response shapes, mirrored from server/src/types/telemetry.ts.
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

export const DB_NAV_IDS = ['overview', 'sql', 'data', 'schema', 'performance', 'queries', 'storage', 'replication', 'activity', 'security', 'alerts'] as const;
export type DbNavId = typeof DB_NAV_IDS[number];

// One entry per dashboard page: the sidebar, header and page title all read
// from here so a page is named the same everywhere.
export const DB_PAGES: Record<DbNavId, { label: string; description: string }> = {
  overview: { label: 'Overview', description: 'Health, load and storage for this connection at a glance.' },
  sql: { label: 'SQL editor', description: 'Run read-only queries, inspect plans and keep the ones you reuse.' },
  data: { label: 'Data', description: 'Browse table rows with sorting and filtering, without writing SQL.' },
  schema: { label: 'Schema', description: 'Tables, relationships and indexes, from domains down to columns.' },
  performance: { label: 'Performance', description: 'Live throughput, latency percentiles and connection pool state.' },
  queries: { label: 'Query stats', description: 'The statements costing this database the most time.' },
  storage: { label: 'Storage', description: 'Database size, growth and the largest tables.' },
  replication: { label: 'Replication', description: 'Replica state and lag for this instance.' },
  activity: { label: 'Activity', description: 'Events detected while the dashboard is polling.' },
  security: { label: 'Security', description: 'Database roles, privileges and findings to review.' },
  alerts: { label: 'Alerts', description: 'Threshold rules and the alerts they are raising now.' },
};

export const DB_NAV_GROUPS: { label: string; ids: DbNavId[] }[] = [
  { label: 'Workspace', ids: ['overview', 'sql', 'data', 'schema'] },
  { label: 'Monitoring', ids: ['performance', 'queries', 'storage', 'replication', 'activity'] },
  { label: 'Governance', ids: ['security', 'alerts'] },
];
