import { StooqDataPoint } from './types';
import { fetchWithTimeout } from './http';

const TD_BASE = 'https://api.twelvedata.com';

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

async function tdGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(`${TD_BASE}${path}`, { cache: 'no-store' }, 'Twelve Data');
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Compute adjusted close from Twelve Data's (already split-adjusted) close plus
 * dividends, working backward through the ascending series — the standard
 * total-return method Yahoo uses. A dividend with ex-date E scales every earlier
 * price by (1 - amount / close_{E-1}). Splits are NOT applied: Twelve Data's
 * close and dividend amounts are both already split-adjusted to today's basis
 * (applying splits again would double-count them). Mutates each point's `adjClose`.
 */
function applyAdjustedClose(points: StooqDataPoint[], dividends: Map<string, number>): void {
  if (dividends.size === 0) return;
  let factor = 1;
  for (let i = points.length - 1; i >= 0; i--) {
    points[i].adjClose = points[i].close * factor;
    const div = dividends.get(points[i].date);
    if (div && i > 0 && points[i - 1].close > 0) {
      factor *= 1 - div / points[i - 1].close;
    }
  }
}

/**
 * Fetch daily history from Twelve Data. Requires TWELVEDATA_API_KEY. Twelve Data
 * only returns raw OHLC, so for equities/ETFs we also pull /dividends and /splits
 * and derive an adjusted close (skipped for FX/crypto, which have neither).
 */
export async function fetchTwelveData(ticker: string): Promise<StooqDataPoint[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) {
    throw new TwelveDataConfigError(
      'Twelve Data API key not configured. Add TWELVEDATA_API_KEY (free key at twelvedata.com) — on Vercel set it in Project → Settings → Environment Variables and redeploy.'
    );
  }

  const { symbol, params } = toTwelveDataSymbol(ticker);
  const enc = encodeURIComponent(symbol);
  const isFxOrCrypto = symbol.includes('/');

  const [ts, divData] = await Promise.all([
    tdGet<TwelveDataResponse>(
      `/time_series?symbol=${enc}${params}&interval=1day&outputsize=5000&order=ASC&apikey=${encodeURIComponent(key)}`
    ),
    isFxOrCrypto
      ? Promise.resolve(null)
      : tdGet<{ dividends?: Array<{ ex_date?: string; amount?: number }> }>(
          `/dividends?symbol=${enc}${params}&range=full&apikey=${encodeURIComponent(key)}`
        ),
  ]);

  if (!ts || ts.status === 'error' || !ts.values || ts.values.length === 0) {
    throw new Error(`Twelve Data: ${ts?.message || 'no data'} for ${ticker} (symbol ${symbol}).`);
  }

  const data: StooqDataPoint[] = [];
  for (const v of ts.values) {
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

  const dividends = new Map<string, number>();
  for (const d of divData?.dividends ?? []) {
    if (d.ex_date && d.amount != null) dividends.set(d.ex_date, Number(d.amount));
  }
  applyAdjustedClose(data, dividends);

  return data;
}
