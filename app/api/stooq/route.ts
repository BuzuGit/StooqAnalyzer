import { NextRequest, NextResponse } from 'next/server';
import {
  ensureStooqSession,
  fetchStooqData,
  StooqBlockedError,
  StooqCaptchaRequiredError,
} from '@/lib/stooq';
import { fetchYahooWithFallback } from '@/lib/yahooFallback';
import { cached } from '@/lib/seriesCache';
import { fetchTwelveData, TwelveDataConfigError } from '@/lib/twelvedata';
import { fetchGoogleFinance, GoogleFinanceConfigError } from '@/lib/googlefinance';
import { fetchNbpData, NbpTickerError } from '@/lib/nbp';
import { fetchFredData, FredSeriesError } from '@/lib/fred';
import { fetchGusData, GusSeriesError } from '@/lib/gus';
import { ApiResponse, TickerData, StooqDataPoint } from '@/lib/types';

type DataSource = 'stooq' | 'yahoo' | 'twelvedata' | 'google' | 'nbp' | 'fred' | 'gus';

/**
 * The Google proxy alone can take ~10s a ticker, and a Yahoo outage costs its own
 * timeouts before Google stands in — well past a 10s function limit.
 */
export const maxDuration = 60;

/**
 * Price histories change once a day, so a result is served as-is for an hour, and
 * for a day after that it's still served instantly while a fresh copy downloads in
 * the background (stale-while-revalidate). Vercel's edge honours this, so repeating
 * a view — a reload, a shared link — doesn't run the function at all.
 */
const FRESH_SECONDS = 60 * 60;
const STALE_SECONDS = 24 * 60 * 60;
/** A load where a fallback stood in is kept only briefly, so the real source is retried soon. */
const FALLBACK_SECONDS = 5 * 60;

/** Per-series memory cache (lib/seriesCache) for the sources without their own. */
function cachedSeries(
  source: DataSource,
  ticker: string,
  load: (ticker: string) => Promise<StooqDataPoint[]>
): Promise<StooqDataPoint[]> {
  return cached(`${source}:${ticker.trim().toUpperCase()}`, async () => ({
    value: await load(ticker),
    ttlMs: FRESH_SECONDS * 1000,
  }));
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tickersParam = searchParams.get('tickers');
  const rawSource = searchParams.get('source');
  const source: DataSource =
    rawSource === 'stooq'
      ? 'stooq'
      : rawSource === 'twelvedata'
      ? 'twelvedata'
      : rawSource === 'google'
      ? 'google'
      : rawSource === 'nbp'
      ? 'nbp'
      : rawSource === 'fred'
      ? 'fred'
      : rawSource === 'gus'
      ? 'gus'
      : 'yahoo';
  const sessionToken = searchParams.get('session') || undefined;

  if (!tickersParam) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Missing tickers parameter' },
      { status: 400 }
    );
  }

  const tickers = tickersParam.split(',').map(t => t.trim()).filter(t => t.length > 0);

  if (tickers.length === 0) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'No valid tickers provided' },
      { status: 400 }
    );
  }

  if (tickers.length > 10) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: 'Maximum 10 tickers allowed' },
      { status: 400 }
    );
  }

  const apiKey = process.env.STOOQ_API_KEY;

  try {
    // Yahoo requests are independent — fetch them in parallel. Stooq must stay
    // sequential: all tickers share one CAPTCHA-unlocked session and Stooq rate
    // limits per IP.
    let datasets: StooqDataPoint[][];
    const notices: string[] = [];
    if (source === 'yahoo') {
      const results = await Promise.all(
        tickers.map((ticker) =>
          cached(`yahoo:${ticker.trim().toUpperCase()}`, async () => {
            const result = await fetchYahooWithFallback(ticker);
            const ttl = result.notice ? FALLBACK_SECONDS : FRESH_SECONDS;
            return { value: result, ttlMs: ttl * 1000 };
          })
        )
      );
      datasets = results.map((result) => result.data);
      for (const result of results) if (result.notice) notices.push(result.notice);
    } else if (source === 'twelvedata') {
      datasets = await Promise.all(
        tickers.map((ticker) => cachedSeries(source, ticker, fetchTwelveData))
      );
    } else if (source === 'fred') {
      datasets = await Promise.all(
        tickers.map((ticker) => cachedSeries(source, ticker, fetchFredData))
      );
    } else if (source === 'gus') {
      // Tickers share one file per frequency, downloaded once (see lib/gus).
      datasets = await Promise.all(
        tickers.map((ticker) => cachedSeries(source, ticker, fetchGusData))
      );
    } else if (source === 'nbp') {
      // Each pair already fans out ~25 windowed requests internally, so keep the
      // tickers themselves sequential rather than multiplying that against NBP.
      datasets = [];
      for (const ticker of tickers) {
        datasets.push(await cachedSeries(source, ticker, fetchNbpData));
      }
    } else if (source === 'google') {
      // The Apps Script proxy serializes on one sheet — fetch sequentially.
      datasets = [];
      for (const ticker of tickers) {
        datasets.push(await cachedSeries(source, ticker, fetchGoogleFinance));
      }
    } else {
      const token = await ensureStooqSession(sessionToken);
      datasets = [];
      for (const ticker of tickers) {
        datasets.push(await fetchStooqData(ticker, token, apiKey));
      }
    }

    const results: TickerData[] = [];
    for (let i = 0; i < tickers.length; i++) {
      if (datasets[i].length === 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Invalid ticker or no data: ${tickers[i]}` },
          { status: 404 }
        );
      }
      results.push({ ticker: tickers[i].toUpperCase(), data: datasets[i] });
    }

    // Stooq's answer depends on a CAPTCHA session, so it's never shared.
    const cacheControl =
      source === 'stooq'
        ? 'no-store'
        : notices.length > 0
        ? `public, s-maxage=${FALLBACK_SECONDS}`
        : `public, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`;
    return NextResponse.json<ApiResponse>(
      { success: true, data: results, ...(notices.length > 0 ? { notices } : {}) },
      { headers: { 'Cache-Control': cacheControl } }
    );
  } catch (error) {
    console.error('Error fetching market data:', error);

    // Stooq needs a human to solve a CAPTCHA — tell the client how to do it.
    if (error instanceof StooqCaptchaRequiredError) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          captchaRequired: true,
          sessionToken: error.token,
          error: 'Stooq requires solving a CAPTCHA to download data.',
        },
        { status: 200 }
      );
    }

    if (error instanceof StooqBlockedError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: error.message },
        { status: 503 }
      );
    }

    if (
      error instanceof TwelveDataConfigError ||
      error instanceof GoogleFinanceConfigError ||
      error instanceof NbpTickerError ||
      error instanceof FredSeriesError ||
      error instanceof GusSeriesError
    ) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
