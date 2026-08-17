import { StooqDataPoint } from './types';
import { fetchWithTimeout } from './http';

const NBP_BASE = 'https://api.nbp.pl/api';

/**
 * A calendar year that has finished can never gain or change a rate, so its window
 * is cached hard — a month, which is effectively forever for a closed year while
 * still self-healing if NBP ever restates one. Only the current year's window is
 * refetched often, and even then not on every click: NBP publishes one fixing per
 * business day, so a quarter of an hour is well inside its update cadence.
 *
 * This is the difference between an Analyze costing 25 upstream calls every time
 * and costing them once.
 */
const CLOSED_WINDOW_TTL_SECONDS = 30 * 24 * 60 * 60;
const CURRENT_WINDOW_TTL_SECONDS = 15 * 60;

/** Table A (average rates) is published back to this date; the gold fixing starts later. */
const TABLE_A_START = '2002-01-02';
const GOLD_START = '2013-01-02';

/** NBP rejects any single query spanning more than 367 days, so we fetch calendar years. */
const MAX_PARALLEL_CHUNKS = 6;

/**
 * Currency codes quoted in NBP table A. Hardcoded so a typo fails immediately
 * instead of firing ~25 chunk requests that all 404. XAU is not a table A
 * currency — it's the separate gold fixing, priced per gram — but it behaves
 * like one here: a daily PLN value, which is all the cross-rate maths needs.
 */
const SERIES_CODES = new Set([
  'THB', 'USD', 'AUD', 'HKD', 'CAD', 'NZD', 'SGD', 'EUR', 'HUF', 'CHF', 'GBP',
  'UAH', 'JPY', 'CZK', 'DKK', 'ISK', 'NOK', 'SEK', 'RON', 'TRY', 'ILS', 'CLP',
  'PHP', 'MXN', 'ZAR', 'BRL', 'MYR', 'IDR', 'INR', 'KRW', 'CNY', 'XDR', 'XAU',
]);

/** Raised when a ticker isn't something NBP publishes. */
export class NbpTickerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NbpTickerError';
  }
}

type NbpTicker =
  | { kind: 'direct'; code: string }              // XXXPLN  -> PLN per 1 XXX
  | { kind: 'inverse'; code: string }             // PLNXXX  -> 1 / (PLN per 1 XXX)
  | { kind: 'cross'; base: string; quote: string }; // XXXYYY -> both legs via PLN

/**
 * Map an app ticker to an NBP series.
 *   USDPLN / USDPLN=X / USD/PLN / USD -> PLN per 1 USD
 *   PLNUSD                            -> USD per 1 PLN (inverse)
 *   EURUSD                            -> cross, computed from the two PLN legs
 *   XAUPLN / GOLD                     -> NBP gold fixing, PLN per gram
 */
export function parseNbpTicker(ticker: string): NbpTicker {
  let t = ticker.trim().toUpperCase().replace(/=X$/, '').replace(/[/\-_.]/g, '');
  if (t === 'GOLD') t = 'XAU';
  if (t === 'GOLDPLN') t = 'XAUPLN';

  const unsupported = (code: string) =>
    new NbpTickerError(
      `NBP does not publish "${code}". Supported: ${[...SERIES_CODES].sort().join(', ')} ` +
        `— quoted against PLN (e.g. USDPLN), inverted (PLNUSD) or crossed (EURUSD). ` +
        `NBP is FX and gold only: it has no stocks, ETFs or indices.`
    );

  if (t.length === 3) t += 'PLN';

  if (t.length !== 6) {
    throw new NbpTickerError(
      `"${ticker}" is not an NBP pair. Use a 6-letter pair like USDPLN, EURPLN or EURUSD, ` +
        `or XAUPLN for the gold fixing (PLN per gram).`
    );
  }

  const base = t.slice(0, 3);
  const quote = t.slice(3);

  if (base === quote) throw new NbpTickerError(`"${ticker}" quotes a currency against itself.`);
  if (quote === 'PLN') {
    if (!SERIES_CODES.has(base)) throw unsupported(base);
    return { kind: 'direct', code: base };
  }
  if (base === 'PLN') {
    if (!SERIES_CODES.has(quote)) throw unsupported(quote);
    return { kind: 'inverse', code: quote };
  }
  if (!SERIES_CODES.has(base)) throw unsupported(base);
  if (!SERIES_CODES.has(quote)) throw unsupported(quote);
  return { kind: 'cross', base, quote };
}

