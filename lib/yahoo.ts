import { StooqDataPoint } from './types';

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

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
  const url =
    `${YAHOO_CHART_URL}${encodeURIComponent(symbol)}` +
    `?period1=0&period2=${now}&interval=1d`;

  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) return null; // 404 etc. — symbol not found, try the next candidate

  const json: YahooChartResponse = await response.json();
  if (json.chart?.error) return null;

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  if (!result || !timestamps || !quote || timestamps.length === 0) return null;

  const data: StooqDataPoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = quote.close?.[i];
    if (close == null || isNaN(close) || close <= 0) continue;

    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const volume = quote.volume?.[i];

    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);

    data.push({
      date,
      open: open != null && !isNaN(open) ? open : close,
      high: high != null && !isNaN(high) ? high : close,
      low: low != null && !isNaN(low) ? low : close,
      close,
      volume: volume != null && !isNaN(volume) ? volume : 0,
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
  const candidates = yahooCandidates(ticker);
  for (const symbol of candidates) {
    const data = await fetchYahooSymbol(symbol);
    if (data) return data;
  }
  throw new Error(
    `No data available on Yahoo Finance for ${ticker} (tried: ${candidates.join(', ')}). ` +
      `Indices such as WIG20 are not on Yahoo — try a tracking ETF like ETFBW20ST.WA instead.`
  );
}
