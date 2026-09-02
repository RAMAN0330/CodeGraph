// client/src/lib/bookmarks.ts

export interface Bookmark {
  url: string;
  lastAnalyzed: string; // ISO string
  pinned: boolean;
  stats: { files: number; language: string; functions: number };
}

const KEY = 'cf_bookmarks';
const MAX = 20;

function load(): Record<string, Bookmark> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(data: Record<string, Bookmark>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function saveBookmark(
  repoKey: string,
  url: string,
  stats: Bookmark['stats']
) {
  const all = load();
  all[repoKey] = {
    url,
    lastAnalyzed: new Date().toISOString(),
    pinned: all[repoKey]?.pinned ?? false,
    stats,
  };
  // Evict oldest unpinned if over MAX
  const keys = Object.keys(all);
  if (keys.length > MAX) {
    const unpinned = keys
      .filter(k => !all[k].pinned)
      .sort((a, b) => all[a].lastAnalyzed.localeCompare(all[b].lastAnalyzed));
    if (unpinned.length > 0) delete all[unpinned[0]];
  }
  save(all);
}

export function getBookmarks(): Array<{ key: string } & Bookmark> {
  const all = load();
  return Object.entries(all)
    .map(([key, val]) => ({ key, ...val }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastAnalyzed.localeCompare(a.lastAnalyzed);
    });
}

export function togglePin(repoKey: string) {
  const all = load();
  if (all[repoKey]) all[repoKey].pinned = !all[repoKey].pinned;
  save(all);
}

export function removeBookmark(repoKey: string) {
  const all = load();
  delete all[repoKey];
  save(all);
}
