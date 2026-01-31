import Papa from 'papaparse';
import { StooqDataPoint, TickerData } from './types';

const STOOQ_BASE_URL = 'https://stooq.pl/q/d/l/';

export async function fetchStooqData(ticker: string): Promise<TickerData> {
  const url = `${STOOQ_BASE_URL}?s=${encodeURIComponent(ticker.toLowerCase())}&d1=19000101&d2=20301231&i=d`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch data for ${ticker}: ${response.statusText}`);
  }

  const csvText = await response.text();

  if (!csvText || csvText.trim().length === 0) {
    throw new Error(`No data returned for ticker: ${ticker}`);
  }

  const data = parseStooqCSV(csvText, ticker);

  if (data.length === 0) {
    throw new Error(`Invalid ticker or no data available: ${ticker}`);
  }

  return {
    ticker: ticker.toUpperCase(),
    data,
  };
}

export function parseStooqCSV(csvText: string, ticker: string): StooqDataPoint[] {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.warn(`CSV parsing warnings for ${ticker}:`, result.errors);
  }

  const data: StooqDataPoint[] = [];

  for (const row of result.data as Record<string, string>[]) {
    // Stooq CSV columns: Data, Otwarcie, Najwyzszy, Najnizszy, Zamkniecie, Wolumen
    // Or in English: Date, Open, High, Low, Close, Volume
    const date = row['Data'] || row['Date'];
    const open = parseFloat(row['Otwarcie'] || row['Open'] || '0');
    const high = parseFloat(row['Najwyzszy'] || row['High'] || '0');
    const low = parseFloat(row['Najnizszy'] || row['Low'] || '0');
    const close = parseFloat(row['Zamkniecie'] || row['Close'] || '0');
    const volume = parseFloat(row['Wolumen'] || row['Volume'] || '0');

    if (date && !isNaN(close) && close > 0) {
      data.push({
        date,
        open: isNaN(open) ? close : open,
        high: isNaN(high) ? close : high,
        low: isNaN(low) ? close : low,
        close,
        volume: isNaN(volume) ? 0 : volume,
      });
    }
  }

  // Sort by date ascending
  data.sort((a, b) => a.date.localeCompare(b.date));

  return data;
}

export async function fetchMultipleTickers(tickers: string[]): Promise<TickerData[]> {
  const results: TickerData[] = [];

  for (const ticker of tickers) {
    try {
      const data = await fetchStooqData(ticker.trim());
      results.push(data);
    } catch (error) {
      console.error(`Error fetching ${ticker}:`, error);
      throw error;
    }
  }

  return results;
}
