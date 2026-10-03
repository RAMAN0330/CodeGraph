export type WorkspaceModuleId =
  | 'overview'
  | 'explore'
  | 'insights'
  | 'architecture'
  | 'security'
  | 'patterns'
  | 'actions'
  | 'quality'
  | 'settings';

export interface WorkspaceTool {
  id: string;
  label: string;
  description: string;
  requiresData?: boolean;
}

export interface WorkspaceModule {
  id: WorkspaceModuleId;
  label: string;
  description: string;
  icon: 'overview' | 'explore' | 'insights' | 'architecture' | 'security' | 'patterns' | 'actions' | 'quality' | 'settings';
  defaultSection: string;
  tools: WorkspaceTool[];
}

export const WORKSPACE_MODULES: WorkspaceModule[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Repository at a glance',
    icon: 'overview',
    defaultSection: 'overview',
    tools: [{ id: 'overview', label: 'Summary', description: 'Health, risks, and next steps' }],
  },
  {
    id: 'explore',
    label: 'Explore',
    description: 'Understand the codebase',
    icon: 'explore',
    defaultSection: 'explorer',
    tools: [
      { id: 'explorer', label: 'Code graph', description: 'Files and dependencies' },
      { id: 'guide', label: 'Onboarding guide', description: 'Where to start reading', requiresData: true },
      { id: 'ask', label: 'Ask the codebase', description: 'Questions answered from the graph', requiresData: true },
      { id: 'notes', label: 'Team notes', description: 'Notes your team left on files', requiresData: true },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'History and ownership',
    icon: 'insights',
    defaultSection: 'commits',
    tools: [
      { id: 'branches', label: 'Code Diff', description: 'Compare development lines', requiresData: true },
      { id: 'commits', label: 'Commits', description: 'Repository activity', requiresData: true },
      { id: 'contributors', label: 'People', description: 'Contributor insights', requiresData: true },
      { id: 'ownership', label: 'Ownership', description: 'Who owns what', requiresData: true },
      { id: 'codeowners', label: 'Code owners', description: 'CODEOWNERS from commit history', requiresData: true },
      { id: 'releases', label: 'Releases', description: 'Generate release notes', requiresData: true },
      { id: 'pullrequests', label: 'PR review', description: 'Review change risk', requiresData: true },
    ],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'System architecture',
    icon: 'architecture',
    defaultSection: 'architecture',
    tools: [
      { id: 'architecture', label: 'System architecture', description: 'Modules, layers, and dependencies', requiresData: true },
      { id: 'endpoints', label: 'API endpoints', description: 'Routes, the code and tables they reach', requiresData: true },
      { id: 'cycles', label: 'Cycles', description: 'Dependency loops and how to break them', requiresData: true },
      { id: 'packages', label: 'Packages', description: 'Monorepo packages and their dependencies', requiresData: true },
      { id: 'rules', label: 'Rules', description: 'Team architecture rules', requiresData: true },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Code and dependency risks',
    icon: 'security',
    defaultSection: 'security',
    tools: [{ id: 'security', label: 'Security', description: 'Code and dependency risks', requiresData: true }],
  },
  {
    id: 'patterns',
    label: 'Patterns',
    description: 'Design patterns and anti-patterns',
    icon: 'patterns',
    defaultSection: 'patterns',
    tools: [{ id: 'patterns', label: 'Patterns', description: 'Design patterns and anti-patterns', requiresData: true }],
  },
  {
    id: 'actions',
    label: 'Actions',
    description: 'Prioritized suggestions',
    icon: 'actions',
    defaultSection: 'actions',
    tools: [{ id: 'actions', label: 'Actions', description: 'Prioritized suggestions', requiresData: true }],
  },
  {
    id: 'quality',
    label: 'Quality',
    description: 'Risk and maintainability',
    icon: 'quality',
    defaultSection: 'debt',
    tools: [
      { id: 'hotspots', label: 'Hotspots', description: 'Complex files that change often', requiresData: true },
      { id: 'coverage', label: 'Test coverage', description: 'Widely used, poorly tested code', requiresData: true },
      { id: 'cleanup', label: 'Cleanup plan', description: 'Unused code to remove, safest first', requiresData: true },
      { id: 'debt', label: 'Tech debt', description: 'Maintenance hotspots', requiresData: true },
      { id: 'radar', label: 'Stale code', description: 'Aging code radar', requiresData: true },
      { id: 'trends', label: 'Trends', description: 'Health over time', requiresData: true },
      { id: 'migrations', label: 'Migrations', description: 'Schema migrations', requiresData: true },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Workspace preferences',
    icon: 'settings',
    defaultSection: 'settings',
    tools: [{ id: 'settings', label: 'Preferences', description: 'Graph and workspace behavior' }],
  },
];

export function moduleForSection(section: string) {
  return WORKSPACE_MODULES.find(module => module.tools.some(tool => tool.id === section)) ?? WORKSPACE_MODULES[0];
}
