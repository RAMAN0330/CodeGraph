// Every dashboard viewer polls each telemetry page every few seconds, and each
// poll opens a fresh connection to the customer's database. Results are shared
// for FRESH_MS and identical in-flight builds are coalesced, so N viewers cost
// one database round trip, and the counter-rate baseline in rateCache isn't
// reset by viewers polling a few milliseconds apart.
const FRESH_MS = 4000;

const results = new Map<string, { at: number; value: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();

export function sharedPoll<T>(key: string, build: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = results.get(key);
  if (hit && now() - hit.at < FRESH_MS) return Promise.resolve(hit.value as T);
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const request = build()
    .then(value => { results.set(key, { at: now(), value }); return value; })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

// Called when a project's connection changes so the next poll hits the new database.
export function forgetSharedPolls(prefix: string): void {
  for (const key of results.keys()) if (key.startsWith(prefix)) results.delete(key);
}
