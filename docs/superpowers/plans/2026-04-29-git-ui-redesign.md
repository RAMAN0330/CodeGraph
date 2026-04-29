# Git UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign CodeFlow into a proper GitHub-like Git UI — clean GitHub dark theme on all pages, VS Code-style icon sidebar in the workspace exposing all features as first-class sections, and a fixed ER diagram table layout.

**Architecture:** Three independent changes: (1) Landing page visual overhaul with GitHub palette + replace "View Demo" with "DB Visualizer" CTA, (2) New `WorkspaceSidebar` component that drives `activeSection` state in `WorkspaceArea` to switch between Explorer/Branches/PR/Database/Migrations/Security/Settings panels, (3) ER diagram layout fix to arrange isolated tables in a multi-column grid instead of a single vertical column.

**Tech Stack:** React 18, TypeScript, React Router v6, ReactFlow, inline styles (GitHub color palette), existing components (BranchDiff, ERDiagramGraph, VirtualizedRepoTree)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `client/src/pages/LandingPage.tsx` | Full GitHub-style redesign |
| Create | `client/src/components/WorkspaceSidebar.tsx` | 48px icon nav sidebar |
| Modify | `client/src/pages/WorkspaceArea.tsx` | Add activeSection state, render sidebar, switch panels |
| Modify | `client/src/components/ERDiagramGraph.tsx` | Fix isolated table grid layout |
| Modify | `client/src/pages/RepoSelector.tsx` | Minor GitHub palette tweaks |

---

## Task 1: Redesign Landing Page

**Files:**
- Modify: `client/src/pages/LandingPage.tsx`

- [ ] **Step 1: Read the current LandingPage.tsx**

Read `client/src/pages/LandingPage.tsx` in full before making any changes.

- [ ] **Step 2: Replace the entire LandingPage with GitHub-style design**

Replace the full content of `client/src/pages/LandingPage.tsx` with:

