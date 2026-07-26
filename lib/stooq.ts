import { createHash } from 'crypto';
import { ProxyAgent } from 'undici';
import { StooqDataPoint } from './types';
import {
  createSession,
  getSession,
  hasSharedSessionStore,
  saveSession,
  serializeCookies,
  storeSetCookies,
  StooqSession,
} from './stooqSession';

const STOOQ_ORIGIN = 'https://stooq.pl';
const STOOQ_BASE_URL = `${STOOQ_ORIGIN}/q/d/l/`;
const STOOQ_VERIFY_URL = `${STOOQ_ORIGIN}/__verify`;
const STOOQ_CAPTCHA_IMG_URL = `${STOOQ_ORIGIN}/q/l/s/i/`;
const STOOQ_CAPTCHA_CHECK_URL = `${STOOQ_ORIGIN}/q/l/s/`;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Optional proxy: on Vercel, Stooq requests come from rotating datacenter IPs,
// which Stooq's anti-bot denies even after a solved CAPTCHA. Routing every Stooq
// request through one fixed (ideally residential) proxy IP makes the whole flow
// look like a single trusted browser — the way it does from a local machine.
const STOOQ_PROXY_URL = process.env.STOOQ_PROXY_URL;
const proxyDispatcher = STOOQ_PROXY_URL ? new ProxyAgent(STOOQ_PROXY_URL) : undefined;

/** True when a fixed egress proxy is configured for Stooq. */
export function hasStooqProxy(): boolean {
  return proxyDispatcher !== undefined;
}

/** Raised when Stooq serves its anti-bot page instead of data. */
export class StooqBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StooqBlockedError';
  }
}

/**
 * Raised when Stooq requires a human to solve an image CAPTCHA before it will
 * serve downloads. Carries the session token the client needs to fetch the
 * CAPTCHA image and submit the answer.
 */
export class StooqCaptchaRequiredError extends Error {
  token: string;
  constructor(token: string) {
    super('Stooq requires solving a CAPTCHA to download data.');
    this.name = 'StooqCaptchaRequiredError';
    this.token = token;
  }
}

/** Solve Stooq's hashcash-style proof-of-work: find n where sha256(c + n) starts with `d` zeros. */
function solveProofOfWork(challenge: string, difficulty: number): number {
  // Stooq uses difficulty 4; refuse absurd values so a changed/hostile challenge
  // can't force a long CPU burn (each extra zero multiplies the work by 16).
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) {
    throw new StooqBlockedError('Stooq anti-bot challenge changed unexpectedly');
  }
  const prefix = '0'.repeat(difficulty);
  let n = 0;
  // Bounded so a difficulty change can never hang the request.
  const limit = 50_000_000;
  while (n < limit) {
    const hash = createHash('sha256').update(challenge + n).digest('hex');
    if (hash.startsWith(prefix)) return n;
    n++;
  }
  throw new StooqBlockedError('Could not solve the Stooq proof-of-work challenge');
}

function stooqFetch(url: string, session: StooqSession, init?: RequestInit) {
  const cookie = serializeCookies(session);
  return fetch(url, {
    ...init,
    // Never let Next.js cache these — a cached response replays no fresh
    // Set-Cookie headers, which silently drops the per-visit session cookies
    // (cookie_uu / uid) that Stooq's download grant requires.
    cache: 'no-store',
    // Route through the fixed proxy (if configured) so every request in the flow
    // shares one egress IP. `dispatcher` is a valid undici/Node fetch option even
    // though it's not in the DOM RequestInit type.
    ...(proxyDispatcher ? ({ dispatcher: proxyDispatcher } as object) : {}),
    headers: {
      'User-Agent': UA,
      Referer: `${STOOQ_ORIGIN}/q/d/?s=`,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init?.headers || {}),
    },
  });
}

function downloadUrl(ticker: string, apiKey?: string): string {
  let url = `${STOOQ_BASE_URL}?s=${encodeURIComponent(
    ticker.toLowerCase()
  )}&d1=19000101&d2=20301231&i=d`;
  if (apiKey) url += `&apikey=${encodeURIComponent(apiKey)}`;
  return url;
}

/**
 * If `text` is Stooq's proof-of-work challenge page, solve it and POST the answer
 * (which authorizes the session cookie). Returns true if a challenge was solved.
 * Stooq can throw this challenge on ANY endpoint — pages, the download, the
 * CAPTCHA image, and the CAPTCHA verify — so every request path must handle it.
 */
