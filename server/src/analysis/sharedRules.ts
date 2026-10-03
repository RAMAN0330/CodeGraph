// @ts-nocheck
// Re-exports the client's pure rule modules so the server applies them
// exactly like the workspace does: PR impact scoring (prImpact.ts) for PR
// reviews, health/snapshot/regression rules (analysisHealth.ts) for analysis
// history and alerts, team architecture rules (architectureRules.ts), and
// the schema parser plus table-to-code linking (dbParser.ts, tableUsage.ts),
// HTTP endpoint extraction (endpoints.ts), and package manifests (packages.ts). The cross-boundary .ts imports follow the same
// rules as parser.ts's analysisRules.ts import (see that file's header), which
// is also why this one file skips type checking. The annotations below restore
// types for everything that uses it.
import * as shared from '../../../client/src/features/analysis/services/prImpact.ts';
import * as health from '../../../client/src/features/analysis/services/analysisHealth.ts';
import * as archRules from '../../../client/src/features/analysis/services/architectureRules.ts';
import * as dbParser from '../../../client/src/features/database/services/dbParser.ts';
import * as tableUsage from '../../../client/src/features/database/services/tableUsage.ts';
import * as endpoints from '../../../client/src/features/analysis/services/endpoints.ts';
import * as packages from '../../../client/src/features/analysis/services/packages.ts';

export interface PrFile { filename: string; status?: string; additions?: number; deletions?: number }
export interface PrLike { files?: PrFile[]; additions?: number; deletions?: number }
export interface AnalysisLike { files: any[]; connections: any[] }
export interface PrRisk {
  score: number; level: 'low' | 'medium' | 'high' | 'critical'; factors: string[];
  totalBlast?: number; hotspots?: Array<{ file: string; blast: number }>;
}

export const calcBlast: (fileId: string, conns: any[], files: any[]) => { count: number; level: string } = shared.calcBlast;
export const calcPRRisk: (pr: PrLike, data: AnalysisLike) => PrRisk = shared.calcPRRisk;
export const findTestImpact: (pr: PrLike, data: AnalysisLike) => Array<{ file: string; path: string; suggested?: boolean }> = shared.findTestImpact;
export const findDependencyChains: (pr: PrLike, data: AnalysisLike) => string[][] = shared.findDependencyChains;

export interface AnalysisSnapshot {
  commitSha?: string; timestamp: string; healthScore: number; healthGrade: string; circular: number;
  stats: { files: number; functions: number; connections: number; loc: number; security: number; dead: number; violations: number; duplicates: number; patterns: number; ruleViolations?: number };
}
export interface Regression { kind: 'health' | 'circular' | 'security' | 'violations' | 'rules'; message: string; previous: number; current: number }

export const snapshotOf: (data: unknown, timestamp: string, commitSha?: string) => AnalysisSnapshot = health.snapshotOf;
export const detectRegressions: (previous: AnalysisSnapshot | null, current: AnalysisSnapshot) => Regression[] = health.detectRegressions;

export type RuleSeverity = 'error' | 'warning';
export type ArchitectureRule =
  | { kind: 'forbidden'; name: string; severity: RuleSeverity; from: string[]; disallow: string[] }
  | { kind: 'only'; name: string; severity: RuleSeverity; to: string[]; allowOnlyFrom: string[] };
export interface RuleViolation { rule: string; severity: RuleSeverity; from: string; to: string }

export const RULES_FILE: string = archRules.RULES_FILE;
export const parseRulesFile: (text: string) => { rules: ArchitectureRule[]; errors: string[] } = archRules.parseRulesFile;
export const evaluateRules: (rules: ArchitectureRule[], connections: any[]) => RuleViolation[] = archRules.evaluateRules;

export interface TableRef { name: string; file: string; line?: number; modelName?: string; dbTableName?: string }
export type TableUseKind = 'sql' | 'model' | 'migration';
export interface TableUse { file: string; count: number; kinds: TableUseKind[] }

export const parseDbSchema: (files: Array<{ path: string; content: string | null }>) => { tables: TableRef[] } = dbParser.parseDbSchema;
export const linkTablesToCode: (tables: TableRef[], files: Array<{ path: string; content: string | null }>) => Record<string, TableUse[]> = tableUsage.linkTablesToCode;

export interface Endpoint { method: string; path: string; file: string; line: number; handler: string | null; framework: string }
export interface EndpointWithReach extends Endpoint { calls: string[]; reach: string[]; reachCount: number; tables: string[] }

export const extractEndpoints: (files: Array<{ path: string; content: string | null }>) => Endpoint[] = endpoints.extractEndpoints;
export const resolveEndpointReach: (list: Endpoint[], data: { files: Array<{ path: string; content?: string | null }>; connections: any[]; fnStats: Record<string, any>; tableUsage?: Record<string, TableUse[]> }) => EndpointWithReach[] = endpoints.resolveEndpointReach;

export interface PackageInfo { root: string; manifest: string; ecosystem: string; name: string | null; declares: string[] }
export const manifestEcosystem: (path: string) => string | null = packages.manifestEcosystem;
export const parseManifest: (path: string, text: string) => PackageInfo | null = packages.parseManifest;
