import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';

const LandingPage = lazy(() => import('./features/landing/pages/LandingPage'));
const DatabaseVisualizer = lazy(() => import('./features/database/pages/DatabaseVisualizer'));
const WorkspaceArea = lazy(() => import('./features/workspace/pages/WorkspaceArea'));
const RepoSelector = lazy(() => import('./features/repository/pages/RepoSelector'));
const LoginPage = lazy(() => import('./features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('./features/auth/pages/RegisterPage'));
const WelcomePage = lazy(() => import('./features/auth/pages/WelcomePage'));
const WorkspacesPage = lazy(() => import('./features/organization/pages/WorkspacesPage'));
const ProjectsPage = lazy(() => import('./features/organization/pages/ProjectsPage'));

export function RouteFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-label="Loading workspace">
      <div className="route-loading-glow" aria-hidden="true" />
      <div className="route-loading-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M15 11v22a6 6 0 1 0 4 5.66V23l12 7v3a6 6 0 1 0 4-5.66L19 18v-7a6 6 0 1 0-4 0Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <strong>graphkeep</strong>
      <span>Loading workspace…</span>
      <div className="route-loading-progress" aria-hidden="true"><i /></div>
    </div>
  );
}

function App() {
  return (
    <div className="app-container">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/db" element={<DatabaseVisualizer />} />
          <Route path="/workspace" element={<WorkspaceArea />} />
          <Route path="/workspaces" element={<WorkspacesPage />} />
          <Route path="/workspaces/:workspaceId/projects" element={<ProjectsPage />} />
          <Route path="/select-repo" element={<RepoSelector />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
