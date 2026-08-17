/**
 * Deadline for any single upstream request.
 *
 * Deliberately below the serverless function limit: without it, a source that
 * accepts the connection but never answers leaves the request hanging until the
 * platform kills the whole function, and the user sees a bare failure instead of
 * which source stalled.
 */
export const UPSTREAM_TIMEOUT_MS = 8000;

/** `dispatcher` is a valid undici option (Stooq's proxy) that the DOM type omits. */
type FetchInit = RequestInit & { dispatcher?: object };

/**
 * fetch that gives up rather than hanging, and names the source when it does.
 *
 * Note this sets `signal`, so it must not be used with a caller-supplied one —
 * no call site needs both today.
 */
export async function fetchWithTimeout(
  url: string,
  init: FetchInit = {},
  source = 'The data source'
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error(
        `${source} did not respond within ${UPSTREAM_TIMEOUT_MS / 1000}s. It may be down or rate limiting — try again.`
      );
    }
    throw error;
  }
}
