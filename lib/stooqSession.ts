import { randomBytes } from 'crypto';
import { Redis } from '@upstash/redis';

/**
 * A Stooq browsing session: a cookie jar plus whether the human CAPTCHA has been
 * solved. It must persist across several requests (create → CAPTCHA image →
 * submit answer → download), and on Vercel those requests hit different, isolated
 * serverless functions — so in-memory state does NOT work there.
 *
 * When Upstash/Vercel-KV Redis env vars are present we use Redis (required on
 * Vercel). Otherwise we fall back to an in-memory Map for local `npm run dev`.
 */
export interface StooqSession {
  token: string;
  cookies: Record<string, string>;
  unlocked: boolean;
  createdAt: number;
}

const TTL_SECONDS = 30 * 60; // 30 minutes

// Support both Vercel KV (KV_REST_API_*) and direct Upstash (UPSTASH_REDIS_REST_*).
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

/** True when a shared session store is configured (i.e. Stooq can work on Vercel). */
export function hasSharedSessionStore(): boolean {
  return redis !== null;
}

// In-memory fallback for local dev only.
const globalForSessions = globalThis as unknown as {
  __stooqSessions?: Map<string, StooqSession>;
};
const MEM: Map<string, StooqSession> =
  globalForSessions.__stooqSessions ?? new Map<string, StooqSession>();
globalForSessions.__stooqSessions = MEM;

const redisKey = (token: string) => `stooq:session:${token}`;

export function newSession(): StooqSession {
  return {
    token: randomBytes(16).toString('hex'),
    cookies: {},
    unlocked: false,
    createdAt: Date.now(),
  };
}

/** Persist a session (upsert) with a sliding TTL. Call after mutating cookies/unlocked. */
export async function saveSession(session: StooqSession): Promise<void> {
  if (redis) {
    await redis.set(redisKey(session.token), session, { ex: TTL_SECONDS });
  } else {
    MEM.set(session.token, session);
  }
}

export async function createSession(): Promise<StooqSession> {
  const session = newSession();
  await saveSession(session);
  return session;
}

export async function getSession(token: string): Promise<StooqSession | undefined> {
  if (redis) {
    const data = await redis.get<StooqSession>(redisKey(token));
    return data ?? undefined;
  }
  const session = MEM.get(token);
  if (session && Date.now() - session.createdAt > TTL_SECONDS * 1000) {
    MEM.delete(token);
    return undefined;
  }
  return session;
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