```tsx
import { useNavigate } from 'react-router-dom';
import { Database, GitBranch, Shield, Zap, GitMerge, Eye } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export default function LandingPage() {
  const navigate = useNavigate();

  const handleAuth = () => {
    window.location.href = `${API}/auth/github`;
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0f6fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #30363d', padding: '0 48px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(8px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', background: '#238636', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>CodeFlow</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(['Features', 'Docs', 'Security'] as const).map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{ color: '#8b949e', fontSize: '0.875rem', textDecoration: 'none', padding: '6px 12px', borderRadius: '6px', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#f0f6fc')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8b949e')}>
              {item}
            </a>
          ))}
          <button onClick={handleAuth} style={{ background: '#238636', border: '1px solid #2ea043', color: 'white', padding: '7px 16px', borderRadius: '6px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            Sign in with GitHub
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: '960px', margin: '0 auto', padding: '96px 24px 80px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#161b22', border: '1px solid #30363d', borderRadius: '20px', padding: '5px 14px', fontSize: '0.8rem', color: '#8b949e', marginBottom: '32px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#238636', display: 'inline-block' }} />
          Open source · Built for developers
        </div>

        <h1 style={{ fontSize: 'clamp(2.5rem, 6vw, 4rem)', fontWeight: 800, lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-0.03em', color: '#f0f6fc' }}>
          A Git UI built for<br />
          <span style={{ color: '#58a6ff' }}>deep code intelligence</span>
        </h1>

        <p style={{ fontSize: '1.125rem', color: '#8b949e', maxWidth: '600px', margin: '0 auto 40px', lineHeight: 1.7 }}>
          Visualize repository architecture, explore database schemas, review branches, and scan for security issues — all in one place.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleAuth} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#238636', border: '1px solid #2ea043', color: 'white', padding: '12px 24px', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Sign in with GitHub
          </button>
          <button onClick={() => navigate('/db')} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: '1px solid #30363d', color: '#f0f6fc', padding: '12px 24px', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#58a6ff')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#30363d')}>
            <Database size={18} />
            Database Visualizer
          </button>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d', background: '#161b22' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', textAlign: 'center' }}>
          {[{ v: '1M+', l: 'Files handled' }, { v: '250ms', l: 'Analysis speed' }, { v: '10k+', l: 'Files at 60fps' }, { v: '12', l: 'Frameworks' }].map(s => (
            <div key={s.l}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f0f6fc', marginBottom: '4px' }}>{s.v}</div>
              <div style={{ fontSize: '0.8rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ maxWidth: '960px', margin: '0 auto', padding: '80px 24px' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '48px', textAlign: 'center', color: '#f0f6fc' }}>Everything you need to understand your codebase</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[
            { icon: <GitBranch size={20} />, title: 'Branch Diff & Merge', desc: 'Compare branches, stage files, and resolve conflicts with a visual diff editor.', color: '#58a6ff' },
            { icon: <Database size={20} />, title: 'DB Schema Visualizer', desc: 'Auto-detect Django, SQLAlchemy, and Prisma schemas into interactive ER diagrams.', color: '#3fb950' },
            { icon: <Shield size={20} />, title: 'Security Intelligence', desc: 'Scan for secrets, vulnerable patterns, and security regressions before they ship.', color: '#f0883e' },
            { icon: <Zap size={20} />, title: 'Ghost File System', desc: 'Virtualized tree renders 10,000+ files at 60fps with zero main-thread lag.', color: '#d2a8ff' },
            { icon: <GitMerge size={20} />, title: 'Migration Maker', desc: 'Generate Django migrations from detected schema changes using AST introspection.', color: '#ffa657' },
            { icon: <Eye size={20} />, title: 'Code Ownership', desc: 'Identify who owns what — blast radius, PR risk, and suggested reviewers.', color: '#79c0ff' },
          ].map(f => (
            <div key={f.title} style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: '10px', padding: '24px' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = f.color)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#30363d')}>
              <div style={{ color: f.color, marginBottom: '12px' }}>{f.icon}</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px', color: '#f0f6fc' }}>{f.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#8b949e', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security section */}
      <section id="security" style={{ background: '#161b22', borderTop: '1px solid #30363d', borderBottom: '1px solid #30363d' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '64px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '48px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Shield size={20} style={{ color: '#f0883e' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f0883e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Security</span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '16px', color: '#f0f6fc' }}>Built with security in mind</h2>
            <p style={{ color: '#8b949e', lineHeight: 1.7, margin: 0 }}>Your GitHub token stays server-side in an encrypted session. We never store credentials or repo contents — analysis runs in memory and is discarded when your session ends.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '240px' }}>
            {['OAuth 2.0 — token never exposed to browser', 'Server-side sessions with 24h expiry', 'No repo content stored on disk', 'Analysis runs in isolated worker'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', color: '#8b949e' }}>
                <span style={{ color: '#3fb950', flexShrink: 0 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: '640px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '16px', color: '#f0f6fc' }}>Ready to explore your codebase?</h2>
        <p style={{ color: '#8b949e', marginBottom: '32px' }}>Sign in with GitHub and start analyzing any repository in seconds.</p>
        <button onClick={handleAuth} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#238636', border: '1px solid #2ea043', color: 'white', padding: '12px 28px', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          Get started free
        </button>
      </section>

      {/* Footer */}
      <footer id="docs" style={{ borderTop: '1px solid #30363d', padding: '32px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '24px', height: '24px', background: '#238636', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="white"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>CodeFlow</span>
        </div>
        <span style={{ color: '#8b949e', fontSize: '0.8rem' }}>© 2026 CodeFlow · Built for developers</span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/LandingPage.tsx
git commit -m "feat: redesign landing page with GitHub dark theme and DB Visualizer CTA"
```

---

## Task 2: Create WorkspaceSidebar Component

**Files:**
- Create: `client/src/components/WorkspaceSidebar.tsx`

- [ ] **Step 1: Create the sidebar component**

Create `client/src/components/WorkspaceSidebar.tsx`:

```tsx
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

import React from 'react';

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
        const disabled = item.requiresData && !hasData;
        const active = activeSection === item.id;
        return (
          <div key={item.id} style={{ position: 'relative' }} className="sidebar-nav-item">
            <button
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
                  (e.currentTarget as HTMLButtonElement).style.color = '#f0f6fc';
                  (e.currentTarget as HTMLButtonElement).style.background = '#21262d';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLButtonElement).style.color = disabled ? '#484f58' : '#8b949e';
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
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
          </div>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/WorkspaceSidebar.tsx
git commit -m "feat: add WorkspaceSidebar with 7 VS Code-style nav sections"
```

---

## Task 3: Wire Sidebar into WorkspaceArea

**Files:**
- Modify: `client/src/pages/WorkspaceArea.tsx`

Read `client/src/pages/WorkspaceArea.tsx` before editing. The file uses `var` declarations for state and `React.createElement` throughout.

- [ ] **Step 1: Add import for WorkspaceSidebar**

