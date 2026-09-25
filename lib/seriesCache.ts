/**
 * Recently downloaded price histories, kept in the server's memory so reloading a
 * view — or adding one more ticker to it — doesn't download everything again.
 *
 * This lives only as long as a warm server instance does, so it's the second layer:
 * the route's Cache-Control lets Vercel's edge serve a repeat of the exact same
 * request without running the function at all. This one covers the overlap between
 * *different* requests (KGH.WA alone, then KGH.WA + IWDA.L).
 *
 * Each loader decides how long its result stays fresh — a fallback result is kept
 * briefly so the primary source gets retried soon. Failures are never kept.
 */

/** Long histories are ~1 MB each in memory; this caps the worst case well below the function's limit. */
const MAX_ENTRIES = 30;

interface Entry {
  /** Infinity while loading, so concurrent callers share one download. */
  expires: number;
  value: Promise<unknown>;
}

const entries = new Map<string, Entry>();

export function cached<T>(
  key: string,
  load: () => Promise<{ value: T; ttlMs: number }>
): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() < hit.expires) {
    // Re-insert so the Map's order doubles as least-recently-used.
    entries.delete(key);
    entries.set(key, hit);
    return hit.value as Promise<T>;
  }

  const entry: Entry = { expires: Infinity, value: Promise.resolve() };
  entry.value = load().then(
    ({ value, ttlMs }) => {
      entry.expires = Date.now() + ttlMs;
      return value;
    },
    (error) => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    }
  );
  entries.set(key, entry);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  return entry.value as Promise<T>;
}
