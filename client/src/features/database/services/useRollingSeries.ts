import { useRef } from 'react';

/**
 * Accumulates successive polled values into a bounded in-memory window, so
 * charts can show a real trend from live polling without needing server-side
 * time-series storage for sub-minute resolution. Resets when `key` changes
 * (e.g. switching time range or project).
 */
export function useRollingSeries(value: number | null | undefined, key: string, maxPoints = 30): number[] {
  const ref = useRef<{ key: string; points: number[] }>({ key, points: [] });
  if (ref.current.key !== key) ref.current = { key, points: [] };
  if (value !== null && value !== undefined) {
    const last = ref.current.points[ref.current.points.length - 1];
    if (last !== value) {
      ref.current.points.push(value);
      if (ref.current.points.length > maxPoints) ref.current.points.shift();
    }
  }
  return ref.current.points;
}
