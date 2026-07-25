import { StooqDataPoint } from './types';

const TD_URL = 'https://api.twelvedata.com/time_series';

/** Raised when the Twelve Data API key isn't configured. */
export class TwelveDataConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwelveDataConfigError';
  }
}

// App-ticker exchange suffix -> Twelve Data exchange name.
const EXCHANGES: Record<string, string> = {
  WA: 'Warsaw',
  PL: 'Warsaw',
  L: 'London',
  UK: 'London',
  DE: 'XETRA',
  SI: 'Singapore',
  US: '',
};

/**
 * Map an app ticker to a Twelve Data symbol (+ optional query params).
 *   - crypto  BTC-USD    -> BTC/USD
 *   - FX      USDPLN=X   -> USD/PLN   (also bare 6-letter USDPLN)
 *   - suffix  KGH.WA     -> KGH   &exchange=Warsaw
 *   - bare    AAPL       -> AAPL  (US/global)
 */
export function toTwelveDataSymbol(ticker: string): { symbol: string; params: string } {
  const t = ticker.trim().toUpperCase();

  if (/^[A-Z0-9]{2,10}-(USD|USDT|EUR|GBP|BTC|ETH|PLN)$/.test(t)) {
    return { symbol: t.replace('-', '/'), params: '' };
  }
  if (/^[A-Z]{6}=X$/.test(t)) {
    return { symbol: `${t.slice(0, 3)}/${t.slice(3, 6)}`, params: '' };
  }
  if (/^[A-Z]{6}$/.test(t)) {
    return { symbol: `${t.slice(0, 3)}/${t.slice(3, 6)}`, params: '' };
  }

  const dot = t.lastIndexOf('.');
  if (dot > 0) {
    const base = t.slice(0, dot);
    const suffix = t.slice(dot + 1);
    if (EXCHANGES[suffix] !== undefined) {
      const ex = EXCHANGES[suffix];
      return { symbol: base, params: ex ? `&exchange=${encodeURIComponent(ex)}` : '' };
    }
    return { symbol: t, params: '' };
  }

  return { symbol: t, params: '' };
}

interface TwelveDataResponse {
  status?: string;
  message?: string;
  values?: Array<{
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }>;
}

/**
 * Fetch daily history from Twelve Data. Requires TWELVEDATA_API_KEY (free key at
 * twelvedata.com). Twelve Data's time_series returns raw OHLC (no adjusted close).
 */
export async function fetchTwelveData(ticker: string): Promise<StooqDataPoint[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) {
    throw new TwelveDataConfigError(
      'Twelve Data API key not configured. Add TWELVEDATA_API_KEY to .env.local (get a free key at twelvedata.com).'
    );
  }

  const { symbol, params } = toTwelveDataSymbol(ticker);
  const url =
    `${TD_URL}?symbol=${encodeURIComponent(symbol)}${params}` +
    `&interval=1day&outputsize=5000&order=ASC&apikey=${encodeURIComponent(key)}`;

  const res = await fetch(url, { cache: 'no-store' });
  const json: TwelveDataResponse = await res.json();

  if (json.status === 'error' || !json.values || json.values.length === 0) {
    throw new Error(`Twelve Data: ${json.message || 'no data'} for ${ticker} (symbol ${symbol}).`);
  }

  const data: StooqDataPoint[] = [];
  for (const v of json.values) {
    const close = parseFloat(v.close);
    if (!isFinite(close) || close <= 0) continue;
    const open = parseFloat(v.open);
    const high = parseFloat(v.high);
    const low = parseFloat(v.low);
    const volume = v.volume != null ? parseFloat(v.volume) : 0;
    data.push({
      date: v.datetime.slice(0, 10),
      open: isFinite(open) ? open : close,
      high: isFinite(high) ? high : close,
      low: isFinite(low) ? low : close,
      close,
      volume: isFinite(volume) ? volume : 0,
    });
  }

  data.sort((a, b) => a.date.localeCompare(b.date));
  return data;
}
