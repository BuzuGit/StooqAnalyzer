import { StooqDataPoint } from './types';
import { fetchWithTimeout } from './http';

/**
 * GUS (Statistics Poland) consumer price indices, read from the history files GUS
 * publishes on stat.gov.pl — one CSV per frequency, each holding the whole series:
 * monthly since January 1982, annual since 1950. Licensed CC BY 4.0 (credit GUS).
 *
 * Why the files rather than GUS's APIs: the DBW API returns one month per request
 * (a CPI history would cost hundreds of calls) and splits CPI across tables by era
 * (2010–2025, then 2026 onwards under a new classification); BDL is regional and
 * mostly annual. The files are the official series in a single download.
 */

const GUS_ORIGIN = 'https://stat.gov.pl';
const CPI_PAGES = `${GUS_ORIGIN}/obszary-tematyczne/ceny-handel/wskazniki-cen/wskazniki-cen-towarow-i-uslug-konsumpcyjnych-pot-inflacja-`;

type Frequency = 'monthly' | 'annual';

/**
 * Each file's name carries a version GUS bumps on every update
 * (…od1982roku_8.csv), so the link is read off its page each time. The last known
 * file is only a fallback for when the page can't be read — it will 404 once
 * superseded, which is why it isn't the primary route.
 */
const FILES: Record<Frequency, { page: string; fallback: string }> = {
  monthly: {
    page: `${CPI_PAGES}/miesieczne-wskazniki-cen-towarow-i-uslug-konsumpcyjnych-od-1982-roku/`,
    fallback: `${GUS_ORIGIN}/download/gfx/portalinformacyjny/pl/defaultstronaopisowa/4741/1/1/miesiecznewskaznikicentowarowiuslugkonsumpcyjnychod1982roku_8.csv`,
  },
  annual: {
    page: `${CPI_PAGES}/roczne-wskazniki-cen-towarow-i-uslug-konsumpcyjnych/`,
    fallback: `${GUS_ORIGIN}/download/gfx/portalinformacyjny/pl/defaultstronaopisowa/5239/1/1/rocznewskaznikicentowarowiuslugkonsumpcyjnychod1950roku_2.csv`,
  },
};

/**
 * GUS publishes once a month, so a few hours is well inside its cadence — and
 * every ticker in a request reads the same file, which this also deduplicates.
 */
const CACHE_SECONDS = 6 * 60 * 60;

interface GusSeries {
  frequency: Frequency;
  /**
   * Which rows to read, by their "Sposób prezentacji" label. Matched on an ASCII
   * prefix, not the full label: GUS's labels aren't consistent (the annual file
   * files 2025 under "Rok poprzedni = 101"), and a prefix survives that.
   */
  presentation: RegExp;
  /**
   * 'level' chains the period-on-period indices into a price level, with the
   * period before the first one = 100. 'rate' is the index minus 100: % change.
   */
  kind: 'level' | 'rate';
}

const SERIES: Record<string, GusSeries> = {
  CPI: { frequency: 'monthly', presentation: /^Poprzedni miesi/i, kind: 'level' },
  CPI_MOM: { frequency: 'monthly', presentation: /^Poprzedni miesi/i, kind: 'rate' },
  CPI_YOY: { frequency: 'monthly', presentation: /^Analogiczny miesi/i, kind: 'rate' },
  CPI_ANNUAL: { frequency: 'annual', presentation: /^Rok poprzedni/i, kind: 'level' },
  CPI_ANNUAL_YOY: { frequency: 'annual', presentation: /^Rok poprzedni/i, kind: 'rate' },
};

/** Raised when a ticker isn't one of the GUS series offered here. */
export class GusSeriesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GusSeriesError';
  }
}

interface GusRow {
  presentation: string;
  year: number;
  /** 1–12 in the monthly file; absent in the annual one. */
  month?: number;
  value: number;
}

/**
 * The files are Windows-1250 (Polish), not UTF-8. Should a runtime lack that
 * decoder, latin1 still reads every digit and the ASCII label prefixes the
 * parser relies on — only the Polish letters would come out garbled.
 */
function decode(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('windows-1250').decode(buffer);
  } catch {
    return Buffer.from(buffer).toString('latin1');
  }
}

async function findCsvUrl(frequency: Frequency): Promise<string> {
  const { page, fallback } = FILES[frequency];
  try {
    const res = await fetchWithTimeout(page, { next: { revalidate: CACHE_SECONDS } }, 'GUS');
    if (res.ok) {
      const href = (await res.text()).match(/href="([^"]+\.csv)"/i)?.[1];
      if (href) return new URL(href, GUS_ORIGIN).toString();
    }
  } catch {
    // page unreachable — fall through to the last known file
  }
  return fallback;
}

