// Bounded ownership-risk summary for the Overview page. Reuses the same
// top-8-folder sampling CodeOwnershipMap.tsx uses (so this never costs more
// than 8 GitHub API calls regardless of repo size) but requests 30 commits
// per folder instead of 1, so it can tell a single-author folder from a
// multi-author one rather than only naming the most recent committer.

export interface OwnershipRiskSummary {
  sampledFolders: number;
  ownedFolders: number;
  unownedFolders: number;
  singleOwnerFolders: number;
}

interface FileLike {
  path?: string;
  name?: string;
}

export async function computeOwnershipRisk(
  owner: string,
  repo: string,
  token: string,
  files: FileLike[],
): Promise<OwnershipRiskSummary | null> {
  if (!files.length) return null;

  const folderCount: Record<string, number> = {};
  for (const file of files) {
    const filePath = file.path || file.name || '';
    const parts = filePath.split('/');
    const topFolder = parts.length > 1 ? parts[0] : '(root)';
    folderCount[topFolder] = (folderCount[topFolder] || 0) + 1;
  }

  const topFolders = Object.entries(folderCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([folder]) => folder);

  let ownedFolders = 0;
  let singleOwnerFolders = 0;

  await Promise.all(topFolders.map(async folder => {
    try {
      const pathQuery = folder === '(root)' ? '' : `&path=${encodeURIComponent(folder)}`;
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=30${pathQuery}`,
        { headers: { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' } },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;
      const authors = new Set(
        data.map((c: any) => c.author?.login || c.commit?.author?.name).filter(Boolean),
      );
      if (authors.size === 0) return;
      ownedFolders++;
      if (authors.size === 1) singleOwnerFolders++;
    } catch {
      // skip this folder, keep it counted as unowned/unsampled
    }
  }));

  return {
    sampledFolders: topFolders.length,
    ownedFolders,
    unownedFolders: topFolders.length - ownedFolders,
    singleOwnerFolders,
  };
}
