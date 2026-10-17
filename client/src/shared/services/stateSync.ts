import { appConfig } from '../../app/config';

// Mirrors `cg.*` workspace settings (open sections, drafts, layout) to the
// server so they follow the user to other browsers and devices. Values are
// UI preferences only: tokens and secrets never go through usePersistentState.
// Each key carries its write time; the server and hydrate() keep the newest.

export const PERSISTED_EVENT = 'cg-persisted';
const STAMPS_KEY = 'cg.__t';
const SYNCABLE = /^cg\.[\w.:/@-]{1,200}$/;
const DEBOUNCE_MS = 1000;

let pending: Record<string, { v: unknown; t: number }> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

function readStamps(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STAMPS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStamps(stamps: Record<string, number>) {
  try {
    localStorage.setItem(STAMPS_KEY, JSON.stringify(stamps));
  } catch {
    // storage unavailable: server copy still wins on next load
  }
}

function flush(keepalive = false) {
  if (timer) { clearTimeout(timer); timer = null; }
  const entries = pending;
  if (!Object.keys(entries).length) return;
  pending = {};
  fetch(`${appConfig.apiUrl}/api/me/state`, {
    method: 'PATCH',
    credentials: 'include',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  }).catch(() => {
    // offline: the local copy stays, and its stamp lets the next write win
  });
}

export function queueStateSync(key: string, value: unknown) {
  if (key === STAMPS_KEY || !SYNCABLE.test(key)) return;
  const t = Date.now();
  writeStamps({ ...readStamps(), [key]: t });
  pending[key] = { v: value ?? null, t };
  if (!timer) timer = setTimeout(flush, DEBOUNCE_MS);
}

// Pulls the user's saved settings and applies any newer than this browser's.
// Signed-out users get a 401 and keep their local values.
export async function hydrateStateFromServer() {
  let server: Record<string, { v: unknown; t: number }>;
  try {
    const response = await fetch(`${appConfig.apiUrl}/api/me/state`, { credentials: 'include' });
    if (!response.ok) return;
    server = await response.json();
  } catch {
    return;
  }
  const stamps = readStamps();
  let applied = false;
  for (const [key, entry] of Object.entries(server)) {
    if (!SYNCABLE.test(key) || key === STAMPS_KEY || (stamps[key] ?? 0) >= entry.t || pending[key]) continue;
    try {
      localStorage.setItem(key, JSON.stringify(entry.v));
      stamps[key] = entry.t;
      applied = true;
    } catch {
      // storage unavailable: nothing to restore into
    }
  }
  if (!applied) return;
  writeStamps(stamps);
  window.dispatchEvent(new CustomEvent(PERSISTED_EVENT));
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true));
}
