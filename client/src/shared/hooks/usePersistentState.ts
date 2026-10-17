import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { queueStateSync, PERSISTED_EVENT } from '../services/stateSync';

// useState that survives reloads via localStorage and follows the signed-in
// user across devices (see stateSync). Storage can be missing or throw
// (private windows, blocked site data), so values also live in memory.
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readPersisted<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writePersisted(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  if (readRaw(key) === raw) return;
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    // storage unavailable: keep the in-memory value only
  }
  queueStateSync(key, value);
  window.dispatchEvent(new CustomEvent(PERSISTED_EVENT, { detail: key }));
}

function subscribe(onChange: () => void) {
  // Another tab (storage) or a server restore (PERSISTED_EVENT) changed a value.
  const onExternal = (event: Event) => {
    if (event instanceof StorageEvent && event.key) memory.delete(event.key);
    onChange();
  };
  window.addEventListener('storage', onExternal);
  window.addEventListener(PERSISTED_EVENT, onExternal);
  return () => {
    window.removeEventListener('storage', onExternal);
    window.removeEventListener(PERSISTED_EVENT, onExternal);
  };
}

export function usePersistentState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key));
  const value = useMemo(() => {
    if (raw === null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
    // initial is a default for a missing value; changes to it should not re-parse
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  // Defaults are never written, so an untouched setting cannot outrank the
  // value this user saved on another device.
  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    const current = readPersisted(key, initial);
    writePersisted(key, typeof next === 'function' ? (next as (prev: T) => T)(current) : next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, setValue];
}
