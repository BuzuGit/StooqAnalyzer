import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

/**
 * A Stooq browsing session: a cookie jar plus whether the human CAPTCHA has been
 * solved. It must persist across several requests (create → CAPTCHA image →
 * submit answer → download), and on Vercel those requests hit different, isolated
 * serverless functions — so in-memory state does NOT work there.
 *
 * It travels in an HttpOnly cookie on the app's own domain, so the browser hands it
 * back with every same-origin request — the data fetch, the CAPTCHA <img>, the
 * answer POST — and any function instance can pick it up. It holds only Stooq's
 * anonymous visitor cookies (~400 bytes encoded), nothing of ours worth hiding: a
 * visitor who edits it only affects their own Stooq requests.
 *
 * This replaced an Upstash Redis store, which was one more service to keep alive —
 * once its database stopped answering, every Stooq request died with a bare
 * "fetch failed" before Stooq was ever contacted.
 */
export interface StooqSession {
  token: string;
  cookies: Record<string, string>;
  unlocked: boolean;
  createdAt: number;
}

const TTL_SECONDS = 30 * 60; // 30 minutes, refreshed on every save
const COOKIE_NAME = 'stooq_session';

export function newSession(): StooqSession {
  return {
    token: randomBytes(16).toString('hex'),
    cookies: {},
    unlocked: false,
    createdAt: Date.now(),
  };
}

/**
 * Persist a session (upsert) with a sliding TTL. Call after mutating cookies/unlocked.
 * Only valid inside a route handler — it writes to the outgoing response.
 */
export async function saveSession(session: StooqSession): Promise<void> {
  cookies().set(COOKIE_NAME, Buffer.from(JSON.stringify(session)).toString('base64url'), {
    httpOnly: true,
    sameSite: 'lax',
    // Plain http on localhost would drop a Secure cookie.
    secure: process.env.NODE_ENV === 'production',
    path: '/api/stooq',
    maxAge: TTL_SECONDS,
  });
}

export async function createSession(): Promise<StooqSession> {
  const session = newSession();
  await saveSession(session);
  return session;
}

/** The session the browser sent back, if it is the one `token` names. */
export async function getSession(token: string): Promise<StooqSession | undefined> {
  const raw = cookies().get(COOKIE_NAME)?.value;
  if (!raw) return undefined;
  try {
    const session = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as StooqSession;
    // A token mismatch means an older session is still in the browser — not this one.
    return session.token === token ? session : undefined;
  } catch {
    return undefined; // malformed cookie: treat as no session
  }
}

export function serializeCookies(session: StooqSession): string {
  return Object.entries(session.cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function extractSetCookies(response: Response): string[] {
  const anyHeaders = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === 'function') {
    return anyHeaders.getSetCookie().map((c) => c.split(';')[0]);
  }
  const single = response.headers.get('set-cookie');
  return single ? [single.split(';')[0]] : [];
}

/** Merge any Set-Cookie headers from a response into the session jar (in place). */
export function storeSetCookies(session: StooqSession, response: Response): void {
  for (const cookie of extractSetCookies(response)) {
    const idx = cookie.indexOf('=');
    if (idx <= 0) continue;
    session.cookies[cookie.slice(0, idx)] = cookie.slice(idx + 1);
  }
}
