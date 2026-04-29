import React from 'react';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  hasData: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  requiresData?: boolean;
}

function FolderIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
}
function BranchIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>;
}
function PRIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>;
}
function DatabaseIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
}
function MigrationIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>;
}
function ShieldIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function SettingsIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'explorer', label: 'Explorer', icon: <FolderIcon /> },
  { id: 'branches', label: 'Branches', icon: <BranchIcon />, requiresData: true },
  { id: 'pullrequests', label: 'Pull Requests', icon: <PRIcon />, requiresData: true },
  { id: 'database', label: 'Database', icon: <DatabaseIcon />, requiresData: true },
  { id: 'migrations', label: 'Migrations', icon: <MigrationIcon />, requiresData: true },
  { id: 'security', label: 'Security', icon: <ShieldIcon />, requiresData: true },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
];

export default function WorkspaceSidebar({ activeSection, onSectionChange, hasData }: SidebarProps) {
  return (
    <aside style={{
      position: 'fixed',
      top: '56px',
      left: 0,
      bottom: 0,
      width: '48px',
      background: '#161b22',
      borderRight: '1px solid #30363d',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: '8px',
      zIndex: 900,
      gap: '2px',
    }}>
      {NAV_ITEMS.map(item => {
        const disabled = !!(item.requiresData && !hasData);
        const active = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => !disabled && onSectionChange(item.id)}
            title={item.label}
            style={{
              width: '40px',
              height: '40px',
              background: active ? '#21262d' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: active ? '#f0f6fc' : disabled ? '#484f58' : '#8b949e',
              transition: 'color 0.15s, background 0.15s',
              position: 'relative',
            }}
            onMouseEnter={e => {
              if (!disabled && !active) {
                (e.currentTarget).style.color = '#f0f6fc';
                (e.currentTarget).style.background = '#21262d';
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                (e.currentTarget).style.color = disabled ? '#484f58' : '#8b949e';
                (e.currentTarget).style.background = 'transparent';
              }
            }}
          >
            {active && (
              <div style={{
                position: 'absolute',
                left: '-4px',
                top: '8px',
                bottom: '8px',
                width: '3px',
                background: '#238636',
                borderRadius: '0 3px 3px 0',
              }} />
            )}
            {item.icon}
          </button>
        );
      })}
    </aside>
  );
}
