'use client';

import { useState, FormEvent } from 'react';

export type DataSource = 'stooq' | 'yahoo' | 'twelvedata';

const SOURCE_LABELS: Record<DataSource, string> = {
  stooq: 'Stooq',
  yahoo: 'Yahoo',
  twelvedata: 'Twelve Data',
};

const SOURCE_INFO: Record<DataSource, string> = {
  yahoo:
    'Broadest coverage: global stocks, ETFs, FX, crypto, and European funds by ISIN. Includes adjusted close (Close/Adj-Close toggle). Unofficial API — occasionally flaky. Indices (e.g. WIG20) have no history — use a tracking ETF.',
  stooq:
    'Global coverage incl. Polish listings and indices. Requires solving a CAPTCHA and is rate-limited per IP (can be temporarily denied). No adjusted close.',
  twelvedata:
    'Stable official API (free API key set in Vercel). Free tier is US-only: US stocks & mutual funds work; no London/Warsaw listings, UCITS ETFs or ISINs. Raw prices only — its dividends feed (needed for adjusted close) is a paid endpoint, unlocked on the free tier for just a few sample symbols like AAPL, so Adj-Close mostly won’t appear. For adjusted close on any asset, use Yahoo. ~20y history, rate-limited.',
};

interface TickerInputProps {
  onSubmit: (tickers: string[], source: DataSource) => void;
  isLoading: boolean;
  source: DataSource;
  onSourceChange: (source: DataSource) => void;
}

const EXAMPLES: Record<DataSource, { label: string; value: string }[]> = {
  stooq: [
    { label: 'USDPLN', value: 'USDPLN' },
    { label: 'WIG20', value: 'WIG20' },
    { label: 'BTC.V', value: 'BTC.V' },
    { label: 'IWDA.UK', value: 'IWDA.UK' },
    { label: 'VWRA.UK', value: 'VWRA.UK' },
    { label: 'EIMI.UK', value: 'EIMI.UK' },
    { label: 'CSPX.UK', value: 'CSPX.UK' },
    { label: 'VDTA.UK', value: 'VDTA.UK' },
    { label: 'ETFBM40TR.PL', value: 'ETFBM40TR.PL' },
  ],
  yahoo: [
    { label: 'KGH.WA', value: 'KGH.WA' },
    { label: 'PKO.WA', value: 'PKO.WA' },
    { label: 'ETFBW20TR.WA', value: 'ETFBW20TR.WA' },
    { label: 'USDPLN=X', value: 'USDPLN=X' },
    { label: 'BTC-USD', value: 'BTC-USD' },
    { label: 'IWDA.L', value: 'IWDA.L' },
    { label: 'CSPX.L', value: 'CSPX.L' },
    { label: 'AAPL', value: 'AAPL' },
    { label: 'GLD', value: 'GLD' },
    { label: 'QQQ', value: 'QQQ' },
    { label: 'ES3.SI', value: 'ES3.SI' },
  ],
  twelvedata: [
    { label: 'AAPL', value: 'AAPL' },
    { label: 'MSFT', value: 'MSFT' },
    { label: 'QQQ', value: 'QQQ' },
    { label: 'GLD', value: 'GLD' },
    { label: 'BTC-USD', value: 'BTC-USD' },
    { label: 'USDPLN=X', value: 'USDPLN=X' },
  ],
};

export default function TickerInput({
  onSubmit,
  isLoading,
  source,
  onSourceChange,
}: TickerInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const tickers = inputValue
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (tickers.length > 0) {
      onSubmit(tickers, source);
    }
  };

  const examples = EXAMPLES[source];

  const placeholder =
    source === 'yahoo'
      ? 'Enter Yahoo symbols or ISINs (e.g., KGH.WA, USDPLN=X, LU1662497327)'
      : source === 'twelvedata'
      ? 'Enter symbols (e.g., AAPL, BTC-USD, USDPLN=X)'
      : 'Enter tickers (e.g., USDPLN, IWDA.UK, WIG20)';

  return (
    <div className="bg-panel rounded-lg shadow-md p-4 mb-4">
      {/* Source switch */}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm font-medium text-content">Data source:</span>
        <div className="inline-flex rounded-lg border border-line p-0.5 bg-panel-2">
          {(['yahoo', 'stooq', 'twelvedata'] as DataSource[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSourceChange(s)}
              disabled={isLoading}
              className={`px-3 py-1 text-sm rounded-md font-medium transition-colors disabled:cursor-not-allowed ${
                source === s
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-muted hover:text-content'
              }`}
            >
              {SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Per-source coverage & limitations */}
      <p className="mb-3 text-xs text-muted">{SOURCE_INFO[source]}</p>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            className="w-full px-4 py-2 border border-line rounded-lg bg-panel-2 text-content placeholder-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || inputValue.trim().length === 0}
          className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-sm text-muted">Quick examples:</span>
        {examples.map((example) => (
          <button
            key={example.value}
            type="button"
            onClick={() => setInputValue(example.value)}
            className="text-sm px-3 py-1 bg-panel-2 hover:bg-panel-3 rounded-full text-content transition-colors"
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}