async function solvePoWChallenge(text: string, session: StooqSession): Promise<boolean> {
  if (!text.includes('This site requires JavaScript')) return false;
  const match = text.match(/const c="([^"]+)",d=(\d+)/);
  if (!match) {
    throw new StooqBlockedError('Stooq returned an unrecognized anti-bot challenge page');
  }
  const n = solveProofOfWork(match[1], parseInt(match[2], 10));
  const verifyRes = await stooqFetch(STOOQ_VERIFY_URL, session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `c=${encodeURIComponent(match[1])}&n=${n}`,
  });
  storeSetCookies(session, verifyRes);
  return true;
}

/** GET a URL as text, transparently solving a proof-of-work challenge if served. */
async function fetchTextWithPoW(url: string, session: StooqSession): Promise<string> {
  let res = await stooqFetch(url, session);
  storeSetCookies(session, res);
  let text = await res.text();
  if (await solvePoWChallenge(text, session)) {
    res = await stooqFetch(url, session);
    storeSetCookies(session, res);
    text = await res.text();
  }
  return text;
}

/** GET a URL as binary (e.g. the CAPTCHA PNG), solving a proof-of-work challenge if served. */
async function fetchBinaryWithPoW(
  url: string,
  session: StooqSession
): Promise<{ buffer: Buffer; contentType: string }> {
  let res = await stooqFetch(url, session);
  storeSetCookies(session, res);
  let buffer = Buffer.from(await res.arrayBuffer());
  let contentType = res.headers.get('content-type') || '';

  // Detect a PoW challenge by the actual bytes, NOT the content-type header:
  // Stooq sometimes serves the HTML challenge with content-type image/png. A
  // real image starts with a binary magic byte; the challenge page starts with '<'.
  if (buffer.length > 0 && buffer[0] === 0x3c /* '<' */) {
    if (await solvePoWChallenge(buffer.toString('utf8'), session)) {
      res = await stooqFetch(url, session);
      storeSetCookies(session, res);
      buffer = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get('content-type') || '';
    }
  }

  return { buffer, contentType: contentType.startsWith('image/') ? contentType : 'image/png' };
}

/**
 * Ensure a Stooq session exists that has cleared the JavaScript proof-of-work
 * challenge. Reuses an existing session by token, or creates a fresh one.
 *
 * A fresh session is warmed up like a real browser — loading the home page and a
 * data page — so it collects the full cookie set (uid / cookie_user / cookie_uu /
 * PHPSESSID). Those cookies are REQUIRED for the download grant: solving the
 * CAPTCHA only unlocks downloads when the session already looks like a browser.
 */
async function ensurePowSession(token?: string): Promise<StooqSession> {
  const existing = token ? await getSession(token) : undefined;
  if (existing) return existing;

  const session = await createSession();
  await fetchTextWithPoW(`${STOOQ_ORIGIN}/`, session);
  await fetchTextWithPoW(`${STOOQ_ORIGIN}/q/d/?s=wig20`, session);
  await saveSession(session); // persist the warmed-up cookie set
  return session;
}

/**
 * Fetch the current CAPTCHA image (PNG) for a session so a human can read it.
 * The image is bound to the session cookies, so it must be proxied through the
 * server rather than loaded directly by the browser.
 */
export async function getStooqCaptchaImage(
  token: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const session = await getSession(token);
  if (!session) {
    throw new StooqBlockedError('Stooq session expired. Please try again.');
  }
  const image = await fetchBinaryWithPoW(`${STOOQ_CAPTCHA_IMG_URL}?${Date.now()}`, session);
  await saveSession(session); // the image fetch may have solved a PoW and set cookies
  return image;
}

/**
 * Submit a human-typed CAPTCHA answer. Returns true when Stooq accepts it and
 * unlocks the session for downloads.
 */
export async function submitStooqCaptcha(token: string, code: string): Promise<boolean> {
  const session = await getSession(token);
  if (!session) {
    throw new StooqBlockedError('Stooq session expired. Please try again.');
  }
  const answer = code.trim().toLowerCase();
  const body = (
    await fetchTextWithPoW(`${STOOQ_CAPTCHA_CHECK_URL}?t=${encodeURIComponent(answer)}`, session)
  ).trim();
  session.unlocked = body === '1';
  await saveSession(session); // persist unlocked flag + any cookies for the download request
  return session.unlocked;
}