At the top of `WorkspaceArea.tsx`, after the existing imports, add:

```typescript
import WorkspaceSidebar from '../components/WorkspaceSidebar';
```

- [ ] **Step 2: Add activeSection state**

In the state declarations block (after the existing `var _auth=...` line), add:

```typescript
var _sec=React.useState<any>('explorer'),activeSection=_sec[0],setActiveSection=_sec[1];
```

- [ ] **Step 3: Update the return JSX**

Find the return statement. It currently starts with:
```javascript
return React.createElement('div',{className:'app',style:{paddingTop:'56px'}},
    React.createElement(WorkspaceHeader,{...}),
    React.createElement('div',{className:'main',...},
```

Change `paddingLeft` on the main container and add the sidebar. Replace the outer div's style and add sidebar:

Change `{className:'app',style:{paddingTop:'56px'}}` to `{className:'app',style:{paddingTop:'56px',paddingLeft:'48px'}}`.

Then add the sidebar as the second child (after WorkspaceHeader, before the main div):

```javascript
React.createElement(WorkspaceSidebar,{
    activeSection:activeSection,
    onSectionChange:function(s: any){setActiveSection(s);},
    hasData:!!data,
}),
```

- [ ] **Step 4: Add section panels**

Find where the `React.createElement('div',{className:'main',...})` renders. Wrap it so that it only shows when `activeSection === 'explorer'`. For other sections, render their dedicated panels.

After the `WorkspaceSidebar` element and before the existing `main` div, add a conditional that renders the correct panel. Replace:

```javascript
React.createElement('div',{className:'main',style:{...}},
```

With:

