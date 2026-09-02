import { WORKSPACE_MODULES, moduleForSection } from '../config/workspaceModules';

interface Props {
  activeSection: string;
  hasData: boolean;
  onSectionChange: (section: string) => void;
}

const ICONS = {
  overview: 'M4 4h6v6H4zM14 4h6v10h-6zM4 14h6v6H4zM14 18h6v2h-6z',
  explore: 'M3 5h7l2 2h9v12H3z M8 12h8 M12 8v8',
  insights: 'M4 19V9m6 10V5m6 14v-7m4 7V3',
  quality: 'M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z M8.5 12l2.2 2.2 4.8-5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z',
};

export default function WorkspaceModuleNav({ activeSection, hasData, onSectionChange }: Props) {
  const activeModule = moduleForSection(activeSection);

  return (
    <aside className="workspace-module-nav" aria-label="Workspace modules">
      <div className="workspace-module-list">
        {WORKSPACE_MODULES.map(module => {
          const active = module.id === activeModule.id;
          return (
            <div className={`workspace-module-group${active ? ' active' : ''}`} key={module.id}>
              <button
                className="workspace-module-button"
                onClick={() => onSectionChange(module.defaultSection)}
                aria-expanded={active}
              >
                <span className="workspace-module-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ICONS[module.icon]} />
                  </svg>
                </span>
                <span className="workspace-module-copy">
                  <strong>{module.label}</strong>
                  <small>{module.description}</small>
                </span>
                <span className="workspace-module-chevron">{active ? '−' : '+'}</span>
              </button>

              {active && module.tools.length > 0 && (
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
