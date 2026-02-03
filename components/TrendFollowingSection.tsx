'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceLine,
  Legend,
} from 'recharts';
import { StooqDataPoint, TrendSignal } from '@/lib/types';
import { calculateTrendFollowingAnalysis } from '@/lib/statistics';

interface TrendFollowingSectionProps {
  data: StooqDataPoint[];  // Raw price data
  ticker: string;
}

// Risk-free rate options (0% to 5%, 0.5% increments)
const RISK_FREE_RATE_OPTIONS = [
  { value: 0.00, label: '0.0%' },
  { value: 0.005, label: '0.5%' },
  { value: 0.01, label: '1.0%' },
  { value: 0.015, label: '1.5%' },
  { value: 0.02, label: '2.0%' },
  { value: 0.025, label: '2.5%' },
  { value: 0.03, label: '3.0%' },
  { value: 0.035, label: '3.5%' },
  { value: 0.04, label: '4.0%' },
  { value: 0.045, label: '4.5%' },
  { value: 0.05, label: '5.0%' },
];

// Commission options (0% to 0.5%, 0.05% increments)
const COMMISSION_OPTIONS = [
  { value: 0.00, label: '0.00%' },
  { value: 0.0005, label: '0.05%' },
  { value: 0.001, label: '0.10%' },
  { value: 0.0015, label: '0.15%' },
  { value: 0.002, label: '0.20%' },
  { value: 0.0025, label: '0.25%' },
  { value: 0.003, label: '0.30%' },
  { value: 0.0035, label: '0.35%' },
  { value: 0.004, label: '0.40%' },
  { value: 0.0045, label: '0.45%' },
  { value: 0.005, label: '0.50%' },
];

// Format date for X axis
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateAxis(date: string, isShortRange: boolean, isLongRange: boolean): string {
  const d = new Date(date);
  if (isShortRange) {
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }
  if (isLongRange) {
    return d.getFullYear().toString();
  }
  return `${months[d.getMonth()]}${d.getFullYear().toString().slice(-2)}`;
}

// Custom tooltip for growth chart
function GrowthTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const date = new Date(label).toLocaleDateString();
  const buyHold = payload.find((p: any) => p.dataKey === 'buyHold');
  const trendFollowing = payload.find((p: any) => p.dataKey === 'trendFollowing');
  const sma10 = payload.find((p: any) => p.dataKey === 'sma10');
  const signal = payload[0]?.payload?.signal;

  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        padding: '8px 12px',
        fontSize: '12px',
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{date}</div>
      {buyHold && (
        <div style={{ color: '#2563eb' }}>
          Buy & Hold: ${buyHold.value.toFixed(2)}
        </div>
      )}
      {trendFollowing && (
        <div style={{ color: '#16a34a' }}>
          Trend Following: ${trendFollowing.value.toFixed(2)}
        </div>
      )}
      {sma10 && sma10.value !== null && (
        <div style={{ color: '#9ca3af' }}>
          10m-SMA: ${sma10.value.toFixed(2)}
        </div>
      )}
      {signal && (
        <div style={{ color: signal === 'BUY' ? '#16a34a' : '#ef4444', marginTop: 4 }}>
          Signal: {signal === 'BUY' ? 'INVESTED' : 'OUT'}
        </div>
      )}
    </div>
  );
}

