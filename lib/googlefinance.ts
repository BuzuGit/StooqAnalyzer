import { StooqDataPoint } from './types';

/** Raised when the Google Finance (Apps Script) endpoint isn't configured. */
export class GoogleFinanceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleFinanceConfigError';
  }
}

/**
 * Map an app ticker to a GOOGLEFINANCE symbol.
 *   - .WA  -> WSE:<base>   (Warsaw)   .L -> LON:   .DE -> ETR:  (Xetra)
 *   - FX   USDPLN=X / USDPLN -> CURRENCY:USDPLN
 *   - bare -> as-is (Google resolves the primary listing)
 * (GOOGLEFINANCE has no crypto support, so BTC-USD etc. will simply return no data.)
 */
export function toGoogleSymbol(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (t.endsWith('.WA')) return `WSE:${t.slice(0, -3)}`;
  if (t.endsWith('.L')) return `LON:${t.slice(0, -2)}`;
  if (t.endsWith('.DE')) return `ETR:${t.slice(0, -3)}`;
  if (t.endsWith('.PL')) return `WSE:${t.slice(0, -3)}`;
  if (/^[A-Z]{6}=X$/.test(t)) return `CURRENCY:${t.slice(0, 6)}`;
  if (/^[A-Z]{6}$/.test(t)) return `CURRENCY:${t}`;
  return t;
}

interface GoogleFinanceResponse {
  error?: string;
  rows?: Array<{
    date: string;
    open: number | string;
    high: number | string;
    low: number | string;
    close: number | string;
    volume: number | string;
  }>;
}

/**
 * Fetch daily history from a Google Apps Script web app that proxies
 * GOOGLEFINANCE(). Requires GOOGLE_FINANCE_URL (the deployed /exec URL).
 */
export async function fetchGoogleFinance(ticker: string): Promise<StooqDataPoint[]> {
  const base = process.env.GOOGLE_FINANCE_URL;
  if (!base) {
    throw new GoogleFinanceConfigError(
      'Google Finance is not configured. Deploy the Apps Script web app and set GOOGLE_FINANCE_URL in Vercel → Settings → Environment Variables.'
    );
  }

  const symbol = toGoogleSymbol(ticker);
  const url = `${base}${base.includes('?') ? '&' : '?'}ticker=${encodeURIComponent(symbol)}`;

  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  if (res.status === 401 || res.status === 403) {
    throw new GoogleFinanceConfigError(
      'Google Finance web app is not public (got ' +
        res.status +
        '). In Apps Script: Deploy → Manage deployments → edit → set "Who has access" to "Anyone", then redeploy and update GOOGLE_FINANCE_URL. (Workspace/org accounts may block "Anyone" — use a personal Gmail account.)'
    );
  }
  if (!res.ok) {
    throw new Error(`Google Finance request failed for ${ticker} (${symbol}): ${res.status}`);
  }

  const json: GoogleFinanceResponse = await res.json();
  if (json.error) {
    throw new Error(`Google Finance: ${json.error} (ticker ${ticker} → ${symbol}).`);
  }

  const data: StooqDataPoint[] = [];
  for (const r of json.rows ?? []) {
    const close = Number(r.close);
    if (!isFinite(close) || close <= 0) continue;
    const open = Number(r.open);
    const high = Number(r.high);
    const low = Number(r.low);
    const volume = Number(r.volume);
    data.push({
      date: String(r.date).slice(0, 10),
      open: isFinite(open) ? open : close,
      high: isFinite(high) ? high : close,
      low: isFinite(low) ? low : close,
      close,
      volume: isFinite(volume) ? volume : 0,
    });
  }

  data.sort((a, b) => a.date.localeCompare(b.date));
  return data;
}
