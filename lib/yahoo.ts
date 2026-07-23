import { StooqDataPoint } from './types';

const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Map a Stooq-style ticker to the equivalent Yahoo Finance symbol.
 *
 * Rules (deterministic, so the resolved symbol is predictable):
 *   - Already Yahoo-native (contains "-" or "="): used as-is (e.g. BTC-USD, USDPLN=X)
 *   - ".UK"  -> ".L"    (London Stock Exchange)
 *   - ".PL"  -> ".WA"   (Warsaw Stock Exchange)
 *   - ".V"   -> "-USD"  (Stooq crypto notation, e.g. BTC.V -> BTC-USD)
 *   - any other explicit ".XX" suffix: kept as-is (.DE, .L, .WA, .US, ...)
 *   - no suffix, 6 letters: treated as an FX pair -> "+=X" (e.g. USDPLN -> USDPLN=X)
 *   - no suffix, anything else: treated as a Warsaw-listed instrument -> "+.WA"
 */
export function toYahooSymbol(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (!t) return t;

  if (t.includes('-') || t.includes('=')) return t;
  if (t.endsWith('.UK')) return t.slice(0, -3) + '.L';
  if (t.endsWith('.PL')) return t.slice(0, -3) + '.WA';
  if (t.endsWith('.V')) return t.slice(0, -2) + '-USD';
  if (t.includes('.')) return t;
  if (/^[A-Z]{6}$/.test(t)) return t + '=X';
  return t + '.WA';
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
 * Fetch full daily price history for a ticker from Yahoo Finance.
 * Returns an ascending-by-date array of OHLCV points.
 * Throws with a descriptive message when the symbol has no usable history.
 */
export async function fetchYahooData(ticker: string): Promise<StooqDataPoint[]> {
  const symbol = toYahooSymbol(ticker);
  // Use explicit period1/period2 (epoch seconds) rather than range=max:
  // range=max downsamples long histories to monthly bars, which breaks daily
  // indicators like the 50/200-day SMA. period1=0 forces true daily granularity.
  const now = Math.floor(Date.now() / 1000);
  const url =
    `${YAHOO_CHART_URL}${encodeURIComponent(symbol)}` +
    `?period1=0&period2=${now}&interval=1d`;

  const response = await fetch(url, {
    headers: { 'User-Agent': UA },
  });

  if (!response.ok) {
    throw new Error(
      `Yahoo Finance request failed for ${ticker} (${symbol}): ${response.status} ${response.statusText}`
    );
  }

  const json: YahooChartResponse = await response.json();

  if (json.chart?.error) {
    throw new Error(
      `Yahoo Finance has no symbol "${symbol}" (for ticker ${ticker}): ${
        json.chart.error.description || json.chart.error.code
      }`
    );
  }

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];

  if (!result || !timestamps || !quote || timestamps.length === 0) {
    throw new Error(
      `No data available on Yahoo Finance for ${ticker} (tried symbol "${symbol}")`
    );
  }

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

  if (data.length < 2) {
    throw new Error(
      `Yahoo Finance returned no usable history for ${ticker} (symbol "${symbol}"). ` +
        `Indices such as WIG20 are not available on Yahoo — try a tracking ETF like ETFBW20ST.WA instead.`
    );
  }

  // Yahoo returns ascending order already, but guarantee it.
  data.sort((a, b) => a.date.localeCompare(b.date));

  return data;
}
