import { NextRequest, NextResponse } from 'next/server';
import {
  ensureStooqSession,
  fetchStooqData,
  StooqBlockedError,
  StooqCaptchaRequiredError,
} from '@/lib/stooq';
import { fetchYahooData } from '@/lib/yahoo';
import { ApiResponse, TickerData } from '@/lib/types';

type DataSource = 'stooq' | 'yahoo';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tickersParam = searchParams.get('tickers');
  const source: DataSource = searchParams.get('source') === 'stooq' ? 'stooq' : 'yahoo';
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
    const results: TickerData[] = [];

    // Stooq needs a CAPTCHA-unlocked session before any download.
    let token = sessionToken;
    if (source === 'stooq') {
      token = await ensureStooqSession(sessionToken);
    }

    for (const ticker of tickers) {
      const data =
        source === 'yahoo'
          ? await fetchYahooData(ticker)
          : await fetchStooqData(ticker, token!, apiKey);

      if (data.length === 0) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Invalid ticker or no data: ${ticker}` },
          { status: 404 }
        );
      }

      results.push({
        ticker: ticker.toUpperCase(),
        data,
      });
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

    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
