import { githubFetch } from '../../repository/services/github';

// The workspace passes 'main' when it doesn't know the branch, so a repository
// whose default branch is e.g. 'master' made every `sha=main` request 404.
// Resolve to a branch that exists: the requested one, else the default branch.
const resolved = new Map<string, Promise<string>>();

export function resolveBranch(owner: string, repo: string, branch: string | undefined, token?: string | null): Promise<string> {
  const key = `${owner}/${repo}#${branch ?? ''}`.toLowerCase();
  if (!resolved.has(key)) {
    const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const lookup = (async () => {
      if (branch && (await githubFetch(`${base}/branches/${encodeURIComponent(branch)}`, token)).ok) return branch;
      const res = await githubFetch(base, token);
      if (!res.ok) return branch ?? '';
      return (await res.json()).default_branch || branch || '';
    })();
    // A failed lookup is retried next time instead of being cached.
    resolved.set(key, lookup.catch(e => { resolved.delete(key); throw e; }));
  }
  return resolved.get(key)!;
}
