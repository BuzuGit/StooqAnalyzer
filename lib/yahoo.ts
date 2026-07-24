import { StooqDataPoint } from './types';

const YAHOO_CHART_PATH = '/v8/finance/chart/';
const YAHOO_SEARCH_PATH = '/v1/finance/search';
// Try both API hosts — when Yahoo has issues it is often only one of them.
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

interface YahooSearchResponse {
  quotes?: Array<{ symbol?: string }>;
}

/** Cached cookie + crumb; Yahoo sometimes starts requiring these on the data APIs. */
let crumbCache: { cookie: string; crumb: string } | null = null;

function setCookieHeader(res: Response): string {
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : res.headers.get('set-cookie')
      ? [res.headers.get('set-cookie') as string]
      : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

/** Best-effort acquisition of Yahoo's anti-abuse cookie + crumb (yfinance-style). */
async function fetchCrumb(): Promise<{ cookie: string; crumb: string } | null> {
  if (crumbCache) return crumbCache;
  try {
    const r1 = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA } });
    const cookie = setCookieHeader(r1);
    if (!cookie) return null;
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
    });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb || crumb.length > 40 || crumb.includes('<')) return null;
    crumbCache = { cookie, crumb };
    return crumbCache;
  } catch {
    return null;
  }
}

/**
 * Fetch a Yahoo API path, resilient to the ways Yahoo breaks: falls back from
 * query1 to query2, and if a request is rejected (401/403) it obtains a
 * cookie+crumb and retries. Returns the Response (even 404, so the caller can
 * treat it as "not found"), or null if every host failed at the network level.
 */
async function yahooApiFetch(pathWithQuery: string): Promise<Response | null> {
  let lastRes: Response | null = null;
  for (const host of YAHOO_HOSTS) {
    const base = `https://${host}${pathWithQuery}`;
    try {
      let res = await fetch(base, {
        headers: { 'User-Agent': UA, ...(crumbCache ? { Cookie: crumbCache.cookie } : {}) },
      });
      if (res.status === 401 || res.status === 403) {
        const cr = await fetchCrumb();
        if (cr) {
          const sep = pathWithQuery.includes('?') ? '&' : '?';
          res = await fetch(`${base}${sep}crumb=${encodeURIComponent(cr.crumb)}`, {
            headers: { 'User-Agent': UA, Cookie: cr.cookie },
          });
        }
      }
      if (res.ok || res.status === 404) return res;
      lastRes = res; // 429/5xx — try the other host before giving up
    } catch {
      // network error — try the next host
    }
  }
  return lastRes;
}

/** ISIN: 2-letter country code + 9 alphanumerics + 1 check digit. */
export function isIsin(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value);
}

/**
 * Resolve an ISIN to a Yahoo symbol via Yahoo's search endpoint. Funds/ETFs
 * resolve to their "0P..." symbol; equities to their listing symbol. Yahoo's
 * chart API only accepts symbols, not ISINs.
 */
async function resolveIsin(isin: string): Promise<string | null> {
  const res = await yahooApiFetch(
    `${YAHOO_SEARCH_PATH}?q=${encodeURIComponent(isin)}&quotesCount=1&newsCount=0`
  );
  if (!res || !res.ok) return null;
  const json: YahooSearchResponse = await res.json();
  return json.quotes?.find((q) => q.symbol)?.symbol ?? null;
}

/**
 * Build an ordered list of Yahoo Finance symbols to try for a ticker.
 *
 * A bare ticker is ambiguous — "AAPL" is a US stock (used as-is), while "KGH"
 * is Warsaw-listed ("KGH.WA"). We can't tell from the string, so for bare
 * tickers we try the symbol as-is first (US/global — the most common case),
 * then FX ("=X" for a 6-letter pair), then Warsaw (".WA"). Stooq-style suffixes
 * are converted deterministically.
 */