```javascript
activeSection==='branches'&&repoInfo?React.createElement(BranchDiff,{
    owner:repoInfo.owner,
    repo:repoInfo.repo,
    branches:branches,
    currentBranch:currentBranch||'main',
    onClose:function(){setActiveSection('explorer');},
}):null,
activeSection==='pullrequests'?React.createElement('div',{style:{flex:1,padding:'32px',overflowY:'auto'}},
    React.createElement('div',{style:{maxWidth:'800px',margin:'0 auto'}},
        React.createElement('h2',{style:{color:'#f0f6fc',fontSize:'1.25rem',fontWeight:700,marginBottom:'24px'}},'Pull Request Review'),
        prData?React.createElement('div',null,'PR loaded'):
        React.createElement('div',{style:{background:'#161b22',border:'1px solid #30363d',borderRadius:'10px',padding:'48px',textAlign:'center',color:'#8b949e'}},
            React.createElement('div',{style:{fontSize:'0.95rem',marginBottom:'16px'}},'Enter a PR URL to review'),
            React.createElement('input',{
                placeholder:'https://github.com/owner/repo/pull/123',
                value:prUrl,
                onChange:function(e: any){setPrUrl(e.target.value);},
                style:{width:'100%',maxWidth:'480px',background:'#0d1117',border:'1px solid #30363d',borderRadius:'6px',padding:'10px 14px',color:'#f0f6fc',fontSize:'0.9rem',outline:'none',boxSizing:'border-box'},
                onKeyDown:function(e: any){if(e.key==='Enter')setShowPR(true);}
            })
        )
    )
):null,
activeSection==='database'?React.createElement('div',{style:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}},
    React.createElement('div',{style:{padding:'16px 20px',borderBottom:'1px solid #30363d',display:'flex',alignItems:'center',gap:'12px'}},
        React.createElement('h2',{style:{color:'#f0f6fc',fontSize:'1rem',fontWeight:700,margin:0}},'Database Schema'),
        dbSchemaDetected&&React.createElement('span',{style:{background:'#1a2b1a',border:'1px solid #238636',borderRadius:'20px',padding:'2px 10px',fontSize:'0.75rem',color:'#3fb950'}},'Schema detected'),
        React.createElement('input',{placeholder:'Search tables...',value:dbSearchQuery,onChange:function(e: any){setDbSearchQuery(e.target.value);},style:{marginLeft:'auto',background:'#0d1117',border:'1px solid #30363d',borderRadius:'6px',padding:'6px 12px',color:'#f0f6fc',fontSize:'0.85rem',outline:'none',width:'200px'}})
    ),
    filteredDbSchema?React.createElement(ERDiagramGraph,{schema:filteredDbSchema,selectedTable:selectedDbTable}):
    React.createElement('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'#8b949e',flexDirection:'column',gap:'12px'}},
        React.createElement('div',{style:{fontSize:'0.95rem'}},'No schema detected'),
        React.createElement('div',{style:{fontSize:'0.8rem'}},'Analyze a repository with Django, SQLAlchemy, or Prisma models')
    )
):null,
activeSection==='security'?React.createElement('div',{style:{flex:1,padding:'32px',overflowY:'auto'}},
    React.createElement('h2',{style:{color:'#f0f6fc',fontSize:'1.25rem',fontWeight:700,marginBottom:'24px'}},'Security Scan'),
    !data?React.createElement('div',{style:{background:'#161b22',border:'1px solid #30363d',borderRadius:'10px',padding:'48px',textAlign:'center',color:'#8b949e'}},'Analyze a repository to see security results'):
    React.createElement('div',{style:{color:'#8b949e',fontSize:'0.9rem'}},'Security analysis available in the right panel of the Explorer view.')
):null,
activeSection==='settings'?React.createElement('div',{style:{flex:1,padding:'32px',overflowY:'auto'}},
    React.createElement('h2',{style:{color:'#f0f6fc',fontSize:'1.25rem',fontWeight:700,marginBottom:'24px'}},'Settings'),
    React.createElement('div',{style:{maxWidth:'600px'}},
        React.createElement('div',{style:{background:'#161b22',border:'1px solid #30363d',borderRadius:'10px',padding:'24px',marginBottom:'16px'}},
            React.createElement('h3',{style:{color:'#f0f6fc',fontSize:'0.95rem',fontWeight:600,marginBottom:'16px'}},'Graph Configuration'),
            React.createElement('label',{style:{display:'flex',alignItems:'center',gap:'10px',color:'#8b949e',fontSize:'0.875rem',marginBottom:'12px'}},
                React.createElement('input',{type:'checkbox',checked:graphConfig.showLabels,onChange:function(e: any){setGraphConfig(Object.assign({},graphConfig,{showLabels:e.target.checked}));}}),
                'Show file labels'
            ),
            React.createElement('label',{style:{display:'flex',alignItems:'center',gap:'10px',color:'#8b949e',fontSize:'0.875rem'}},
                React.createElement('input',{type:'checkbox',checked:graphConfig.curvedLinks,onChange:function(e: any){setGraphConfig(Object.assign({},graphConfig,{curvedLinks:e.target.checked}));}}),
                'Curved links'
            )
        )
    )
):null,
activeSection==='migrations'?React.createElement('div',{style:{flex:1,padding:'32px',overflowY:'auto'}},
    React.createElement('h2',{style:{color:'#f0f6fc',fontSize:'1.25rem',fontWeight:700,marginBottom:'8px'}},'Migration Maker'),
    React.createElement('p',{style:{color:'#8b949e',fontSize:'0.875rem',marginBottom:'24px'}},'Generate Django migrations from detected schema changes.'),
    React.createElement('a',{href:'/db',style:{display:'inline-flex',alignItems:'center',gap:'8px',background:'#238636',border:'1px solid #2ea043',color:'white',padding:'10px 20px',borderRadius:'6px',fontSize:'0.875rem',fontWeight:600,textDecoration:'none'}},'Open Database Visualizer')
):null,
activeSection==='explorer'&&React.createElement('div',{className:'main',style:{'--sidebar-w':sidebarWidth+'px','--panel-w':rightPanelWidth+'px'}},
```

Note: You must close the `activeSection==='explorer'` block properly. Find the closing `)` of the `main` div createElement call and make sure it's inside the `activeSection==='explorer'&&` conditional.

- [ ] **Step 5: Remove the DB Map / PR Review buttons from WorkspaceHeader props since they're now in the sidebar**

The `onPRReview` and `onDbMap` props in WorkspaceHeader can stay — they now also switch sections. Update the WorkspaceHeader call to also set activeSection:

Find `onPRReview:function(){setShowPR(true);}` and change to:
```javascript
onPRReview:function(){setActiveSection('pullrequests');},
onDbMap:function(){setActiveSection('database');},
```

- [ ] **Step 6: Verify build**

```bash
cd client && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/WorkspaceArea.tsx
git commit -m "feat: wire VS Code sidebar into workspace — 7 sections as first-class panels"
```

---

## Task 4: Fix ER Diagram Table Layout

**Files:**
- Modify: `client/src/components/ERDiagramGraph.tsx`

The current `layoutTables` function stacks isolated tables (those with no FK relationships) in a single vertical column, making large schemas hard to read. Fix: arrange isolated tables in a multi-column grid (max 4 per row).

