import { StooqDataPoint, TickerData } from './types';

export type PriceBasis = 'close' | 'adjClose';

/**
 * Re-express a series on the chosen price basis.
 *
 * "close" returns the raw sourced data unchanged. "adjClose" scales the whole
 * OHLC bar by the daily adjustment factor (adjClose / close) so open/high/low
 * stay consistent with the adjusted close — this reflects dividends and removes
 * split artifacts, which is the correct basis for return/drawdown analysis.
 * Points without an adjClose (e.g. Stooq) are left untouched.
 */
export function applyPriceBasis(data: StooqDataPoint[], basis: PriceBasis): StooqDataPoint[] {
  if (basis === 'close') return data;
  return data.map((p) => {
    if (p.adjClose == null || !(p.close > 0)) return p;
    const f = p.adjClose / p.close;
    return {
      ...p,
      open: p.open * f,
      high: p.high * f,
      low: p.low * f,
      close: p.adjClose,
    };
  });
}

export function tickersWithBasis(tickers: TickerData[], basis: PriceBasis): TickerData[] {
  if (basis === 'close') return tickers;
  return tickers.map((td) => ({
    ticker: td.ticker,
    data: applyPriceBasis(td.data, basis),
  }));
}

/** True when at least one point carries an adjusted close (so the toggle is meaningful). */
export function hasAdjClose(tickers: TickerData[]): boolean {
  return tickers.some((td) => td.data.some((p) => p.adjClose != null));
}
