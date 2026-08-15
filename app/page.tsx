'use client';

import { useState, useMemo, useCallback } from 'react';
import TickerInput, { DataSource } from '@/components/TickerInput';
import CaptchaModal from '@/components/CaptchaModal';
import ThemeToggle from '@/components/ThemeToggle';
import { PriceBasis, tickersWithBasis, hasAdjClose } from '@/lib/priceBasis';
import PriceChart from '@/components/PriceChart';
import StatsPanel from '@/components/StatsPanel';
import DateRangeFilter from '@/components/DateRangeFilter';
import TrendFollowingSection from '@/components/TrendFollowingSection';
import RollingReturnsChart from '@/components/RollingReturnsChart';
import AnnualReturnsChart from '@/components/AnnualReturnsChart';
import ReturnsTable from '@/components/ReturnsTable';
import CorrelationTable from '@/components/CorrelationTable';
import { TickerData, ChartDataPoint, Statistics, ApiResponse } from '@/lib/types';
import {
  calculateStatistics,
  normalizeDataForChart,
  filterDataByDateRange,
  getDateRange,
  calculateReturnsTable,
  YearlyData,
} from '@/lib/statistics';

export default function Home() {
  // Raw data from API (never filtered)
  const [rawTickersData, setRawTickersData] = useState<TickerData[]>([]);

  // Date range state
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });

  // Available date range (from raw data)
  const [availableDateRange, setAvailableDateRange] = useState<{
    minDate: string;
    maxDate: string;
  }>({ minDate: '', maxDate: '' });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedTickerIndex, setFocusedTickerIndex] = useState(0);
  const [source, setSource] = useState<DataSource>('yahoo');
  // Source the currently loaded data actually came from (may differ from the
  // selected `source` if the user switches the toggle without reloading).
  const [dataSource, setDataSource] = useState<DataSource>('yahoo');
  const [priceBasis, setPriceBasis] = useState<PriceBasis>('close');

  // Stooq CAPTCHA flow state
  const [stooqSession, setStooqSession] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pendingTickers, setPendingTickers] = useState<string[] | null>(null);

  // Whether the loaded data supports adjusted close (Yahoo yes, Stooq no).
  const adjCloseAvailable = useMemo(() => hasAdjClose(rawTickersData), [rawTickersData]);

  // Re-express the raw data on the chosen price basis (close vs adjusted close)
  // before any filtering/analysis, so charts and statistics stay consistent.
  const basisTickersData = useMemo<TickerData[]>(
    () => tickersWithBasis(rawTickersData, priceBasis),
    [rawTickersData, priceBasis]
  );

  // Filter data based on selected date range
  const filteredTickersData = useMemo<TickerData[]>(() => {
    if (basisTickersData.length === 0 || !dateRange.start || !dateRange.end) {
      return basisTickersData;
    }

    return basisTickersData.map((tickerData) => ({
      ticker: tickerData.ticker,
      data: filterDataByDateRange(tickerData.data, dateRange.start, dateRange.end),
    }));
  }, [basisTickersData, dateRange]);

  // Calculate statistics from filtered data
  const statistics = useMemo<Statistics[]>(() => {
    if (filteredTickersData.length === 0) return [];

    return filteredTickersData
      .filter((td) => td.data.length >= 2)
      .map((tickerData) => calculateStatistics(tickerData.ticker, tickerData.data));
  }, [filteredTickersData]);

  // Calculate chart data from filtered data
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (filteredTickersData.length === 0) return [];
    return normalizeDataForChart(filteredTickersData);
  }, [filteredTickersData]);

  // Calculate returns table data for focused ticker
  const returnsTableData = useMemo<YearlyData[]>(() => {
    if (filteredTickersData.length === 0) return [];
    const idx = Math.min(focusedTickerIndex, filteredTickersData.length - 1);
    const data = filteredTickersData[idx]?.data || [];
    if (data.length === 0) return [];
    const result = calculateReturnsTable(data);
    return result.years;
  }, [filteredTickersData, focusedTickerIndex]);

  // Core loader. For Stooq it may return a "captcha required" result, in which
  // case we open the CAPTCHA modal and retry once solved (see handleCaptchaSolved).
  const loadTickers = useCallback(
    async (tickers: string[], selectedSource: DataSource, sessionToken?: string | null) => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          tickers: tickers.join(','),
          source: selectedSource,
        });
        if (selectedSource === 'stooq' && sessionToken) {
          params.set('session', sessionToken);
        }

        const response = await fetch(`/api/stooq?${params.toString()}`);
        const result: ApiResponse = await response.json();

        // Stooq needs a human CAPTCHA — remember the request and open the modal.
        if (result.captchaRequired && result.sessionToken) {
          setPendingTickers(tickers);
          setCaptchaToken(result.sessionToken);
          setIsLoading(false);
          return;
        }

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to fetch data');
        }

        const data = result.data;
        setRawTickersData(data);
        setDataSource(selectedSource);
        setFocusedTickerIndex(0);

        const { minDate, maxDate } = getDateRange(data);
        setAvailableDateRange({ minDate, maxDate });
        setDateRange({ start: minDate, end: maxDate });
      } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        setRawTickersData([]);
        setAvailableDateRange({ minDate: '', maxDate: '' });
        setDateRange({ start: '', end: '' });
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleSubmit = (tickers: string[], selectedSource: DataSource) => {
    loadTickers(tickers, selectedSource, stooqSession);
  };

  // CAPTCHA solved: session is now unlocked — keep the token and retry the request.
  const handleCaptchaSolved = () => {
    const token = captchaToken;
    const tickers = pendingTickers;
    setCaptchaToken(null);
    setPendingTickers(null);
    setStooqSession(token);
    if (tickers && token) {
      loadTickers(tickers, 'stooq', token);
    }
  };

  const handleCaptchaCancel = () => {
    setCaptchaToken(null);
    setPendingTickers(null);
  };

  const handleDateRangeChange = useCallback((startDate: string, endDate: string) => {
    setDateRange({ start: startDate, end: endDate });
  }, []);

  // Export the whole sourced (unfiltered) data to an Excel workbook.
  const [isDownloading, setIsDownloading] = useState(false);
  const handleDownloadExcel = useCallback(async () => {
    if (rawTickersData.length === 0) return;
    setIsDownloading(true);
    setError(null);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: rawTickersData }),
      });
      if (!response.ok) {
        const msg = await response.json().catch(() => ({}));
        throw new Error(msg.error || 'Failed to generate Excel file');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Filename: Ticker(s)_Source_StartDate_EndDate.xlsx
      const sourceName: Record<DataSource, string> = {
        yahoo: 'YahooFinance',
        google: 'GoogleFinance',
        stooq: 'Stooq',
        twelvedata: 'TwelveData',
        nbp: 'NBP',
        fred: 'FRED',
      };
      const { minDate, maxDate } = getDateRange(rawTickersData);
      const tickerPart = rawTickersData
        .map((t) => t.ticker)
        .join('_')
        .replace(/[:/\\?*|"<>]/g, '-'); // strip filename-invalid chars (e.g. WSE:WIG20)
      a.download = `${tickerPart}_${sourceName[dataSource]}_${minDate}_${maxDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate Excel file');
    } finally {
      setIsDownloading(false);
    }
  }, [rawTickersData, dataSource]);

  const tickers = filteredTickersData.map((td) => td.ticker);
  const hasData = rawTickersData.length > 0;

  // Focused asset for detail sections (used in both single and multi-ticker modes)
  const focusedIdx = Math.min(focusedTickerIndex, Math.max(tickers.length - 1, 0));
  const focusedTicker = tickers[focusedIdx] || '';
  const focusedData = filteredTickersData[focusedIdx]?.data || [];
  const rawFocusedData = basisTickersData[focusedIdx]?.data || [];

  return (
    <main className="min-h-screen bg-app">
      {/* Stooq CAPTCHA modal */}
      {captchaToken && (
        <CaptchaModal
          sessionToken={captchaToken}
          onSolved={handleCaptchaSolved}
          onCancel={handleCaptchaCancel}
        />
      )}

      {/* Header */}
      <header className="bg-panel shadow-sm border-b border-line">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-content">Asset Analyzer</h1>
            <p className="text-xs text-muted mt-1">
              Compare assets by entering several tickers separated by commas — e.g.{' '}
              <span className="font-mono text-content">AAPL, MSFT</span>. They&apos;re normalized to a common
              start (=100) on one chart; pick a &ldquo;Focus asset&rdquo; for the detailed stats below.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Ticker Input */}
        <TickerInput
          onSubmit={handleSubmit}
          isLoading={isLoading}
          source={source}
          onSourceChange={setSource}
        />

        {/* Date Range Filter - Only show when data is loaded */}
        {hasData && (
          <DateRangeFilter
            minDate={availableDateRange.minDate}
            maxDate={availableDateRange.maxDate}
            startDate={dateRange.start}
            endDate={dateRange.end}
            onRangeChange={handleDateRangeChange}
            disabled={isLoading}
            onDownloadExcel={handleDownloadExcel}
            isDownloading={isDownloading}
          />
        )}

        {/* Price basis toggle — only when the data has adjusted close (Yahoo) */}
        {hasData && adjCloseAvailable && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted">Price basis:</span>
            <div className="inline-flex rounded-lg border border-line p-0.5 bg-panel-2">
              {(['close', 'adjClose'] as PriceBasis[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setPriceBasis(b)}
                  disabled={isLoading}
                  className={`px-3 py-1 text-sm rounded-md font-medium transition-colors disabled:cursor-not-allowed ${
                    priceBasis === b
                      ? 'bg-gray-700 text-white shadow-sm'
                      : 'text-muted hover:text-content'
                  }`}
                >
                  {b === 'close' ? 'Close' : 'Adj Close'}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">
              Adjusted close reflects dividends &amp; splits — recommended for returns and drawdowns.
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-red-700 font-medium">Error</span>
            </div>
            <p className="mt-1 text-red-600">{error}</p>
          </div>
        )}

        {/* Chart and Stats Layout */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Chart Section - 80% on large screens */}
          <div className="flex-1 lg:w-4/5">
            <PriceChart
              data={chartData}
              tickers={tickers}
              tickersData={filteredTickersData}
              rawTickersData={basisTickersData}
            />
          </div>

          {/* Stats Panel - 20% on large screens */}
          <div className="lg:w-1/5 min-w-[280px]">
            <StatsPanel statistics={statistics} isLoading={isLoading} />
          </div>
        </div>

        {/* Correlation between assets - Only for multi-ticker */}
        {tickers.length > 1 && <CorrelationTable tickersData={filteredTickersData} />}

        {/* Focus asset selector - Only for multi-ticker */}
        {tickers.length > 1 && (
          <div className="mt-4 mb-2 flex items-center gap-2">
            <label className="text-sm font-medium text-content">Focus asset:</label>
            <select
              value={focusedTickerIndex}
              onChange={(e) => setFocusedTickerIndex(Number(e.target.value))}
              className="text-sm border border-line rounded px-2 py-1 bg-panel focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {tickers.map((t, i) => (
                <option key={t} value={i}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {/* Trend Following Section */}
        {tickers.length >= 1 && focusedData.length >= 252 && (
          <TrendFollowingSection
            data={focusedData}
            rawData={rawFocusedData}
            ticker={focusedTicker}
          />
        )}

        {/* Annual Returns Bar Chart */}
        {tickers.length >= 1 && returnsTableData.length > 0 && (
          <AnnualReturnsChart data={returnsTableData} ticker={focusedTicker} />
        )}

        {/* Rolling Returns Chart */}
        {tickers.length >= 1 && focusedData.length >= 252 && (
          <RollingReturnsChart data={focusedData} ticker={focusedTicker} />
        )}

        {/* Monthly Returns Table */}
        {tickers.length >= 1 && returnsTableData.length > 0 && (
          <ReturnsTable data={returnsTableData} ticker={focusedTicker} />
        )}

        {/* Footer Info */}
        <footer className="mt-8 text-center text-sm text-muted">
          <p>
            Data provided by{' '}
            <a
              href="https://finance.yahoo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Yahoo Finance
            </a>{' '}
            and{' '}
            <a
              href="https://stooq.pl"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              stooq.pl
            </a>
          </p>
          <p className="mt-1">
            {source === 'yahoo'
              ? 'Yahoo examples: KGH.WA (stocks), USDPLN=X (FX), BTC-USD (crypto), IWDA.L (ETFs), or an ISIN (e.g. LU1662497327)'
              : source === 'twelvedata'
              ? 'Twelve Data examples: AAPL, MSFT, QQQ (US), BTC-USD (crypto), USDPLN=X (FX). Needs a free API key.'
              : source === 'google'
              ? 'Google Finance examples: WSE:WIG20, WSE:ETFBM40TR (Warsaw), LON:VWRA (London), NYSEARCA:GLD (US), CURRENCY:BTCUSD. Via a Google Sheets proxy.'
              : source === 'fred'
              ? 'FRED examples: CPIAUCSL (US CPI), NASDAQCOM (index since 1971), M2SL (money supply), DGS10 (10y yield), UNRATE, GDPC1. Economic data, no API key.'
              : source === 'nbp'
              ? 'NBP examples: USDPLN, EURPLN, CHFPLN (table A vs PLN), XAUPLN (gold, PLN per gram), EURUSD (cross), PLNUSD (inverse). Official rates, no API key.'
              : 'Stooq examples: USDPLN (currencies), IWDA.UK (ETFs), WIG20 (Polish index), BTC.V (crypto)'}
          </p>
        </footer>
      </div>
    </main>
  );
}
