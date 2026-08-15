import { StooqDataPoint } from './types';

/**
 * The CSV behind FRED's "Download" button. Public and keyless — unlike
 * api.stlouisfed.org, which requires a registered API key — and it returns the
 * full published history of a series in one request. Undocumented, so treat a
 * shape change as possible: the parser below fails loudly rather than silently
 * producing an empty series.
 */
const FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv';

/** Raised when a ticker isn't a FRED series ID. */
export class FredSeriesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FredSeriesError';
  }
}

/** FRED series IDs are uppercase alphanumerics; a `FRED:` prefix is accepted and stripped. */
export function toFredSeriesId(ticker: string): string {
  const id = ticker.trim().toUpperCase().replace(/^FRED[:/]/, '');
  if (!/^[A-Z0-9_]{2,64}$/.test(id)) {
    throw new FredSeriesError(
      `"${ticker}" is not a FRED series ID. Use the ID from the series page on ` +
        `fred.stlouisfed.org — e.g. CPIAUCSL (US CPI), SP500, NASDAQCOM, M2SL, DGS10.`
    );
  }
  return id;
}

/**
 * Fetch a FRED series as a daily-shaped price series. FRED publishes one
 * observation per period — daily, monthly or quarterly depending on the series —
 * so the whole OHLC bar collapses onto that value and volume is 0.
 *
 * Observations FRED has not published (market holidays in daily series) come back
 * with an empty value field and are skipped. Values are NOT filtered to positives:
 * real FRED series legitimately go negative (DFII10, NETEXP), and dropping those
 * points would silently misrepresent the series. Ratio statistics — CAGR, growth
 * of $1, drawdown — are only meaningful for level/index series (CPIAUCSL, SP500,
 * M2SL); for rates and percentages (DGS10, UNRATE) the chart is right but those
 * numbers are not.
 */
export async function fetchFredData(ticker: string): Promise<StooqDataPoint[]> {
  const id = toFredSeriesId(ticker);

  const res = await fetch(`${FRED_CSV}?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (res.status === 404) {
    throw new FredSeriesError(
      `FRED has no series "${id}". Check the ID on fred.stlouisfed.org — it is the ` +
        `code in the page URL (fred.stlouisfed.org/series/CPIAUCSL), not the series title.`
    );
  }
  if (!res.ok) {
    throw new Error(`FRED request failed for ${id}: ${res.status}`);
  }

  const csv = (await res.text()).trim();
  const lines = csv.split(/\r?\n/);
  // Header is "observation_date,<SERIES_ID>". Anything else means we were served
  // something other than the CSV (an error page, a redirect to a login wall).
  if (lines.length < 2 || !/^observation_date,/i.test(lines[0])) {
    throw new Error(`FRED returned an unexpected response for ${id} (not a CSV series).`);
  }

  const data: StooqDataPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const comma = lines[i].indexOf(',');
    if (comma < 0) continue;
    const date = lines[i].slice(0, comma).trim();
    const raw = lines[i].slice(comma + 1).trim();
    if (!raw) continue; // no observation published for this date
    const value = Number(raw);
    if (!isFinite(value)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    data.push({ date, open: value, high: value, low: value, close: value, volume: 0 });
  }

  if (data.length === 0) {
    throw new Error(`FRED returned no observations for ${id}.`);
  }

  data.sort((a, b) => a.date.localeCompare(b.date));
  return data;
}
