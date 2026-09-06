import {
  LayoutDashboard, Compass, BarChart3, ShieldCheck, LayoutGrid,
  ListChecks, BadgeCheck, Settings, Plus, Minus, Network,
} from 'lucide-react';
import { WORKSPACE_MODULES, moduleForSection } from '../config/workspaceModules';

interface Props {
  activeSection: string;
  hasData: boolean;
  onSectionChange: (section: string) => void;
}

const ICONS = {
  overview: LayoutDashboard,
  explore: Compass,
  insights: BarChart3,
  architecture: Network,
  security: ShieldCheck,
  patterns: LayoutGrid,
  actions: ListChecks,
  quality: BadgeCheck,
  settings: Settings,
};

export default function WorkspaceModuleNav({ activeSection, hasData, onSectionChange }: Props) {
  const activeModule = moduleForSection(activeSection);

  return (
    <aside className="workspace-module-nav" aria-label="Workspace modules">
      <div className="workspace-module-list">
        {WORKSPACE_MODULES.map(module => {
          const active = module.id === activeModule.id;
          const ModuleIcon = ICONS[module.icon];
          return (
            <div className={`workspace-module-group${active ? ' active' : ''}`} key={module.id}>
              <button
                className="workspace-module-button"
                onClick={() => onSectionChange(module.defaultSection)}
                aria-expanded={active}
              >
                <span className="workspace-module-icon icon icon-l">
                  <ModuleIcon size={16} strokeWidth={1.8} />
                </span>
                <span className="workspace-module-copy">
                  <strong>{module.label}</strong>
                  <small>{module.description}</small>
                </span>
                <span className="workspace-module-chevron icon icon-s">
                  {active ? <Minus size={12} strokeWidth={2} /> : <Plus size={12} strokeWidth={2} />}
                </span>
              </button>

              {active && module.tools.length > 1 && (
                <div className="workspace-tool-list">
                  {module.tools.map(tool => {
                    const disabled = !!tool.requiresData && !hasData;
                    return (
                      <button
                        key={tool.id}
                        className={`workspace-tool-button${activeSection === tool.id ? ' active' : ''}`}
                        disabled={disabled}
                        onClick={() => !disabled && onSectionChange(tool.id)}
                      >
                        <span>{tool.label}</span>
                        <small>{disabled ? 'Analyze a repository first' : tool.description}</small>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="workspace-nav-hint">
        <kbd>⌘</kbd><kbd>K</kbd>
        <span>Search code</span>
      </div>
    </aside>
  );
}
