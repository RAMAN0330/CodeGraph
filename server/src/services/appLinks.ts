import { env } from '../config/env';

// Deep link into the workspace for a repository, used in PR comments and alerts.
export function workspaceUrlFor(owner: string, repo: string): string {
  return `${env.clientOrigin.replace(/\/$/, '')}/workspace?repo=${encodeURIComponent(`${owner}/${repo}`)}`;
}
