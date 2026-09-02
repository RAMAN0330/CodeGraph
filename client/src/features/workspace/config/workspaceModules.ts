export type WorkspaceModuleId = 'overview' | 'explore' | 'insights' | 'quality' | 'settings';

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
  icon: 'overview' | 'explore' | 'insights' | 'quality' | 'settings';
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
      { id: 'architecture', label: 'Architecture', description: 'System structure', requiresData: true },
      { id: 'database', label: 'Database', description: 'Models and relationships', requiresData: true },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    description: 'History and ownership',
    icon: 'insights',
    defaultSection: 'branches',
    tools: [
      { id: 'branches', label: 'Branches', description: 'Compare development lines', requiresData: true },
      { id: 'commits', label: 'Commits', description: 'Repository activity', requiresData: true },
      { id: 'contributors', label: 'People', description: 'Contributor insights', requiresData: true },
      { id: 'ownership', label: 'Ownership', description: 'Who owns what', requiresData: true },
      { id: 'releases', label: 'Releases', description: 'Generate release notes', requiresData: true },
      { id: 'pullrequests', label: 'PR review', description: 'Review change risk', requiresData: true },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    description: 'Risk and maintainability',
    icon: 'quality',
    defaultSection: 'security',
    tools: [
      { id: 'security', label: 'Security', description: 'Code and dependency risks', requiresData: true },
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
