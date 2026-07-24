import { NextRequest, NextResponse } from 'next/server';
import {
  ensureStooqSession,
  fetchStooqData,
  StooqBlockedError,
  StooqCaptchaRequiredError,
} from '@/lib/stooq';
import { fetchYahooData } from '@/lib/yahoo';
import { fetchTwelveData, TwelveDataConfigError } from '@/lib/twelvedata';
import { ApiResponse, TickerData, StooqDataPoint } from '@/lib/types';

type DataSource = 'stooq' | 'yahoo' | 'twelvedata';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tickersParam = searchParams.get('tickers');
  const rawSource = searchParams.get('source');
  const source: DataSource =
    rawSource === 'stooq' ? 'stooq' : rawSource === 'twelvedata' ? 'twelvedata' : 'yahoo';
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
    if (source === 'yahoo') {
      datasets = await Promise.all(tickers.map((ticker) => fetchYahooData(ticker)));
    } else if (source === 'twelvedata') {
      datasets = await Promise.all(tickers.map((ticker) => fetchTwelveData(ticker)));
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

    return NextResponse.json<ApiResponse>({
      success: true,
      data: results,
    });
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

    if (error instanceof TwelveDataConfigError) {
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
