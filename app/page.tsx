'use client';

import { useState, useMemo, useCallback } from 'react';
import TickerInput from '@/components/TickerInput';
import PriceChart from '@/components/PriceChart';
import StatsPanel from '@/components/StatsPanel';
import DateRangeFilter from '@/components/DateRangeFilter';
import TrendFollowingSection from '@/components/TrendFollowingSection';
import RollingReturnsChart from '@/components/RollingReturnsChart';
import AnnualReturnsChart from '@/components/AnnualReturnsChart';
import ReturnsTable from '@/components/ReturnsTable';
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

  // Filter data based on selected date range
  const filteredTickersData = useMemo<TickerData[]>(() => {
    if (rawTickersData.length === 0 || !dateRange.start || !dateRange.end) {
      return rawTickersData;
    }

    return rawTickersData.map((tickerData) => ({
      ticker: tickerData.ticker,
      data: filterDataByDateRange(tickerData.data, dateRange.start, dateRange.end),
    }));
  }, [rawTickersData, dateRange]);

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

  const handleSubmit = async (tickers: string[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stooq?tickers=${encodeURIComponent(tickers.join(','))}`);
      const result: ApiResponse = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch data');
      }

      const data = result.data;
      setRawTickersData(data);
      setFocusedTickerIndex(0);

      // Calculate available date range
      const { minDate, maxDate } = getDateRange(data);
      setAvailableDateRange({ minDate, maxDate });

      // Initialize date range to full range
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
  };

  const handleDateRangeChange = useCallback((startDate: string, endDate: string) => {
    setDateRange({ start: startDate, end: endDate });
  }, []);

  const tickers = filteredTickersData.map((td) => td.ticker);
  const hasData = rawTickersData.length > 0;

  // Focused asset for detail sections (used in both single and multi-ticker modes)
  const focusedIdx = Math.min(focusedTickerIndex, Math.max(tickers.length - 1, 0));
  const focusedTicker = tickers[focusedIdx] || '';
  const focusedData = filteredTickersData[focusedIdx]?.data || [];

  return (
    <main className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Stooq Analyzer</h1>
          <p className="text-sm text-gray-500">Stock and asset analytics with comprehensive statistics</p>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Ticker Input */}
        <TickerInput onSubmit={handleSubmit} isLoading={isLoading} />

        {/* Date Range Filter - Only show when data is loaded */}
        {hasData && (
          <DateRangeFilter
            minDate={availableDateRange.minDate}
            maxDate={availableDateRange.maxDate}
            startDate={dateRange.start}
            endDate={dateRange.end}
            onRangeChange={handleDateRangeChange}
            disabled={isLoading}
          />
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
              rawTickersData={rawTickersData}
            />
          </div>

          {/* Stats Panel - 20% on large screens */}
          <div className="lg:w-1/5 min-w-[280px]">
            <StatsPanel statistics={statistics} isLoading={isLoading} />
          </div>
        </div>

        {/* Focus asset selector - Only for multi-ticker */}
        {tickers.length > 1 && (
          <div className="mt-4 mb-2 flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Focus asset:</label>
            <select
              value={focusedTickerIndex}
              onChange={(e) => setFocusedTickerIndex(Number(e.target.value))}
              className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <footer className="mt-8 text-center text-sm text-gray-500">
          <p>
            Data provided by{' '}
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
            Ticker examples: USDPLN (currencies), IWDA.UK (ETFs), WIG20 (Polish index), BTC.V (crypto)
          </p>
        </footer>
      </div>
    </main>
  );
}
