import { randomBytes } from 'crypto';

/**
 * A Stooq browsing session: a cookie jar plus whether the human CAPTCHA has been
 * solved. Kept server-side because the CAPTCHA image, the answer submission, and
 * the eventual download all share the same session cookies (PHPSESSID / auth).
 *
 * This is an in-memory store — appropriate for a single-user local tool. Sessions
 * expire after TTL and are pruned lazily. A dev-server hot reload clears them,
 * which just means the user solves the CAPTCHA again.
 */
export interface StooqSession {
  token: string;
  cookies: Record<string, string>;
  unlocked: boolean;
  createdAt: number;
}

// Pin the store to globalThis so it is shared across route modules and survives
// Next.js dev hot-reloads (module-level state alone is not reliably shared
// between separate route handlers in the same process).
const globalForSessions = globalThis as unknown as {
  __stooqSessions?: Map<string, StooqSession>;
};
const SESSIONS: Map<string, StooqSession> =
  globalForSessions.__stooqSessions ?? new Map<string, StooqSession>();
globalForSessions.__stooqSessions = SESSIONS;

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 100; // safety cap so the store can't grow unbounded

function prune(): void {
  const now = Date.now();
  for (const [token, session] of SESSIONS) {
    if (now - session.createdAt > TTL_MS) SESSIONS.delete(token);
  }
  // Map preserves insertion order, so the first entries are the oldest.
  while (SESSIONS.size >= MAX_SESSIONS) {
    const oldest = SESSIONS.keys().next().value;
    if (oldest === undefined) break;
    SESSIONS.delete(oldest);
  }
}

export function createSession(): StooqSession {
  prune();
  const token = randomBytes(16).toString('hex');
  const session: StooqSession = {
    token,
    cookies: {},
    unlocked: false,
    createdAt: Date.now(),
  };
  SESSIONS.set(token, session);
  return session;
}

export function getSession(token: string): StooqSession | undefined {
  prune();
  return SESSIONS.get(token);
}

export function serializeCookies(session: StooqSession): string {
  return Object.entries(session.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function extractSetCookies(response: Response): string[] {
  // Node 18+ / undici exposes getSetCookie(); fall back to the single header.
  const anyHeaders = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === 'function') {
    return anyHeaders.getSetCookie().map((c) => c.split(';')[0]);
  }
  const single = response.headers.get('set-cookie');
  return single ? [single.split(';')[0]] : [];
}

/** Merge any Set-Cookie headers from a response into the session jar. */
export function storeSetCookies(session: StooqSession, response: Response): void {
  for (const cookie of extractSetCookies(response)) {
    const idx = cookie.indexOf('=');
    if (idx <= 0) continue;
    const name = cookie.slice(0, idx);
    const value = cookie.slice(idx + 1);
    session.cookies[name] = value;
  }
}
