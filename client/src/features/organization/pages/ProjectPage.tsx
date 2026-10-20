import { lazy, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { decodeShareLink } from '../../export/services/exporters';
import { organizationStore, projectPath, type Project } from '../services/organizationStore';
import { parseRepositoryInput, savePendingRepository } from '../services/pendingRepository';

const DatabaseVisualizer = lazy(() => import('../../database/pages/DatabaseVisualizer'));
const WorkspaceArea = lazy(() => import('../../workspace/pages/WorkspaceArea'));

/** Every codebase and database workspace opens here, from the Projects page. */
export default function ProjectPage() {
  const { workspaceId, projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null | undefined>(undefined);

  useEffect(() => {
    organizationStore.load().then(state => {
      const found = state.projects.find(item => item.id === Number(projectId) && item.workspaceId === Number(workspaceId));
      if (found) setProject(found);
      else { setProject(null); navigate(workspaceId ? `/workspaces/${workspaceId}/projects` : '/workspaces', { replace: true }); }
    });
  }, [navigate, projectId, workspaceId]);

  if (!project) return null;
  if (project.projectType === 'database') return <DatabaseVisualizer key={project.id} projectId={project.id} />;

  // The analysis engine restores itself from ?repo= (and ?share=/?file=), so
  // the project's repository is written into the URL before it mounts.
  const params = new URLSearchParams(location.search);
  const repo = project.repositoryFullName ?? '';
  if (!params.has('share') && params.get('repo')?.toLowerCase() !== repo.toLowerCase()) {
    params.set('repo', repo);
    return <Navigate replace to={{ search: params.toString() }} />;
  }
  return <WorkspaceArea key={project.id} />;
}

/** Old /db?projectId= and /workspace?repo= links (alerts, digests, bookmarks) forward to their project. */
export function LegacyProjectRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const share = params.get('share');
    const repo = parseRepositoryInput(params.get('repo') ?? (share ? decodeShareLink(share)?.repoUrl ?? '' : ''));
    const projectId = Number(params.get('projectId'));
    organizationStore.load().then(state => {
      const project = projectId
        ? state.projects.find(item => item.id === projectId)
        : repo ? state.projects.find(item => item.repositoryFullName?.toLowerCase() === repo.toLowerCase()) : undefined;
      params.delete('projectId');
      if (project) { navigate({ pathname: projectPath(project), search: params.toString() }, { replace: true }); return; }
      // No project for this repository yet: offer to add it on the Projects page.
      if (repo) savePendingRepository(repo);
      navigate('/workspaces', { replace: true });
    });
  }, [location.search, navigate]);
  return null;
}