- [ ] **Step 1: Read the current layoutTables function**

Read `client/src/components/ERDiagramGraph.tsx` lines 64–148 before editing.

- [ ] **Step 2: Replace the layoutTables function**

Find the `function layoutTables(tables: SchemaTable[], compact: boolean)` function (lines 64–148). Replace the entire function with:

```typescript
function layoutTables(tables: SchemaTable[], compact: boolean) {
  const tableByName = new Map(tables.map(t => [t.name, t]));
  const undirected = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();
  const fkToVisible = new Map<string, Set<string>>();

  tables.forEach(t => {
    undirected.set(t.name, new Set());
    childrenByParent.set(t.name, new Set());
    fkToVisible.set(t.name, new Set());
  });

  tables.forEach(t => {
    t.foreignKeys.forEach(fk => {
      if (!tableByName.has(fk.referencedTable)) return;
      undirected.get(t.name)!.add(fk.referencedTable);
      undirected.get(fk.referencedTable)!.add(t.name);
      childrenByParent.get(fk.referencedTable)!.add(t.name);
      fkToVisible.get(t.name)!.add(fk.referencedTable);
    });
  });

  const COL_W = compact ? 320 : 380;
  const ROW_H = compact ? 160 : 400;
  const COMPONENT_GAP_Y = compact ? 120 : 200;
  const ISOLATED_COLS = 4; // isolated tables per row in grid
  const ISOLATED_COL_W = compact ? 260 : 320;
  const ISOLATED_ROW_H = compact ? 120 : 160;

  const positions = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  let yOffset = 0;

  // Separate connected components from isolated tables
  const connectedComponents: string[][] = [];
  const isolatedTables: string[] = [];

  tables.forEach(start => {
    if (visited.has(start.name)) return;
    const component: string[] = [];
    const stack = [start.name];
    visited.add(start.name);
    while (stack.length) {
      const name = stack.pop()!;
      component.push(name);
      (undirected.get(name) || new Set()).forEach(next => {
        if (!visited.has(next)) { visited.add(next); stack.push(next); }
      });
    }
    if (component.length === 1 && (undirected.get(component[0])?.size ?? 0) === 0) {
      isolatedTables.push(component[0]);
    } else {
      connectedComponents.push(component);
    }
  });

  // Layout connected components with hierarchical BFS
  connectedComponents.forEach(component => {
    const depth = new Map<string, number>();
    const roots = component.filter(name => (fkToVisible.get(name)?.size || 0) === 0);
    const queue = (roots.length ? roots : [component[0]]).map(name => {
      depth.set(name, 0);
      return name;
    });

    for (let qi = 0; qi < queue.length; qi++) {
      const current = queue[qi];
      const nextDepth = (depth.get(current) || 0) + 1;
      (childrenByParent.get(current) || new Set()).forEach(child => {
        if (!component.includes(child)) return;
        if (!depth.has(child) || nextDepth < depth.get(child)!) {
          depth.set(child, nextDepth);
          queue.push(child);
        }
      });
    }
    component.forEach(name => { if (!depth.has(name)) depth.set(name, 0); });

    const byDepth = new Map<number, string[]>();
    component.forEach(name => {
      const d = depth.get(name) || 0;
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(name);
    });

    let componentRows = 1;
    Array.from(byDepth.entries()).forEach(([d, names]) => {
      names.sort((a, b) => a.localeCompare(b));
      componentRows = Math.max(componentRows, names.length);
      const colYOffset = yOffset + (names.length === 1 ? (componentRows * ROW_H) / 2 - ROW_H / 2 : 0);
      names.forEach((name, row) => {
        positions.set(name, { x: d * COL_W, y: colYOffset + row * ROW_H });
      });
    });
    yOffset += componentRows * ROW_H + COMPONENT_GAP_Y;
  });

  // Layout isolated tables in a multi-column grid
  if (isolatedTables.length > 0) {
    isolatedTables.sort((a, b) => a.localeCompare(b));
    isolatedTables.forEach((name, i) => {
      const col = i % ISOLATED_COLS;
      const row = Math.floor(i / ISOLATED_COLS);
      positions.set(name, {
        x: col * ISOLATED_COL_W,
        y: yOffset + row * ISOLATED_ROW_H,
      });
    });
  }

  return positions;
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ERDiagramGraph.tsx
git commit -m "fix: arrange isolated DB tables in multi-column grid instead of single vertical stack"
```
