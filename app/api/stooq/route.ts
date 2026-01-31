import { NextRequest, NextResponse } from 'next/server';
import { fetchStooqData, parseStooqCSV } from '@/lib/stooq';
import { ApiResponse, TickerData } from '@/lib/types';

const STOOQ_BASE_URL = 'https://stooq.pl/q/d/l/';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tickersParam = searchParams.get('tickers');

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

  try {
    const results: TickerData[] = [];

    for (const ticker of tickers) {
      const url = `${STOOQ_BASE_URL}?s=${encodeURIComponent(ticker.toLowerCase())}&d1=19000101&d2=20301231&i=d`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Failed to fetch data for ${ticker}: ${response.statusText}` },
          { status: 502 }
        );
      }

      const csvText = await response.text();

      if (!csvText || csvText.trim().length === 0 || csvText.includes('Brak danych')) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `No data available for ticker: ${ticker}` },
          { status: 404 }
        );
      }

      const data = parseStooqCSV(csvText, ticker);

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
    console.error('Error fetching stooq data:', error);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}
