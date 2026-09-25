import { StooqDataPoint } from './types';
import { fetchYahooData, isIsin, yahooCandidates, YahooUnavailableError } from './yahoo';
import { fetchGoogleFinance, toGoogleSymbol } from './googlefinance';

/**
 * The Google Finance symbol that can stand in for a Yahoo ticker, or null when
 * there's no safe equivalent.
 *
 * Only unambiguous translations qualify: an explicit exchange (KGH.WA → WSE:KGH,
 * IWDA.L → LON:IWDA, Stooq-style IWDA.UK too), an FX pair, crypto (BTC-USD →
 * CURRENCY:BTCUSD), or a bare US-style ticker, which Google resolves to its primary
 * listing just as Yahoo tries the US first. Funds by ISIN or Yahoo's own 0P… ids
 * have no Google equivalent, and exchanges Google can't parse (ES3.SI) are left
 * alone — better an honest Yahoo error than another instrument's prices.
 */
export function googleStandIn(ticker: string): string | null {
  const t = ticker.trim().toUpperCase();
  if (!t || isIsin(t) || t.startsWith('0P')) return null;
  const candidates = yahooCandidates(t);
  // Several candidates = a bare ticker; Google gets it as typed.
  const symbol = toGoogleSymbol(candidates.length === 1 ? candidates[0] : t);
  return symbol.includes(':') || /^[A-Z]{1,6}$/.test(symbol) ? symbol : null;
}

export interface FallbackResult {
  data: StooqDataPoint[];
  /** Set when Google stood in, telling the user what they're looking at. */
  notice?: string;
}

/**
 * Yahoo, with Google Finance standing in when Yahoo is down — timeouts, network
 * errors, rate limits, server errors. A ticker Yahoo simply doesn't have is NOT
 * retried on Google: that's a typo or an unlisted instrument, and a guess could
 * quietly chart something else.
 */
export async function fetchYahooWithFallback(ticker: string): Promise<FallbackResult> {
  try {
    return { data: await fetchYahooData(ticker) };
  } catch (error) {
    if (!(error instanceof YahooUnavailableError)) throw error;
    const symbol = googleStandIn(ticker);
    if (!symbol) throw error;

    let data: StooqDataPoint[];
    try {
      data = await fetchGoogleFinance(symbol);
    } catch (googleError) {
      const reason = googleError instanceof Error ? googleError.message : String(googleError);
      throw new Error(`${error.message} Google Finance couldn't stand in either (${symbol}): ${reason}`);
    }
    if (data.length < 2) {
      throw new Error(`${error.message} Google Finance has no data for ${symbol} either.`);
    }
    return {
      data,
      notice:
        `Yahoo Finance didn't respond, so ${ticker.trim().toUpperCase()} was loaded from Google ` +
        `Finance (${symbol}) instead — raw closing prices, no adjusted close. Reload in a few ` +
        `minutes to try Yahoo again.`,
    };
  }
}