/**
 * Create (or reuse) a warmed-up Stooq session (proof-of-work solved, full cookie
 * set collected) and return its token. Does NOT force a CAPTCHA — Stooq only
 * requires one some of the time, so we let the actual download decide (see
 * fetchStooqData). Often the warm-up cookies alone are enough to download.
 */
export async function ensureStooqSession(token?: string): Promise<string> {
  // On Vercel the CAPTCHA flow spans several isolated serverless requests, so it
  // needs a shared session store (Redis). Without one the session is lost between
  // requests and the download can never unlock — fail loudly with instructions.
  if (process.env.VERCEL && !hasSharedSessionStore()) {
    throw new StooqBlockedError(
      'Stooq needs a Redis store on Vercel so its CAPTCHA session survives across ' +
        'serverless requests. Add Upstash Redis (or Vercel KV) to the project and redeploy. ' +
        'Meanwhile, use Yahoo or Twelve Data.'
    );
  }
  const session = await ensurePowSession(token);
  return session.token;
}

/**
 * Fetch daily history CSV for one ticker from Stooq.
 *
 * Tries the download directly with the warmed-up session. If Stooq returns
 * "Odmowa" (access denied) it means a CAPTCHA is currently required: we throw
 * StooqCaptchaRequiredError so the client can prompt for one. If the download is
 * STILL denied after the user solved a CAPTCHA (session.unlocked), we stop with a
 * clear block instead of looping.
 */
export async function fetchStooqData(
  ticker: string,
  token: string,
  apiKey?: string
): Promise<StooqDataPoint[]> {
  const session = await getSession(token);
  if (!session) {
    // Should not happen (the route ensures the session first), but if it expired
    // mid-request, ask the user to retry rather than hand back an un-warmed session.
    throw new StooqBlockedError('Stooq session expired. Please try again.');
  }

  // Download, transparently solving a proof-of-work challenge if Stooq serves one.
  const text = await fetchTextWithPoW(downloadUrl(ticker, apiKey), session);
  await saveSession(session); // persist any cookies picked up during the download

  // Stooq caps how many downloads an IP may make per day.
  if (text.includes('Przekroczony dzienny limit')) {
    throw new StooqBlockedError(
      'Stooq daily download limit reached for your IP. Try again tomorrow, or use Yahoo Finance.'
    );
  }

  if (text.includes('Odmowa') || text.includes('This site requires JavaScript')) {
    if (session.unlocked) {
      // CAPTCHA was solved yet the download is still denied — don't loop.
      // On Vercel without a proxy this is the datacenter-IP block: Stooq denies
      // downloads from datacenter IPs even after a correct CAPTCHA.
      if (process.env.VERCEL && !hasStooqProxy()) {
        throw new StooqBlockedError(
          "Stooq denied the download even though the CAPTCHA was correct — Vercel's datacenter IP is " +
            'blocked by Stooq. Set STOOQ_PROXY_URL (a fixed, ideally residential proxy) in Vercel so ' +
            'Stooq requests come from one trusted IP. Meanwhile, use Yahoo, Twelve Data or Google.'
        );
      }
      throw new StooqBlockedError(
        'Stooq is still denying the download after a solved CAPTCHA — a temporary per-IP block or ' +
          'daily limit. Try again later, or use another source.'
      );
    }
    // First denial: Stooq wants a CAPTCHA right now — ask the client to prompt.
    throw new StooqCaptchaRequiredError(session.token);
  }

  // "Brak danych" = no data for this symbol.
  if (text.includes('Brak danych')) {
    return [];
  }

  return parseStooqCSV(text, ticker);
}

export function parseStooqCSV(csvText: string, ticker: string): StooqDataPoint[] {
  const lines = csvText.split('\n');
  const data: StooqDataPoint[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const parts = trimmed.split(',');
    if (parts.length < 5) continue;

    // Stooq CSV columns: Data,Otwarcie,Najwyzszy,Najnizszy,Zamkniecie,Wolumen
    const date = parts[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const open = parseFloat(parts[1]);
    const high = parseFloat(parts[2]);
    const low = parseFloat(parts[3]);
    const close = parseFloat(parts[4]);
    const volume = parts.length > 5 ? parseFloat(parts[5]) : 0;

    if (!isNaN(close) && close > 0) {
      data.push({
        date,
        open: isNaN(open) ? close : open,
        high: isNaN(high) ? close : high,
        low: isNaN(low) ? close : low,
        close,
        volume: isNaN(volume) ? 0 : volume,
      });
    }
  }

  // Sort by date ascending
  data.sort((a, b) => a.date.localeCompare(b.date));

  return data;
}
