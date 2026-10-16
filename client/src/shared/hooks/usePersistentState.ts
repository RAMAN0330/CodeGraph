import { useEffect, useState } from 'react';

// useState that survives reloads via localStorage. Storage can be missing or
// throw (private windows, blocked site data), so it silently falls back to
// in-memory state.
export function readPersisted<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePersisted(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: keep the in-memory value only
  }
}

export function usePersistentState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readPersisted(key, initial));
  useEffect(() => writePersisted(key, value), [key, value]);
  return [value, setValue];
}
