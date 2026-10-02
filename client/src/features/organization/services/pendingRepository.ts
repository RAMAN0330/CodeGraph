// Carries a repository the visitor typed on the landing page through sign-in,
// workspace selection and project creation, so their first project starts
// pre-filled instead of from a blank form. Session-scoped on purpose: it is a
// short-lived intent, not a preference.

const KEY = 'structrace:pendingRepository';
// GitHub owners are letters, digits and hyphens; repository names also allow . and _.
const ownerSegment = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const repoSegment = /^[A-Za-z0-9_.-]{1,100}$/;

/** Accepts `owner/repo`, `github.com/owner/repo` or a full GitHub URL. */
export function parseRepositoryInput(value: string): string | null {
  const cleaned = value.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const [owner, repo, ...rest] = cleaned.split('/');
  if (rest.length || !owner || !repo || !ownerSegment.test(owner) || !repoSegment.test(repo)) return null;
  if (repo === '.' || repo === '..') return null;
  return `${owner}/${repo}`;
}

export function savePendingRepository(fullName: string): void {
  try { window.sessionStorage.setItem(KEY, fullName); } catch { /* storage unavailable: intent is simply dropped */ }
}

export function peekPendingRepository(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value && parseRepositoryInput(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingRepository(): void {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
