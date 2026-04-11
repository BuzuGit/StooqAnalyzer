import { StooqDataPoint } from './types';

export function parseStooqCSV(csvText: string, ticker: string): StooqDataPoint[] {
  const lines = csvText.split('\n');
  const data: StooqDataPoint[] = [];

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const parts = trimmed.split(',');
    if (parts.length < 5) continue;

    // Stooq CSV columns: Data,Otwarcie,Najwyzszy,Najnizszy,Zamkniecie,Wolumen
    const date = parts[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const open = parseFloat(parts[1]);
    const high = parseFloat(parts[2]);
    const low = parseFloat(parts[3]);
    const close = parseFloat(parts[4]);
    const volume = parts.length > 5 ? parseFloat(parts[5]) : 0;

    if (!isNaN(close) && close > 0) {
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
