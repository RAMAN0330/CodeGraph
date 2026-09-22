// Bounded ownership-risk summary for the Overview page. Reuses the same
// top-8-folder sampling CodeOwnershipMap.tsx uses (so this never costs more
// than 8 GitHub API calls regardless of repo size) but requests 30 commits
// per folder instead of 1, so it can tell a single-author folder from a
// multi-author one rather than only naming the most recent committer.
//
// One extra call fetches repo-wide contributors, which is what makes a bus
// factor computable. Nine requests total, all served through GitHub.request so
// they inherit its 5-minute cache, 429 backoff and rate-limit accounting.

import { GitHub } from '../../repository/services/github';

export interface FolderAuthor {
  name: string;
  commits: number;
}

export interface FolderOwnership {
  folder: string;
  fileCount: number;
  authors: FolderAuthor[];
  sampledCommits: number;
}

export interface Contributor {
  name: string;
  commits: number;
  share: number;
}

export interface OwnershipRiskSummary {
  sampledFolders: number;
  ownedFolders: number;
  unownedFolders: number;
  singleOwnerFolders: number;
  folders: FolderOwnership[];
  contributors: Contributor[];
  busFactor: number | null;
}

interface FileLike {
  path?: string;
  name?: string;
}

const SAMPLED_FOLDERS = 8;
const COMMITS_PER_FOLDER = 30;

// The smallest group of people responsible for at least half the commits. If
// that group is one or two people, their leaving takes most of the working
// knowledge with them.
function computeBusFactor(contributors: Contributor[]): number | null {
  if (!contributors.length) return null;
  const total = contributors.reduce((sum, person) => sum + person.commits, 0);
  if (total <= 0) return null;
  let running = 0;
  for (let index = 0; index < contributors.length; index += 1) {
    running += contributors[index].commits;
    if (running / total >= 0.5) return index + 1;
  }
  return contributors.length;
}

async function fetchContributors(owner: string, repo: string): Promise<Contributor[]> {
  try {
    const raw = await GitHub.request(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=20`);
    if (!Array.isArray(raw)) return [];
    const people = raw
      .map((entry: any) => ({ name: entry?.login || entry?.name || 'unknown', commits: Number(entry?.contributions) || 0 }))
      .filter(person => person.commits > 0)
      .sort((a, b) => b.commits - a.commits);
    const total = people.reduce((sum, person) => sum + person.commits, 0);
    return people.map(person => ({ ...person, share: total ? person.commits / total : 0 }));
  } catch {
    return [];
  }
}

async function fetchFolderOwnership(owner: string, repo: string, folder: string, fileCount: number): Promise<FolderOwnership | null> {
  const pathQuery = folder === '(root)' ? '' : `&path=${encodeURIComponent(folder)}`;
  try {
    const commits = await GitHub.request(
      `https://api.github.com/repos/${owner}/${repo}/commits?per_page=${COMMITS_PER_FOLDER}${pathQuery}`,
    );
    if (!Array.isArray(commits) || commits.length === 0) return null;

    const tally = new Map<string, number>();
    for (const commit of commits) {
      const name = commit?.author?.login || commit?.commit?.author?.name;
      if (!name) continue;
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    if (tally.size === 0) return null;

    return {
      folder,
      fileCount,
      sampledCommits: commits.length,
      authors: Array.from(tally, ([name, count]) => ({ name, commits: count })).sort((a, b) => b.commits - a.commits),
    };
  } catch {
    // A folder that fails to sample stays uncounted rather than being guessed at.
    return null;
  }
}

export async function computeOwnershipRisk(
  owner: string,
  repo: string,
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
    .slice(0, SAMPLED_FOLDERS);

  const [sampled, contributors] = await Promise.all([
    Promise.all(topFolders.map(([folder, count]) => fetchFolderOwnership(owner, repo, folder, count))),
    fetchContributors(owner, repo),
  ]);

  const folders = sampled.filter((entry): entry is FolderOwnership => entry !== null);

  return {
    sampledFolders: topFolders.length,
    ownedFolders: folders.length,
    unownedFolders: topFolders.length - folders.length,
    singleOwnerFolders: folders.filter(entry => entry.authors.length === 1).length,
    folders,
    contributors,
    busFactor: computeBusFactor(contributors),
  };
}