export function yahooCandidates(ticker: string): string[] {
  const t = ticker.trim().toUpperCase();
  if (!t) return [];

  // Already Yahoo-native or an explicit exchange suffix — use exactly as given.
  if (t.includes('-') || t.includes('=')) return [t];
  if (t.endsWith('.UK')) return [t.slice(0, -3) + '.L']; // London
  if (t.endsWith('.PL')) return [t.slice(0, -3) + '.WA']; // Warsaw
  if (t.endsWith('.V')) return [t.slice(0, -2) + '-USD']; // Stooq crypto notation
  if (t.includes('.')) return [t]; // e.g. KGH.WA, IWDA.L, XYZ.DE

  // Bare ticker: try US/global first, then FX, then Warsaw.
  const candidates = [t];
  if (/^[A-Z]{6}$/.test(t)) candidates.push(t + '=X');
  candidates.push(t + '.WA');
  return candidates;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

/**
 * Fetch daily history for a single exact Yahoo symbol.
 * Returns the OHLCV points, or null if the symbol has no usable daily history
 * (so the caller can try the next candidate).
 */
async function fetchYahooSymbol(symbol: string): Promise<StooqDataPoint[] | null> {
  // Use explicit period1/period2 (epoch seconds) rather than range=max:
  // range=max downsamples long histories to monthly bars, which breaks daily
  // indicators like the 50/200-day SMA. period1=0 forces true daily granularity.
  const now = Math.floor(Date.now() / 1000);
  const path =
    `${YAHOO_CHART_PATH}${encodeURIComponent(symbol)}` +
    `?period1=0&period2=${now}&interval=1d`;

  const response = await yahooApiFetch(path);
  if (!response || !response.ok) return null; // 404/unavailable — try the next candidate

  const json: YahooChartResponse = await response.json();
  if (json.chart?.error) return null;

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  const adjcloseArr = result?.indicators?.adjclose?.[0]?.adjclose;
  if (!result || !timestamps || !quote || timestamps.length === 0) return null;

  const data: StooqDataPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null || isNaN(close) || close <= 0) continue;

    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const volume = quote.volume?.[i];
    const adj = adjcloseArr?.[i];

    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

    data.push({
      date,
      open: open != null && !isNaN(open) ? open : close,
      high: high != null && !isNaN(high) ? high : close,
      low: low != null && !isNaN(low) ? low : close,
      close,
      volume: volume != null && !isNaN(volume) ? volume : 0,
      adjClose: adj != null && !isNaN(adj) ? adj : undefined,
    });
  }

  // Need at least a couple of points to compute anything (also filters out
  // index symbols like WIG20.WA that only return a single live value).
  if (data.length < 2) return null;

  // Yahoo returns ascending order already, but guarantee it.
  data.sort((a, b) => a.date.localeCompare(b.date));
  return data;
}

/**
 * Fetch full daily price history for a ticker from Yahoo Finance, trying each
 * candidate symbol until one returns usable data.
 * Throws with a descriptive message when none of them work.
 */
export async function fetchYahooData(ticker: string): Promise<StooqDataPoint[]> {
  // An ISIN must first be resolved to a Yahoo symbol (funds/ETFs -> "0P...").
  if (isIsin(ticker.trim().toUpperCase())) {
    const isin = ticker.trim().toUpperCase();
    const symbol = await resolveIsin(isin);
    if (!symbol) {
      throw new Error(`Could not find ISIN ${isin} on Yahoo Finance.`);
    }
    const data = await fetchYahooSymbol(symbol);
    if (data) return data;
    throw new Error(`No usable history on Yahoo Finance for ISIN ${isin} (symbol ${symbol}).`);
  }

  const candidates = yahooCandidates(ticker);
  for (const symbol of candidates) {
    const data = await fetchYahooSymbol(symbol);
    if (data) return data;
  }
  throw new Error(
    `No data available on Yahoo Finance for ${ticker} (tried: ${candidates.join(', ')}). ` +
      `Indices such as WIG20 are not on Yahoo — try a tracking ETF like ETFBW20TR.WA instead.`
  );
}
