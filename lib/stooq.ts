import { createHash } from 'crypto';
import { StooqDataPoint } from './types';
import {
  createSession,
  getSession,
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
 * Fetch a URL within a session, transparently solving the proof-of-work
 * challenge if Stooq serves it, and merging all Set-Cookie headers into the jar.
 */
async function fetchTextWithPoW(url: string, session: StooqSession): Promise<string> {
  let res = await stooqFetch(url, session);
  storeSetCookies(session, res);
  let text = await res.text();

  if (text.includes('This site requires JavaScript')) {
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

    res = await stooqFetch(url, session);
    storeSetCookies(session, res);
    text = await res.text();
  }

  return text;
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
  const existing = token ? getSession(token) : undefined;
  if (existing) return existing;

  const session = createSession();
  await fetchTextWithPoW(`${STOOQ_ORIGIN}/`, session);
  await fetchTextWithPoW(`${STOOQ_ORIGIN}/q/d/?s=wig20`, session);
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
  const session = getSession(token);
  if (!session) {
    throw new StooqBlockedError('Stooq session expired. Please try again.');
  }
  const res = await stooqFetch(`${STOOQ_CAPTCHA_IMG_URL}?${Date.now()}`, session);
  storeSetCookies(session, res);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    buffer,
    contentType: res.headers.get('content-type') || 'image/png',
  };
}

/**
 * Submit a human-typed CAPTCHA answer. Returns true when Stooq accepts it and
 * unlocks the session for downloads.
 */
export async function submitStooqCaptcha(token: string, code: string): Promise<boolean> {
  const session = getSession(token);
  if (!session) {
    throw new StooqBlockedError('Stooq session expired. Please try again.');
  }
  const answer = code.trim().toLowerCase();
  const res = await stooqFetch(
    `${STOOQ_CAPTCHA_CHECK_URL}?t=${encodeURIComponent(answer)}`,
    session
  );
  storeSetCookies(session, res);
  const body = (await res.text()).trim();
  if (body === '1') {
    session.unlocked = true;
    return true;
  }
  return false;
}

/**
 * Create (or reuse) a Stooq session for downloading. If the session has not yet
 * cleared the CAPTCHA, throws StooqCaptchaRequiredError carrying the token the
 * client uses to fetch the image and submit the answer.
 */
export async function ensureStooqSession(token?: string): Promise<string> {
  const session = await ensurePowSession(token);
  if (!session.unlocked) {
    throw new StooqCaptchaRequiredError(session.token);
  }
  return session.token;
}

/**
 * Fetch daily history CSV for one ticker from Stooq using an unlocked session.
 * Throws StooqCaptchaRequiredError if the session lost its unlocked state and a
 * fresh CAPTCHA is needed.
 */
export async function fetchStooqData(
  ticker: string,
  token: string,
  apiKey?: string
): Promise<StooqDataPoint[]> {
  const session = getSession(token);
  if (!session) {
    // Should not happen (the route ensures the session first), but if it expired
    // mid-request, ask the user to retry rather than hand back an un-warmed session.
    throw new StooqBlockedError('Stooq session expired. Please try again.');
  }

  const res = await stooqFetch(downloadUrl(ticker, apiKey), session);
  storeSetCookies(session, res);
  const text = await res.text();

  // Stooq caps how many downloads an IP may make per day.
  if (text.includes('Przekroczony dzienny limit')) {
    throw new StooqBlockedError(
      'Stooq daily download limit reached for your IP. Try again tomorrow, or use Yahoo Finance.'
    );
  }

  // We only reach here with a CAPTCHA-unlocked session, so a denial now is NOT a
  // CAPTCHA problem — it is Stooq blocking the download (almost always the per-IP
  // daily quota). Re-prompting for a CAPTCHA would just loop endlessly, so we
  // surface it as a clear block instead.
  if (text.includes('Odmowa') || text.includes('This site requires JavaScript')) {
    throw new StooqBlockedError(
      'Stooq denied the download despite a solved CAPTCHA — this is almost always the ' +
        'per-IP daily download limit. Try again tomorrow, or use Yahoo Finance.'
    );
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