/** Parse a GUS history CSV; columns are found by header name, so a reorder can't misread them. */
function parseCsv(text: string, frequency: Frequency): GusRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = (lines[0] ?? '').split(';');
  const column = (prefix: RegExp) => header.findIndex((name) => prefix.test(name.trim()));
  const presentationCol = column(/^Spos/i);
  const yearCol = column(/^Rok$/i);
  const monthCol = column(/^Miesi/i);
  const valueCol = column(/^Warto/i);
  // Anything else means we were handed something other than the file — a moved
  // page, an error screen — and it must fail loudly, not chart an empty series.
  if (
    !/^Nazwa zmiennej/i.test(lines[0] ?? '') ||
    presentationCol < 0 ||
    yearCol < 0 ||
    valueCol < 0 ||
    (frequency === 'monthly' && monthCol < 0)
  ) {
    throw new Error('GUS returned an unexpected file (not its consumer price index CSV).');
  }

  const rows: GusRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(';');
    const raw = (cells[valueCol] ?? '').trim();
    if (!raw) continue; // months GUS hasn't published yet are listed with no value
    const value = Number(raw.replace(',', '.'));
    const year = Number(cells[yearCol]);
    const month = monthCol >= 0 ? Number(cells[monthCol]) : undefined;
    if (!isFinite(value) || !Number.isInteger(year)) continue;
    if (month !== undefined && !(month >= 1 && month <= 12)) continue;
    rows.push({ presentation: (cells[presentationCol] ?? '').trim(), year, month, value });
  }
  return rows;
}

// One download per file per warm function instance, shared by every ticker that
// reads it — including concurrent ones, since the promise itself is kept.
const fileCache = new Map<Frequency, { at: number; rows: Promise<GusRow[]> }>();

function loadRows(frequency: Frequency): Promise<GusRow[]> {
  const hit = fileCache.get(frequency);
  if (hit && Date.now() - hit.at < CACHE_SECONDS * 1000) return hit.rows;

  const rows = (async () => {
    const url = await findCsvUrl(frequency);
    const res = await fetchWithTimeout(url, { next: { revalidate: CACHE_SECONDS } }, 'GUS');
    if (!res.ok) throw new Error(`GUS file download failed: ${res.status}`);
    return parseCsv(decode(await res.arrayBuffer()), frequency);
  })();
  fileCache.set(frequency, { at: Date.now(), rows });
  rows.catch(() => fileCache.delete(frequency)); // never cache a failure
  return rows;
}

/** GUS series names are case-insensitive; a `GUS:` prefix is accepted and stripped. */
export function toGusSeries(ticker: string): string {
  const name = ticker.trim().toUpperCase().replace(/^GUS[:/]/, '');
  if (!SERIES[name]) {
    throw new GusSeriesError(
      `"${ticker}" is not a GUS series here. Available: ${Object.keys(SERIES).join(', ')}.`
    );
  }
  return name;
}

/**
 * Fetch a GUS series. One observation per month or year, dated to its first day
 * (the convention FRED uses, so GUS and FRED series line up), with the whole OHLC
 * bar collapsed onto that value and volume 0.
 *
 * Level series are chained only across an unbroken run of periods: a hole would
 * silently skip that period's inflation, so the chain restarts after one and the
 * series starts there. Rate series can go negative (deflation) and are kept as-is.
 */
export async function fetchGusData(ticker: string): Promise<StooqDataPoint[]> {
  const name = toGusSeries(ticker);
  const spec = SERIES[name];
  const periodsPerYear = spec.frequency === 'monthly' ? 12 : 1;

  const rows = (await loadRows(spec.frequency))
    .filter((row) => spec.presentation.test(row.presentation))
    .map((row) => ({ ...row, index: row.year * periodsPerYear + ((row.month ?? 1) - 1) }))
    .sort((a, b) => a.index - b.index);
  if (rows.length === 0) {
    throw new Error(`GUS returned no observations for ${name}.`);
  }

  const dateOf = (row: GusRow) =>
    `${row.year}-${String(row.month ?? 1).padStart(2, '0')}-01`;
  const point = (date: string, value: number): StooqDataPoint => ({
    date,
    open: value,
    high: value,
    low: value,
    close: value,
    volume: 0,
  });

  if (spec.kind === 'rate') {
    return rows.map((row) => point(dateOf(row), row.value - 100));
  }

  let start = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].index !== rows[i - 1].index + 1) start = i;
  }
  let level = 100;
  return rows.slice(start).map((row) => {
    level *= row.value / 100;
    return point(dateOf(row), level);
  });
}
