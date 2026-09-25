import type { DataSource } from '@/components/TickerInput';
import type { ChartView } from '@/components/PriceChart';
import type { PriceBasis } from './priceBasis';

/**
 * Everything needed to reproduce what's on screen: what was loaded, and how it's shown.
 * It lives in the page address, so copying the address shares the exact view, and the
 * last one is kept in the browser so the app reopens where it was left.
 */
export interface ViewState {
  tickers: string[];
  source: DataSource;
  /** First date in view. Omitted = from the start of the data. */
  from?: string;
  /**
   * Last date in view. Omitted = up to the latest data — so a link to a "Max" view
   * keeps growing as new prices arrive instead of freezing on the day it was shared.
   */
  to?: string;
  /** Omitted = price. */
  view?: ChartView;
  log?: boolean;
  /** Omitted = close. */
  basis?: PriceBasis;
  /** Asset the detail sections focus on. Omitted = the first ticker. */
  focus?: string;
}

const SOURCES: DataSource[] = ['yahoo', 'stooq', 'twelvedata', 'google', 'nbp', 'fred'];
const VIEWS: ChartView[] = ['price', 'percent', 'drawdown'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Same cap the data API enforces. */
const MAX_TICKERS = 10;
const STORAGE_KEY = 'assetAnalyzer.lastView';

/**
 * Encode as a query string. Commas and colons are left readable (both are legal in a
 * query), so a shared link reads `?tickers=WSE:WIG20,KGH.WA` rather than `%3A`/`%2C` soup.
 */
export function viewToQuery(view: ViewState): string {
  const pairs: [string, string][] = [
    ['tickers', view.tickers.join(',')],
    ['source', view.source],
  ];
  if (view.from) pairs.push(['from', view.from]);
  if (view.to) pairs.push(['to', view.to]);
  if (view.view && view.view !== 'price') pairs.push(['view', view.view]);
  if (view.log) pairs.push(['scale', 'log']);
  if (view.basis === 'adjClose') pairs.push(['basis', 'adj']);
  if (view.focus) pairs.push(['focus', view.focus]);
  return pairs
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%2C/gi, ',').replace(/%3A/gi, ':')}`)
    .join('&');
}

/**
 * Decode a query string. Returns null when it names no tickers. Anything unrecognised
 * is dropped rather than trusted — the address is user-editable, so a typo must fall
 * back to a default, not break the page.
 */
export function viewFromQuery(search: string): ViewState | null {
  const params = new URLSearchParams(search);
  const tickers = (params.get('tickers') || '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, MAX_TICKERS);
  if (tickers.length === 0) return null;

  const source = params.get('source') as DataSource | null;
  const view = params.get('view') as ChartView | null;
  const from = params.get('from');
  const to = params.get('to');
  const focus = params.get('focus');

  return {
    tickers,
    source: source && SOURCES.includes(source) ? source : 'yahoo',
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
    view: view && VIEWS.includes(view) ? view : undefined,
    log: params.get('scale') === 'log',
    basis: params.get('basis') === 'adj' ? 'adjClose' : undefined,
    focus: focus || undefined,
  };
}

/**
 * Remember the view for next time. Storage can be unavailable (private windows,
 * blocked site data) — the app just won't remember, which is fine.
 */
export function saveLastView(query: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, query);
  } catch {
    // not remembered this time
  }
}

export function loadLastView(): ViewState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? viewFromQuery(stored) : null;
  } catch {
    return null;
  }
}
