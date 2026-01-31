'use client';

import {
  AreaChart,
  Area,
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
import { findExtremes, calculateDrawdownSeries } from '@/lib/statistics';
import DrawdownChart from './DrawdownChart';

interface PriceChartProps {
  data: ChartDataPoint[];
  tickers: string[];
  tickersData: TickerData[];
}

const COLORS = [
  '#2563eb', // blue
  '#dc2626', // red
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
  const { x, y, width } = viewBox;
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
        fill="#2563eb"
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

export default function PriceChart({ data, tickers, tickersData }: PriceChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 flex items-center justify-center h-96">
        <p className="text-gray-500">Enter tickers above to see the chart</p>
      </div>
    );
  }

  const isSingleTicker = tickers.length === 1;
  const primaryTicker = tickers[0];
  const primaryData = tickersData.find(t => t.ticker === primaryTicker)?.data || [];

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
  const showPriceChartXAxis = !isSingleTicker || !drawdownSeries || drawdownSeries.data.length === 0;

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          {isSingleTicker ? `${primaryTicker} Price & Drawdown` : 'Normalized Comparison (Base = 100)'}
        </h2>
        {!isSingleTicker && (
          <p className="text-sm text-gray-500">All series normalized to 100 at common start date</p>
        )}
      </div>

      <div className={isSingleTicker && drawdownSeries ? "h-80" : "h-96"}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
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
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown Chart - only for single ticker */}
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
    </div>
  );
}