// Custom tooltip for drawdown chart
function DrawdownTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const date = new Date(label).toLocaleDateString();
  const buyHold = payload.find((p: any) => p.dataKey === 'buyHoldDrawdown');
  const trendFollowing = payload.find((p: any) => p.dataKey === 'trendFollowingDrawdown');

  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        padding: '8px 12px',
        fontSize: '12px',
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{date}</div>
      {buyHold && (
        <div style={{ color: '#2563eb' }}>
          Buy & Hold: {buyHold.value.toFixed(2)}%
        </div>
      )}
      {trendFollowing && (
        <div style={{ color: '#16a34a' }}>
          Trend Following: {trendFollowing.value.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

// Statistics comparison table row
function StatRow({
  label,
  buyHold,
  trendFollowing,
  format = 'percent',
  higherIsBetter = true,
}: {
  label: string;
  buyHold: number;
  trendFollowing: number;
  format?: 'percent' | 'ratio' | 'dollar';
  higherIsBetter?: boolean;
}) {
  const formatValue = (value: number) => {
    switch (format) {
      case 'dollar':
        return `$${value.toFixed(2)}`;
      case 'ratio':
        return value.toFixed(2);
      case 'percent':
      default:
        return `${value >= 0 ? '' : ''}${value.toFixed(2)}%`;
    }
  };

  const isBuyHoldBetter = higherIsBetter
    ? buyHold > trendFollowing
    : buyHold < trendFollowing;
  const isTrendBetter = !isBuyHoldBetter && buyHold !== trendFollowing;

  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-2 px-3 text-gray-600 text-sm">{label}</td>
      <td
        className={`py-2 px-3 text-sm text-right font-medium ${
          isBuyHoldBetter ? 'text-blue-600' : 'text-gray-700'
        }`}
      >
        {formatValue(buyHold)}
      </td>
      <td
        className={`py-2 px-3 text-sm text-right font-medium ${
          isTrendBetter ? 'text-green-600' : 'text-gray-700'
        }`}
      >
        {formatValue(trendFollowing)}
      </td>
    </tr>
  );
}

export default function TrendFollowingSection({
  data,
  ticker,
}: TrendFollowingSectionProps) {
  // Local state for configurable parameters
  const [riskFreeRate, setRiskFreeRate] = useState(0.02);
  const [commission, setCommission] = useState(0.002);

  // Calculate analysis with current parameters
  const analysis = useMemo(() => {
    return calculateTrendFollowingAnalysis(data, riskFreeRate, commission);
  }, [data, riskFreeRate, commission]);

  // Calculate signal statistics (memoized for efficiency)
  // Must be before early return to satisfy React hooks rules
  const signalStats = useMemo(() => {
    if (!analysis || analysis.chartData.length === 0) {
      return { buySignals: 0, sellSignals: 0, successfulRoundTrips: 0, totalRoundTrips: 0, successRate: null };
    }

    const { signalDates, chartData } = analysis;
    const buySignals = signalDates.filter(s => s.signal === 'BUY').length;
    const sellSignals = signalDates.filter(s => s.signal === 'SELL').length;

    // Calculate success rate (SELL→BUY pairs where buy price < sell price)
    let successfulRoundTrips = 0;
    let totalRoundTrips = 0;
    let lastSellPrice: number | null = null;

    // Build a date->price map for O(1) lookups instead of O(n) find()
    const priceByDate = new Map(chartData.map(d => [d.date, d.buyHold]));

    for (const signal of signalDates) {
      const price = priceByDate.get(signal.date);
      if (price === undefined) continue;

      if (signal.signal === 'SELL') {
        lastSellPrice = price;
      } else if (signal.signal === 'BUY' && lastSellPrice !== null) {
        totalRoundTrips++;
        if (price < lastSellPrice) {
          successfulRoundTrips++;
        }
        lastSellPrice = null;
      }
    }

    const successRate = totalRoundTrips > 0
      ? (successfulRoundTrips / totalRoundTrips) * 100
      : null;

    return { buySignals, sellSignals, successfulRoundTrips, totalRoundTrips, successRate };
  }, [analysis]);

  if (!analysis || analysis.chartData.length === 0) {
    return null;
  }

  const { chartData, drawdownData, buyHoldStats, trendFollowingStats, currentSignal, signalDates } =
    analysis;

  // Calculate date range for formatting
  const firstDate = chartData[0].date;
  const lastDate = chartData[chartData.length - 1].date;
  const dateRangeDays = Math.ceil(
    (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const isShortRange = dateRangeDays <= 93;
  const isLongRange = dateRangeDays > 365 * 5;

  // Format dates for display in header
  const formatHeaderDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  };
  const displayDateRange = `${formatHeaderDate(firstDate)} - ${formatHeaderDate(lastDate)}`;

  // Generate yearly ticks for long range
  const getYearlyTicks = () => {
    if (!isLongRange) return undefined;

    const startYear = new Date(firstDate).getFullYear();
    const endYear = new Date(lastDate).getFullYear();
    const ticks: string[] = [];

    for (let year = startYear; year <= endYear; year++) {
      const yearDate = chartData.find((d) => new Date(d.date).getFullYear() === year)?.date;
      if (yearDate && !ticks.includes(yearDate)) {
        ticks.push(yearDate);
      }
    }
    return ticks;
  };
  const yearlyTicks = getYearlyTicks();
  const tickCount = 8;

  // Find signal change points for markers (limit to avoid clutter)
  const signalChanges = signalDates.slice(-20); // Show last 20 signal changes max

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-4">
      {/* Header */}
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold text-gray-800">
            {ticker} Buy & Hold vs Trend Following (10m-SMA)
          </h2>
          <span className="text-sm text-gray-500">
            {displayDateRange}
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Growth of $1 comparing passive investing to a 10-month moving average strategy.
          <span className="text-gray-400 ml-1">
            Note: Analysis starts after 10 months (required to calculate initial SMA).
          </span>
        </p>
        {/* Signal Statistics */}
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <div className="font-medium text-gray-700">
            Signals: <span className="text-green-600">{signalStats.buySignals} buy</span>, <span className="text-red-600">{signalStats.sellSignals} sell</span>
          </div>
          {signalStats.successRate !== null && (
            <div className="font-medium text-gray-700">
              Success rate: {signalStats.successRate.toFixed(0)}%
              <span className="text-gray-500 font-normal ml-1">
                ({signalStats.successfulRoundTrips} of {signalStats.totalRoundTrips})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Parameter Controls */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Risk-free rate:</label>
          <select
            value={riskFreeRate}
            onChange={(e) => setRiskFreeRate(parseFloat(e.target.value))}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {RISK_FREE_RATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Commission:</label>
          <select
            value={commission}
            onChange={(e) => setCommission(parseFloat(e.target.value))}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {COMMISSION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-blue-600"></div>
          <span className="text-gray-600">Buy & Hold</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-green-600"></div>
          <span className="text-gray-600">Trend Following</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-gray-400" style={{ borderTop: '1px dashed #9ca3af' }}></div>
          <span className="text-gray-600">10m-SMA</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span className="text-gray-600">Buy Signal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          <span className="text-gray-600">Sell Signal</span>
        </div>
      </div>

      {/* Growth Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 55, left: 0, bottom: 0 }}
            syncId="trendChart"
          >
            <defs>
              <linearGradient id="buyHoldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(date) => formatDateAxis(date, isShortRange, isLongRange)}
              ticks={yearlyTicks}
              tickCount={yearlyTicks ? undefined : tickCount}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={(value) => `$${value.toFixed(1)}`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<GrowthTooltip />} />

            {/* Buy & Hold Area */}
            <Area
              type="monotone"
              dataKey="buyHold"
              stroke="#2563eb"
              fill="url(#buyHoldGradient)"
              strokeWidth={2}
              dot={false}
              name="Buy & Hold"
            />

            {/* Trend Following Line */}
            <Line
              type="monotone"
              dataKey="trendFollowing"
              stroke="#16a34a"
              strokeWidth={2}
              dot={false}
              name="Trend Following"
            />

            {/* 10m-SMA Line (grey, thin, dashed) */}
            <Line
              type="monotone"
              dataKey="sma10"
              stroke="#9ca3af"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="10m-SMA"
              connectNulls
            />

            {/* Signal change markers on Buy & Hold line */}
            {signalChanges.map((sc, idx) => {
              const dataPoint = chartData.find((d) => d.date === sc.date);
              if (!dataPoint) return null;
              return (
                <ReferenceDot
                  key={`signal-${idx}`}
                  x={sc.date}
                  y={dataPoint.buyHold}
                  r={4}
                  fill={sc.signal === 'BUY' ? '#22c55e' : '#ef4444'}
                  stroke="white"
                  strokeWidth={1.5}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown Comparison Chart */}
      <div className="h-36 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={drawdownData}
            margin={{ top: 5, right: 55, left: 0, bottom: 0 }}
            syncId="trendChart"
          >
            <defs>
              <linearGradient id="buyHoldDDGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="trendDDGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(date) => formatDateAxis(date, isShortRange, isLongRange)}
              ticks={yearlyTicks}
              tickCount={yearlyTicks ? undefined : tickCount}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              domain={['auto', 0]}
            />
            <Tooltip content={<DrawdownTooltip />} />
            <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

            {/* Buy & Hold Drawdown */}
            <Area
              type="monotone"
              dataKey="buyHoldDrawdown"
              stroke="#2563eb"
              fill="url(#buyHoldDDGradient)"
              strokeWidth={1.5}
              dot={false}
              name="Buy & Hold DD"
            />

            {/* Trend Following Drawdown */}
            <Area
              type="monotone"
              dataKey="trendFollowingDrawdown"
              stroke="#16a34a"
              fill="url(#trendDDGradient)"
              strokeWidth={1.5}
              dot={false}
              name="Trend Following DD"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Statistics Comparison Table */}
      <div className="mt-4 flex flex-col lg:flex-row gap-4">
        {/* Stats Table */}
        <div className="flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-3 text-left font-medium text-gray-700">Metric</th>
                <th className="py-2 px-3 text-right font-medium text-blue-600">Buy & Hold</th>
                <th className="py-2 px-3 text-right font-medium text-green-600">
                  Trend Following
                </th>
              </tr>
            </thead>
            <tbody className="bg-white">
              <StatRow
                label="Final Amount"
                buyHold={buyHoldStats.finalAmount}
                trendFollowing={trendFollowingStats.finalAmount}
                format="dollar"
                higherIsBetter={true}
              />
              <StatRow
                label="CAGR"
                buyHold={buyHoldStats.cagr}
                trendFollowing={trendFollowingStats.cagr}
                format="percent"
                higherIsBetter={true}
              />
              <StatRow
                label="Total Return"
                buyHold={buyHoldStats.totalReturn}
                trendFollowing={trendFollowingStats.totalReturn}
                format="percent"
                higherIsBetter={true}
              />
              <StatRow
                label="Std Dev (Ann.)"
                buyHold={buyHoldStats.annualizedStd}
                trendFollowing={trendFollowingStats.annualizedStd}
                format="percent"
                higherIsBetter={false}
              />
              <StatRow
                label="Max Drawdown"
                buyHold={-buyHoldStats.maxDrawdown}
                trendFollowing={-trendFollowingStats.maxDrawdown}
                format="percent"
                higherIsBetter={true}
              />
              <StatRow
                label="Current Drawdown"
                buyHold={-buyHoldStats.currentDrawdown}
                trendFollowing={-trendFollowingStats.currentDrawdown}
                format="percent"
                higherIsBetter={true}
              />
              <StatRow
                label="Sharpe Ratio"
                buyHold={buyHoldStats.sharpeRatio}
                trendFollowing={trendFollowingStats.sharpeRatio}
                format="ratio"
                higherIsBetter={true}
              />
            </tbody>
          </table>
        </div>

        {/* Current Signal Indicator */}
        <div className="lg:w-48">
          <div className="bg-gray-50 rounded-lg p-4 h-full flex flex-col justify-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              Current Signal
            </div>
            <div
              className={`text-lg font-bold ${
                currentSignal === 'BUY' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {currentSignal === 'BUY' ? 'INVESTED' : 'OUT OF MARKET'}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Strategy earns{' '}
              {currentSignal === 'BUY' ? 'market returns' : `${(riskFreeRate * 100).toFixed(1)}% annual (risk-free)`} when{' '}
              {currentSignal === 'BUY' ? 'invested' : 'out'}
            </div>
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="mt-4 text-xs text-gray-500">
        Strategy: Buy when price {'>'} 10-month SMA at month-end, sell when price {'<'} 10-month
        SMA. When out of market, earns {(riskFreeRate * 100).toFixed(1)}% annual risk-free rate.
        {commission > 0 && ` Commission of ${(commission * 100).toFixed(2)}% applied on each signal change.`}
      </div>
    </div>
  );
}
