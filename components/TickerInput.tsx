'use client';

import { useState, FormEvent } from 'react';

interface TickerInputProps {
  onSubmit: (tickers: string[]) => void;
  isLoading: boolean;
}

export default function TickerInput({ onSubmit, isLoading }: TickerInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const tickers = inputValue
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    if (tickers.length > 0) {
      onSubmit(tickers);
    }
  };

  const examples = [
    { label: 'USDPLN', value: 'USDPLN' },
    { label: 'WIG20', value: 'WIG20' },
    { label: 'BTC.V', value: 'BTC.V' },
    { label: 'IWDA.UK', value: 'IWDA.UK' },
    { label: 'VWRA.UK', value: 'VWRA.UK' },
    { label: 'EIMI.UK', value: 'EIMI.UK' },
    { label: 'CSPX.UK', value: 'CSPX.UK' },
    { label: 'VDTA.UK', value: 'VDTA.UK' },
    { label: 'ETFBM40TR.PL', value: 'ETFBM40TR.PL' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter tickers (e.g., USDPLN, IWDA.UK, WIG20)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || inputValue.trim().length === 0}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
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
        <span className="text-sm text-gray-500">Quick examples:</span>
        {examples.map((example) => (
          <button
            key={example.value}
            type="button"
            onClick={() => setInputValue(example.value)}
            className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}
