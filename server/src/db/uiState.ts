import { pool } from './pool';

// Workspace UI state synced from the browser: a map of key -> { v, t } where
// t is the client's write time. Each key merges last-writer-wins, so two tabs
// or devices editing different keys never overwrite each other.

export type UiState = Record<string, { v: unknown; t: number }>;

const KEY_PATTERN = /^cg\.[\w.:/@-]{1,200}$/;
const MAX_KEYS = 300;
const MAX_BYTES = 256 * 1024;

export class UiStateError extends Error {}

// Applies `patch` to `current`. A null value deletes the key. Entries older
// than what is stored are ignored. Throws on malformed input or when the
// merged state would exceed the limits.
export function mergeUiState(current: UiState, patch: unknown): { state: UiState; changed: boolean } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new UiStateError('Expected an object of entries.');
  const state: UiState = { ...current };
  let changed = false;
  for (const [key, entry] of Object.entries(patch as Record<string, unknown>)) {
    if (!KEY_PATTERN.test(key)) throw new UiStateError(`Invalid state key: ${key.slice(0, 60)}`);
    const { v, t } = (entry ?? {}) as { v?: unknown; t?: unknown };
    if (typeof t !== 'number' || !Number.isFinite(t)) throw new UiStateError(`Entry ${key} needs a numeric timestamp.`);
    if (state[key] && state[key].t >= t) continue;
    if (v === null || v === undefined) { if (key in state) { delete state[key]; changed = true; } continue; }
    state[key] = { v, t };
    changed = true;
  }
  if (Object.keys(state).length > MAX_KEYS) throw new UiStateError('Too many saved workspace settings.');
  if (Buffer.byteLength(JSON.stringify(state)) > MAX_BYTES) throw new UiStateError('Saved workspace state is too large.');
  return { state, changed };
}

export async function getUiState(userId: number): Promise<UiState> {
  const result = await pool.query('SELECT state FROM user_ui_state WHERE user_id = $1', [userId]);
  return (result.rows[0]?.state as UiState) ?? {};
}

export async function patchUiState(userId: number, patch: unknown): Promise<UiState> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO user_ui_state (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const row = await client.query('SELECT state FROM user_ui_state WHERE user_id = $1 FOR UPDATE', [userId]);
    const { state, changed } = mergeUiState((row.rows[0]?.state as UiState) ?? {}, patch);
    if (changed) await client.query('UPDATE user_ui_state SET state = $1, updated_at = now() WHERE user_id = $2', [JSON.stringify(state), userId]);
    await client.query('COMMIT');
    return state;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