/** Today in Warsaw — NBP's own calendar, and it rejects an end date in the future. */
function warsawToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Split [start, today] into calendar-year windows, each under NBP's 367-day cap. */
function yearWindows(start: string): Array<[string, string]> {
  const today = warsawToday();
  if (start > today) return [];
  const firstYear = Number(start.slice(0, 4));
  const lastYear = Number(today.slice(0, 4));
  const windows: Array<[string, string]> = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const from = y === firstYear ? start : `${y}-01-01`;
    const to = y === lastYear ? today : `${y}-12-31`;
    if (from <= to) windows.push([from, to]);
  }
  return windows;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

interface RatesResponse {
  rates?: Array<{ effectiveDate: string; mid: number }>;
}
type GoldResponse = Array<{ data: string; cena: number }>;

/**
 * Full daily history for one series as date -> PLN value of one unit
 * (one gram, for gold). A 404 on a window means NBP simply published nothing in
 * it — currencies join table A at different times (UAH has no 2002 quotes) — so
 * that window is skipped rather than failing the whole fetch.
 */
async function fetchSeries(code: string): Promise<Map<string, number>> {
  const isGold = code === 'XAU';
  const windows = yearWindows(isGold ? GOLD_START : TABLE_A_START);
  const today = warsawToday();

  const chunks = await mapLimit(windows, MAX_PARALLEL_CHUNKS, async ([from, to]) => {
    const url = isGold
      ? `${NBP_BASE}/cenyzlota/${from}/${to}/?format=json`
      : `${NBP_BASE}/exchangerates/rates/a/${code.toLowerCase()}/${from}/${to}/?format=json`;

    // Only the final window reaches today; every earlier one ends on a 31 December
    // that has already passed and is therefore settled history.
    const isClosed = to < today;
    const res = await fetchWithTimeout(
      url,
      {
        next: {
          revalidate: isClosed ? CLOSED_WINDOW_TTL_SECONDS : CURRENT_WINDOW_TTL_SECONDS,
        },
      },
      'NBP'
    );
    if (res.status === 404) return [] as Array<[string, number]>;
    if (!res.ok) {
      throw new Error(`NBP request failed for ${code} (${from}..${to}): ${res.status}`);
    }
    const json = await res.json();
    if (isGold) {
      return (json as GoldResponse).map((r) => [r.data, Number(r.cena)] as [string, number]);
    }
    return ((json as RatesResponse).rates ?? []).map(
      (r) => [r.effectiveDate, Number(r.mid)] as [string, number]
    );
  });

  const series = new Map<string, number>();
  for (const chunk of chunks) {
    for (const [date, value] of chunk) {
      if (isFinite(value) && value > 0) series.set(date, value);
    }
  }
  return series;
}

function toPoints(values: Map<string, number>): StooqDataPoint[] {
  // One published fixing per business day — no intraday range and no volume, so
  // the whole bar collapses onto the single rate.
  return [...values.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, open: v, high: v, low: v, close: v, volume: 0 }));
}

/**
 * Fetch daily history from the National Bank of Poland. Free and keyless: table A
 * average rates (32 currencies vs PLN, daily since 2002-01-02) plus the gold
 * fixing (PLN per gram, since 2013-01-02). Cross rates are derived from the two
 * PLN legs on days where both were published. No adjusted close — these are
 * reference rates, not tradeable instruments with dividends.
 */
export async function fetchNbpData(ticker: string): Promise<StooqDataPoint[]> {
  const parsed = parseNbpTicker(ticker);

  if (parsed.kind === 'cross') {
    const [base, quote] = await Promise.all([
      fetchSeries(parsed.base),
      fetchSeries(parsed.quote),
    ]);
    const crossed = new Map<string, number>();
    for (const [date, b] of base) {
      const q = quote.get(date);
      if (q && q > 0) crossed.set(date, b / q);
    }
    if (crossed.size === 0) {
      throw new Error(
        `NBP published no overlapping ${parsed.base} and ${parsed.quote} rates for ${ticker}.`
      );
    }
    return toPoints(crossed);
  }

  const series = await fetchSeries(parsed.code);
  if (series.size === 0) {
    throw new Error(`NBP returned no rates for ${ticker} (${parsed.code}).`);
  }

  if (parsed.kind === 'inverse') {
    const inverted = new Map<string, number>();
    for (const [date, v] of series) inverted.set(date, 1 / v);
    return toPoints(inverted);
  }

  return toPoints(series);
}
