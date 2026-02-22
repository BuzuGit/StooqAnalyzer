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
  Legend,
  Label,
} from 'recharts';
import { ChartDataPoint, TickerData } from '@/lib/types';
import { findExtremes, calculateDrawdownSeries, calculateSMA } from '@/lib/statistics';
import DrawdownChart from './DrawdownChart';

interface PriceChartProps {
  data: ChartDataPoint[];
  tickers: string[];
  tickersData: TickerData[];
  rawTickersData: TickerData[];
}

const COLORS = [
  '#000000', // black (primary asset)
  '#2563eb', // blue (second asset)
  '#16a34a', // green
  '#9333ea', // purple
  '#ea580c', // orange
  '#0891b2', // cyan
  '#4f46e5', // indigo
  '#be185d', // pink
];

// Custom label component for price annotations
function PriceLabel({
  viewBox,
  value,
  color,
  position = 'top',
}: {
  viewBox?: { x: number; y: number };
  value: string;
  color: string;
  position?: 'top' | 'bottom';
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const offsetY = position === 'top' ? -10 : 18;

  return (
    <text
      x={x}
      y={y + offsetY}
      fill={color}
      fontSize={10}
      fontWeight="500"
      textAnchor="middle"
    >
      {value}
    </text>
  );
}

// Custom component for current price bubble
function CurrentPriceBubble({
  viewBox,
  value,
}: {
  viewBox?: { x: number; y: number; width: number };
  value: string;
}) {
  if (!viewBox) return null;
  const { x, y, width = 0 } = viewBox;
  const bubbleX = x + width + 5;
  // Dynamic width based on text length (approx 7px per character + padding)
  const bubbleWidth = Math.max(value.length * 7 + 12, 35);

  return (
    <g>
      <rect
        x={bubbleX}
        y={y - 10}
        width={bubbleWidth}
        height={20}
        rx={4}
        fill="#000000"
      />
      <text
        x={bubbleX + bubbleWidth / 2}
        y={y + 4}
        fill="white"
        fontSize={10}
        fontWeight="500"
        textAnchor="middle"
      >
        {value}
      </text>
    </g>
  );
}

// Custom component for SMA bubble at end of line, with vertical offset to avoid overlap
function SMABubble({
  viewBox,
  value,
  color,
  slotIndex = 0,
}: {
  viewBox?: { x: number; y: number; width: number };
  value: string;
  color: string;
  slotIndex?: number;
}) {
  if (!viewBox) return null;
  const { x, width = 0 } = viewBox;
  const bubbleX = x + width + 5;
  const bubbleWidth = Math.max(value.length * 7 + 12, 35);
  // Stack below the price bubble: slot 0 = just below price, slot 1 = next row
  const bubbleY = viewBox.y + 14 + slotIndex * 22;

  return (
    <g>
      <rect
        x={bubbleX}
        y={bubbleY - 10}
        width={bubbleWidth}
        height={20}
        rx={4}
        fill={color}
      />
      <text
        x={bubbleX + bubbleWidth / 2}
        y={bubbleY + 4}
        fill="white"
        fontSize={10}
        fontWeight="500"
        textAnchor="middle"
      >
        {value}
      </text>
    </g>
  );
}

export default function PriceChart({ data, tickers, tickersData, rawTickersData }: PriceChartProps) {
  const [show50SMA, setShow50SMA] = useState(false);
  const [show200SMA, setShow200SMA] = useState(false);

  const isSingleTicker = tickers.length === 1;
  const primaryTicker = tickers[0];
  const primaryData = useMemo(
    () => tickersData.find(t => t.ticker === primaryTicker)?.data || [],
    [tickersData, primaryTicker]
  );

  // Full unfiltered data for SMA calculation (so SMA is "warmed up" before visible range)
  const rawPrimaryData = useMemo(
    () => rawTickersData.find(t => t.ticker === primaryTicker)?.data || [],
    [rawTickersData, primaryTicker]
  );

  // Calculate SMA from full history, then merge into filtered chart data
  const chartDataWithSMA = useMemo(() => {
    if (!isSingleTicker || (!show50SMA && !show200SMA)) {
      return data;
    }

    const sma50Data = show50SMA ? calculateSMA(rawPrimaryData, 50) : [];
    const sma200Data = show200SMA ? calculateSMA(rawPrimaryData, 200) : [];

    const sma50Map = new Map(sma50Data.map(d => [d.date, d.sma]));
    const sma200Map = new Map(sma200Data.map(d => [d.date, d.sma]));

    return data.map(point => {
      const newPoint = { ...point };
      if (show50SMA) {
        const val = sma50Map.get(point.date);
        if (val !== null && val !== undefined) {
          newPoint.sma50 = val;
        }
      }
      if (show200SMA) {
        const val = sma200Map.get(point.date);
        if (val !== null && val !== undefined) {
          newPoint.sma200 = val;
        }
      }
      return newPoint;
    });
  }, [data, rawPrimaryData, isSingleTicker, show50SMA, show200SMA]);

  // Calculate drawdown series for multi-ticker mode
  const multiDrawdownData = useMemo(() => {
    if (isSingleTicker) return undefined;
    return tickersData
      .filter(td => td.data.length > 0)
      .map((td, index) => ({
        ticker: td.ticker,
        data: calculateDrawdownSeries(td.data).data,
        color: COLORS[index % COLORS.length],
      }));
  }, [isSingleTicker, tickersData]);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 flex items-center justify-center h-96">
        <p className="text-gray-500">Enter tickers above to see the chart</p>
      </div>
    );
  }

  // Find extreme points for markers
  const extremes = isSingleTicker && primaryData.length > 0
    ? findExtremes(primaryData)
    : null;

  // Calculate drawdown series for single ticker
  const drawdownSeries = isSingleTicker && primaryData.length > 0
    ? calculateDrawdownSeries(primaryData)
    : null;

  // Get current price and last date
  const currentPrice = isSingleTicker && primaryData.length > 0
    ? primaryData[primaryData.length - 1].close
    : null;

  const lastDate = data.length > 0 ? data[data.length - 1].date : null;
  const firstDate = data.length > 0 ? data[0].date : null;

  // Get latest SMA values for bubbles
  const lastSMA50 = show50SMA && chartDataWithSMA.length > 0
    ? (chartDataWithSMA[chartDataWithSMA.length - 1] as Record<string, unknown>).sma50 as number | undefined
    : undefined;
  const lastSMA200 = show200SMA && chartDataWithSMA.length > 0
    ? (chartDataWithSMA[chartDataWithSMA.length - 1] as Record<string, unknown>).sma200 as number | undefined
    : undefined;

  // Calculate date range in days to determine X axis format
  const dateRangeDays = firstDate && lastDate
    ? Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const dateRangeYears = dateRangeDays / 365;
  const isShortRange = dateRangeDays <= 93; // ~3 months
  const isLongRange = dateRangeDays > 365 * 5; // > 5 years

  // Generate custom ticks for long range (yearly ticks)
  const getYearlyTicks = () => {
    if (!firstDate || !lastDate || !isLongRange) return undefined;

    const startYear = new Date(firstDate).getFullYear();
    const endYear = new Date(lastDate).getFullYear();
    const ticks: string[] = [];

    for (let year = startYear; year <= endYear; year++) {
      // Find the first data point in this year
      const yearDate = data.find(d => new Date(d.date).getFullYear() === year)?.date;
      if (yearDate && !ticks.includes(yearDate)) {
        ticks.push(yearDate);
      }
    }
    return ticks;
  };
  const yearlyTicks = getYearlyTicks();

  // Tick count for non-yearly views
  const tickCount = 8;

  // Format price for display - dynamic decimal places
  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return price.toFixed(0);
    }
    if (price >= 100) {
      return price.toFixed(1);
    }
    if (price >= 1) {
      return price.toFixed(2);
    }
    return price.toFixed(3);
  };

  // Format large numbers for Y axis
  const formatYAxis = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(2);
  };

  // Format tooltip
  const formatTooltip = (value: number, name: string) => {
    if (name === 'sma50') return [value.toFixed(4), '50 SMA'];
    if (name === 'sma200') return [value.toFixed(4), '200 SMA'];
    if (isSingleTicker) {
      return [value.toFixed(4), name];
    }
    return [`${value.toFixed(2)}%`, name];
  };

  // Format date for X axis - dynamic based on date range
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatDateAxis = (date: string) => {
    const d = new Date(date);
    if (isShortRange) {
      // Short range (<= 3 months): show "15 Jan" format
      return `${d.getDate()} ${months[d.getMonth()]}`;
    }
    if (isLongRange) {
      // Long range (> 5 years): show year only "2024"
      return d.getFullYear().toString();
    }
    // Medium range: show "Jan25" format
    return `${months[d.getMonth()]}${d.getFullYear().toString().slice(-2)}`;
  };

  // Whether to show X axis on price chart (hide if drawdown chart is shown below)
  const hasDrawdown = (isSingleTicker && drawdownSeries && drawdownSeries.data.length > 0) ||
    (!isSingleTicker && multiDrawdownData && multiDrawdownData.length > 0);
  const showPriceChartXAxis = !hasDrawdown;

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-800">
            {isSingleTicker ? `${primaryTicker} Price & Drawdown` : 'Normalized Comparison (Base = 100)'}
          </h2>
          {isSingleTicker && (
            <div className="flex gap-1 ml-2">
              <button
                onClick={() => setShow50SMA(!show50SMA)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  show50SMA
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                }`}
              >
                50SMA
              </button>
              <button
                onClick={() => setShow200SMA(!show200SMA)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  show200SMA
                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                    : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                }`}
              >
                200SMA
              </button>
            </div>
          )}
        </div>
        {!isSingleTicker && (
          <p className="text-sm text-gray-500">All series normalized to 100 at common start date</p>
        )}
      </div>

      <div className={hasDrawdown ? "h-80" : "h-96"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartDataWithSMA}
            margin={{ top: 30, right: 55, left: 0, bottom: 0 }}
            syncId="stockChart"
          >
            <defs>
              {tickers.map((ticker, index) => (
                <linearGradient
                  key={`gradient-${ticker}`}
                  id={`gradient-${ticker}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={COLORS[index % COLORS.length]}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={COLORS[index % COLORS.length]}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={showPriceChartXAxis ? { fontSize: 11, fill: '#6b7280' } : false}
              tickFormatter={formatDateAxis}
              ticks={yearlyTicks}
              tickCount={yearlyTicks ? undefined : tickCount}
              axisLine={showPriceChartXAxis}
              tickLine={showPriceChartXAxis}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={formatYAxis}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              labelFormatter={(date) => new Date(date).toLocaleDateString()}
              formatter={formatTooltip}
            />
            {tickers.length > 1 && <Legend />}

            {tickers.map((ticker, index) => (
              <Area
                key={ticker}
                type="monotone"
                dataKey={ticker}
                stroke={COLORS[index % COLORS.length]}
                fill={`url(#gradient-${ticker})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}

            {/* 50-day SMA line */}
            {show50SMA && isSingleTicker && (
              <Line
                type="monotone"
                dataKey="sma50"
                stroke="#dc2626"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                connectNulls
                name="50 SMA"
              />
            )}

            {/* 200-day SMA line */}
            {show200SMA && isSingleTicker && (
              <Line
                type="monotone"
                dataKey="sma200"
                stroke="#eab308"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                connectNulls
                name="200 SMA"
              />
            )}

            {/* SMA bubbles stacked below price bubble */}
            {show50SMA && isSingleTicker && lastDate && currentPrice && lastSMA50 !== undefined && (
              <ReferenceDot x={lastDate} y={currentPrice} r={0}>
                <Label
                  content={
                    <SMABubble value={formatPrice(lastSMA50)} color="#dc2626" slotIndex={0} />
                  }
                />
              </ReferenceDot>
            )}

            {show200SMA && isSingleTicker && lastDate && currentPrice && lastSMA200 !== undefined && (
              <ReferenceDot x={lastDate} y={currentPrice} r={0}>
                <Label
                  content={
                    <SMABubble value={formatPrice(lastSMA200)} color="#eab308" slotIndex={show50SMA ? 1 : 0} />
                  }
                />
              </ReferenceDot>
            )}

            {/* High point marker with label */}
            {extremes && (
              <ReferenceDot
                x={extremes.highPoint.date}
                y={extremes.highPoint.price}
                r={5}
                fill="#16a34a"
                stroke="white"
                strokeWidth={2}
              >
                <Label
                  content={
                    <PriceLabel
                      value={formatPrice(extremes.highPoint.price)}
                      color="#16a34a"
                      position="top"
                    />
                  }
                />
              </ReferenceDot>
            )}

            {/* Low point marker with label */}
            {extremes && (
              <ReferenceDot
                x={extremes.lowPoint.date}
                y={extremes.lowPoint.price}
                r={5}
                fill="#dc2626"
                stroke="white"
                strokeWidth={2}
              >
                <Label
                  content={
                    <PriceLabel
                      value={formatPrice(extremes.lowPoint.price)}
                      color="#dc2626"
                      position="bottom"
                    />
                  }
                />
              </ReferenceDot>
            )}

            {/* Current price bubble at the end */}
            {isSingleTicker && currentPrice && lastDate && (
              <ReferenceDot
                x={lastDate}
                y={currentPrice}
                r={0}
              >
                <Label
                  content={
                    <CurrentPriceBubble value={formatPrice(currentPrice)} />
                  }
                />
              </ReferenceDot>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown Chart - single ticker */}
      {isSingleTicker && drawdownSeries && drawdownSeries.data.length > 0 && (
        <DrawdownChart
          data={drawdownSeries.data}
          maxDrawdown={drawdownSeries.maxDrawdown}
          maxDrawdownDate={drawdownSeries.maxDrawdownDate}
          currentDrawdown={drawdownSeries.currentDrawdown}
          isShortRange={isShortRange}
          isLongRange={isLongRange}
          tickCount={tickCount}
          yearlyTicks={yearlyTicks}
        />
      )}

      {/* Drawdown Chart - multi ticker */}
      {!isSingleTicker && multiDrawdownData && multiDrawdownData.length > 0 && (
        <DrawdownChart
          data={[]}
          maxDrawdown={0}
          maxDrawdownDate=""
          currentDrawdown={0}
          isShortRange={isShortRange}
          isLongRange={isLongRange}
          tickCount={tickCount}
          yearlyTicks={yearlyTicks}
          multiData={multiDrawdownData}
        />
      )}
    </div>
  );
}
