import { lazy, Suspense, useLayoutEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyTheme, initialTheme } from './shared/hooks/useTheme';
import './App.css';

const LandingPage = lazy(() => import('./features/landing/pages/LandingPage'));
const LoginPage = lazy(() => import('./features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('./features/auth/pages/RegisterPage'));
const WelcomePage = lazy(() => import('./features/auth/pages/WelcomePage'));
const WorkspacesPage = lazy(() => import('./features/organization/pages/WorkspacesPage'));
const ProjectsPage = lazy(() => import('./features/organization/pages/ProjectsPage'));
const ProjectPage = lazy(() => import('./features/organization/pages/ProjectPage'));
const LegacyProjectRedirect = lazy(() => import('./features/organization/pages/ProjectPage').then(module => ({ default: module.LegacyProjectRedirect })));

export function RouteFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite" aria-label="Loading workspace">
      <div className="route-loading-glow" aria-hidden="true" />
      <div className="route-loading-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M15 11v22a6 6 0 1 0 4 5.66V23l12 7v3a6 6 0 1 0 4-5.66L19 18v-7a6 6 0 1 0-4 0Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <strong>structrace</strong>
      <span>Loading workspace…</span>
      <div className="route-loading-progress" aria-hidden="true"><i /></div>
    </div>
  );
}

function App() {
  const { pathname } = useLocation();
  // The landing page carries its own theme; the app screens theme <html>.
  useLayoutEffect(() => applyTheme(pathname === '/' ? null : initialTheme()), [pathname]);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="app-container">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/db" element={<LegacyProjectRedirect />} />
            <Route path="/workspace" element={<LegacyProjectRedirect />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/workspaces/:workspaceId/projects" element={<ProjectsPage />} />
            <Route path="/workspaces/:workspaceId/projects/:projectId" element={<ProjectPage />} />
          </Routes>
        </Suspense>
      </div>
    </TooltipProvider>
  );
}

export default App;
