import { StooqDataPoint, Statistics } from './types';
import { formatDaysAsPeriod } from './statistics';

export interface ExportRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number | null;
  volume: number;
  /** Fraction (e.g. 0.0123 = +1.23%) vs the prior row in time; null for the first. */
  pctChange: number | null;
}

/** Value used for the % change / return: prefer adjusted close, fall back to close. */
function refValue(p: { close: number; adjClose?: number | null }): number {
  return p.adjClose != null ? p.adjClose : p.close;
}

/**
 * Tab 1 rows: the exact sourced data (ascending by date) plus a % change column
 * computed against the previous day (adj close if present, else close).
 */
export function buildDailyRows(points: StooqDataPoint[]): ExportRow[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p, i) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    adjClose: p.adjClose ?? null,
    volume: p.volume,
    pctChange: i > 0 ? refValue(p) / refValue(sorted[i - 1]) - 1 : null,
  }));
}

export type StatValueKind = 'text' | 'percent' | 'price' | 'number' | 'integer';

export interface StatExportRow {
  /** Section heading this row sits under; '' for the rows that are the heading itself. */
  section: string;
  label: string;
  /** Percent rows carry a FRACTION (-0.0552), so Excel's own % format applies. */
  value: string | number | null;
  kind: StatValueKind;
  /** The period a best/worst figure belongs to, or a date for a min/max. */
  detail?: string | null;
}

/**
 * Statistics-tab rows, mirroring the on-screen stats panel section for section and
 * row for row — including hiding the trailing-return rows the window is too short
 * to support, exactly as the panel does.
 *
 * The figures are the ones the panel is showing, passed in rather than recomputed,
 * so the sheet cannot drift from the tool. That matters because the panel reflects
 * the selected date range and price basis while the data tabs hold the full sourced
 * history — hence the Period block at the top, which states the window and basis
 * the numbers below actually cover.
 */
export function buildStatsRows(
  stats: Statistics,
  meta: { priceBasis: 'close' | 'adjClose' }
): StatExportRow[] {
  const rows: StatExportRow[] = [];
  const pct = (section: string, label: string, value: number, detail?: string | null) =>
    rows.push({ section, label, value: value / 100, kind: 'percent', detail });

  rows.push({ section: 'PERIOD', label: 'Ticker', value: stats.ticker, kind: 'text' });
  rows.push({ section: 'PERIOD', label: 'Start date', value: stats.startDate, kind: 'text' });
  rows.push({ section: 'PERIOD', label: 'End date', value: stats.endDate, kind: 'text' });
  rows.push({ section: 'PERIOD', label: 'Sessions', value: stats.totalDays, kind: 'integer' });
  rows.push({
    section: 'PERIOD',
    label: 'Price basis',
    value: meta.priceBasis === 'adjClose' ? 'Adjusted close' : 'Close',
    kind: 'text',
  });

  pct('RETURNS', 'Period Return', stats.periodReturn);
  pct('RETURNS', 'CAGR', stats.cagr);
  if (stats.ytdReturn !== null) pct('RETURNS', 'YTD Return', stats.ytdReturn);
  if (stats.oneYearReturn !== null) pct('RETURNS', '1Y Return', stats.oneYearReturn);
  if (stats.threeYearReturn !== null) pct('RETURNS', '3Y Return', stats.threeYearReturn);
  if (stats.fiveYearReturn !== null) pct('RETURNS', '5Y Return', stats.fiveYearReturn);
  if (stats.bestYear) pct('RETURNS', 'Best Year', stats.bestYear.value, stats.bestYear.label);
  if (stats.worstYear) pct('RETURNS', 'Worst Year', stats.worstYear.value, stats.worstYear.label);
  if (stats.bestMonth) pct('RETURNS', 'Best Month', stats.bestMonth.value, stats.bestMonth.label);
  if (stats.worstMonth) {
    pct('RETURNS', 'Worst Month', stats.worstMonth.value, stats.worstMonth.label);
  }
  rows.push({
    section: 'RETURNS',
    label: 'Growth of $1',
    value: stats.growthOf1,
    kind: 'price',
  });

  // The panel renders these two as negatives; keep that sign here so the sheet reads
  // the same way rather than inverting the meaning.
  pct('DRAWDOWNS', 'Max DD', -stats.maxDrawdown, stats.maxDrawdownDate);
  pct('DRAWDOWNS', 'Current DD', stats.currentDrawdown > 0 ? -stats.currentDrawdown : 0);
  pct('DRAWDOWNS', 'To ATH', stats.toReturnToATH > 0 ? stats.toReturnToATH : 0);
  rows.push({
    section: 'DRAWDOWNS',
    label: 'Longest DD',
    value: formatDaysAsPeriod(stats.longestDrawdownDays),
    kind: 'text',
    detail: `${stats.longestDrawdownDays} days`,
  });

  pct('STATS', 'Annualized STD', stats.annualizedStd);
  rows.push({
    section: 'STATS',
    label: 'Sharpe Ratio',
    value: stats.sharpeRatio,
    kind: 'number',
  });

  return rows;
}

function periodKey(date: string, granularity: 'month' | 'year'): string {
  // date is YYYY-MM-DD
  return granularity === 'month' ? date.slice(0, 7) : date.slice(0, 4);
}

/**
 * Tab 2 / Tab 3 rows: one row per month or year.
 *
 * Date and OHLC / Adj Close come from the last trading day of the period; Volume
 * is the SUM of all daily volumes in the period; % change is the period's return
 * (last-day ref value vs the previous period's). Rows are ordered descending by
 * date (newest period first).
 */
export function buildPeriodicRows(
  points: StooqDataPoint[],
  granularity: 'month' | 'year'
): ExportRow[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // Group into periods, preserving chronological order of first appearance.
  const groups = new Map<string, StooqDataPoint[]>();
  for (const p of sorted) {
    const key = periodKey(p.date, granularity);
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  // Chronological (ascending) so we can compute period-over-period change.
  const asc = Array.from(groups.values()).map((group) => {
    const last = group[group.length - 1]; // sorted, so this is the latest day
    const volumeSum = group.reduce((sum, p) => sum + (p.volume || 0), 0);
    return { last, volumeSum };
  });

  const ascRows: ExportRow[] = asc.map((g, i) => ({
    date: g.last.date,
    open: g.last.open,
    high: g.last.high,
    low: g.last.low,
    close: g.last.close,
    adjClose: g.last.adjClose ?? null,
    volume: g.volumeSum,
    pctChange: i > 0 ? refValue(g.last) / refValue(asc[i - 1].last) - 1 : null,
  }));

  // Newest first.
  return ascRows.reverse();
}
