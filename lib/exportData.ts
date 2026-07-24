import { StooqDataPoint } from './types';

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
