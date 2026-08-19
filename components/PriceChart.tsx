'use client';

import { useState, useMemo, useCallback } from 'react';
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
  Label,
} from 'recharts';
import { ChartDataPoint, TickerData } from '@/lib/types';
import {
  findExtremes,
  calculateDrawdownSeries,
  calculateSMA,
  calculateSMADistance,
  calculateHighWaterMark,
  findUnderwaterPeriods,
  formatDaysAsPeriod,
} from '@/lib/statistics';
import { niceLogAxisScale } from '@/lib/axisScale';
import { useTheme } from '@/components/ThemeProvider';
import { getChartTheme } from '@/lib/chartTheme';
import DrawdownChart from './DrawdownChart';
import SMADistanceChart from './SMADistanceChart';
import DateAxisTick, { computeEvenTicks } from './DateAxisTick';

/**
 * What the price chart plots:
 *  'price'    — the price level
 *  'percent'  — cumulative % change from the first date in view
 *  'drawdown' — price plus its high water mark, with the underwater stretches shaded
 */
export type ChartView = 'price' | 'percent' | 'drawdown';

interface PriceChartProps {
  data: ChartDataPoint[];
  tickers: string[];
  tickersData: TickerData[];
  rawTickersData: TickerData[];
  view?: ChartView;
  /** Logarithmic Y axis, so equal distances mean equal percentage moves. */
  logScale?: boolean;
}

/** Borrowed from PortfolioBacktester's palette so the two apps' drawdown charts match. */
const HWM_COLOR = '#c06a94'; // dusty rose
const HWM_LABEL_COLOR = '#8a3f52'; // deep wine

/** Underwater stretches shorter than this go unlabelled — a two-month dip isn't a story. */
const LABEL_MIN_DAYS = 365;

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

// Unified end-of-chart bubble renderer: renders all price/SMA bubbles sorted by value (highest on top)
function EndBubbles({
  viewBox,
  items,
}: {
  viewBox?: { x: number; y: number; width: number };
  items: { label: string; color: string }[];
}) {
  if (!viewBox || items.length === 0) return null;
  const { x, y, width = 0 } = viewBox;
  const bubbleX = x + width + 5;

  return (
    <g>
      {items.map((item, idx) => {
        const bubbleWidth = Math.max(item.label.length * 7 + 12, 35);
        const bubbleY = y - 10 + idx * 22;
        return (
          <g key={idx}>
            <rect
              x={bubbleX}
              y={bubbleY}
              width={bubbleWidth}
              height={20}
              rx={4}
              fill={item.color}
            />
            <text
              x={bubbleX + bubbleWidth / 2}
              y={bubbleY + 14}
              fill="white"
              fontSize={10}
              fontWeight="500"
              textAnchor="middle"
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export default function PriceChart({
  data,
  tickers,
  tickersData,
  rawTickersData,
  view = 'price',
  logScale = false,
}: PriceChartProps) {
  const percentMode = view === 'percent';
  const [show50SMA, setShow50SMA] = useState(false);
  const [show200SMA, setShow200SMA] = useState(false);
  const [distanceSMAPeriod, setDistanceSMAPeriod] = useState<50 | 200>(200);

  const { theme } = useTheme();
  const ct = getChartTheme(theme);
  // The primary asset uses COLORS[0] (black); swap it for a theme color so it
  // stays visible on a dark background.
  const colorFor = useCallback(
    (index: number) =>
      index % COLORS.length === 0 ? ct.seriesPrimary : COLORS[index % COLORS.length],
    [ct.seriesPrimary]
  );

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

  // Base value of the primary series in the visible window — the denominator for
  // percent mode, and what the price-unit markers (extremes, current price, SMA
  // bubbles) are re-expressed against. Undefined when it isn't a positive number,
  // which is possible for economic series that sit at or below zero (e.g. FRED
  // DFII10): percent change from such a base is undefined, so percent mode is
  // suppressed rather than showing a meaningless figure.
  const primaryBase = useMemo(() => {
    const point = data.find((d) => typeof d[primaryTicker] === 'number');
    const value = point ? (point[primaryTicker] as number) : undefined;
    return value !== undefined && value > 0 ? value : undefined;
  }, [data, primaryTicker]);

  const inPercent = percentMode && primaryBase !== undefined;

  /** Price level -> cumulative % change from the window's first value. */
  const toPercent = useCallback(
    (value: number, base: number) => (value / base) * 100 - 100,
    []
  );

  // Re-base every series onto percent change. Applied after the SMA merge so the
  // moving averages are converted with the *price* base they overlay, keeping
  // their true position relative to the price line rather than being re-based
  // onto their own first value.
  const displayData = useMemo(() => {
    if (!inPercent) return chartDataWithSMA;

    const bases = new Map<string, number>();
    for (const ticker of tickers) {
      const point = chartDataWithSMA.find((d) => typeof d[ticker] === 'number');
      const value = point ? (point[ticker] as number) : undefined;
      if (value !== undefined && value > 0) bases.set(ticker, value);
    }

    return chartDataWithSMA.map((point) => {
      const out: ChartDataPoint = { date: point.date };
      for (const ticker of tickers) {
        const value = point[ticker];
        const base = bases.get(ticker);
        if (typeof value === 'number' && base !== undefined) {
          out[ticker] = toPercent(value, base);
        }
      }
      for (const smaKey of ['sma50', 'sma200'] as const) {
        const value = (point as Record<string, unknown>)[smaKey];
        if (typeof value === 'number' && primaryBase !== undefined) {
          out[smaKey] = toPercent(value, primaryBase);
        }
      }
      return out;
    });
  }, [chartDataWithSMA, inPercent, tickers, primaryBase, toPercent]);

  // --- Drawdown ("underwater") view ---
  // Only meaningful for a single asset: the normalized multi-asset chart has no one
  // price level for a high water mark to ratchet against.
  const drawdownView = view === 'drawdown' && isSingleTicker && primaryData.length > 0;

  // Recharts shades between two lines when a point carries a [low, high] pair, so we
  // hand it [price, high water mark]. At a new high the pair collapses to zero height
  // and nothing is drawn — exactly right, since there is no drawdown to shade there.
  // One pass over the series, shared by the band, the end bubble and the labels —
  // previously each of those recomputed the same high water mark.
  const highWaterMark = useMemo(
    () => (drawdownView ? calculateHighWaterMark(primaryData) : null),
    [drawdownView, primaryData]
  );

  const drawdownData = useMemo(() => {
    if (!drawdownView || !highWaterMark) return null;
    const hwmByDate = new Map(primaryData.map((point, i) => [point.date, highWaterMark[i]]));
    return chartDataWithSMA.map((point) => {
      const price = point[primaryTicker];
      const mark = hwmByDate.get(point.date);
      if (typeof price !== 'number' || mark === undefined) return point;
      return { ...point, hwm: mark, underwaterBand: [price, mark] as [number, number] };
    });
  }, [drawdownView, highWaterMark, primaryData, chartDataWithSMA, primaryTicker]);

  const underwaterPeriods = useMemo(
    () =>
      drawdownView
        ? findUnderwaterPeriods(primaryData).filter((p) => p.days >= LABEL_MIN_DAYS)
        : [],
    [drawdownView, primaryData]
  );

  const lastHwm = highWaterMark ? highWaterMark[highWaterMark.length - 1] : undefined;

  // Log needs its own gridlines and cannot plot zero or a negative value. Built from
  // every series actually on screen, so the axis covers the SMAs and the high water
  // mark too, and falls back to linear when nothing positive is left to plot.
  //
  // That fallback only catches a series that is ENTIRELY non-positive. A series that
  // merely crosses zero still yields an axis — one built from the positive values
  // alone, which would clip everything below it. Percent series routinely cross zero,
  // so log is refused here rather than trusting every caller to remember.
  const logAxis = useMemo(() => {
    if (!logScale || inPercent) return null;
    const rows = drawdownData ?? displayData;
    const keys = [...tickers, 'sma50', 'sma200', 'hwm'];
    const values: number[] = [];
    for (const row of rows) {
      for (const key of keys) {
        const value = (row as Record<string, unknown>)[key];
        if (typeof value === 'number') values.push(value);
      }
    }
    return niceLogAxisScale(values);
  }, [logScale, drawdownData, displayData, tickers]);

  // Calculate SMA distance data for the distance chart
  const smaDistanceData = useMemo(() => {
    if (!isSingleTicker || primaryData.length === 0) return [];
    const smaData = calculateSMA(rawPrimaryData, distanceSMAPeriod);
    return calculateSMADistance(primaryData, smaData);
  }, [isSingleTicker, primaryData, rawPrimaryData, distanceSMAPeriod]);

  // Calculate drawdown series for multi-ticker mode
  const multiDrawdownData = useMemo(() => {
    if (isSingleTicker) return undefined;
    return tickersData
      .filter(td => td.data.length > 0)
      .map((td, index) => ({
        ticker: td.ticker,
        data: calculateDrawdownSeries(td.data).data,
        color: colorFor(index),
      }));
  }, [isSingleTicker, tickersData, colorFor]);

  // Date range calculations — must be before early return so hooks below always run
  const lastDate = data.length > 0 ? data[data.length - 1].date : null;
  const firstDate = data.length > 0 ? data[0].date : null;
  const dateRangeDays = firstDate && lastDate
    ? Math.ceil((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const isShortRange = dateRangeDays <= 93; // ~3 months
  const isLongRange = dateRangeDays > 365 * 5; // > 5 years
  const tickCount = 8;

  // For medium range: compute explicit ticks and year-change set for two-line labels
  const mediumTicks = useMemo(() => {
    if (isShortRange || isLongRange || data.length === 0) return undefined;
    const dates = data.map(d => d.date);
    return computeEvenTicks(dates, tickCount);
  }, [data, isShortRange, isLongRange, tickCount]);

  // Period length and CAGR of the currently displayed (filtered) primary series,
  // shown next to the single-ticker title. CAGR matches lib/statistics.
  const periodCagr = useMemo(() => {
    if (!isSingleTicker || primaryData.length < 2) return null;
    const start = new Date(primaryData[0].date).getTime();
    const end = new Date(primaryData[primaryData.length - 1].date).getTime();
    const startPrice = primaryData[0].close;
    const endPrice = primaryData[primaryData.length - 1].close;
    if (!(startPrice > 0) || end <= start) return null;

    const years = (end - start) / (365.25 * 24 * 60 * 60 * 1000);
    const cagr = years > 0 ? (Math.pow(endPrice / startPrice, 1 / years) - 1) * 100 : 0;

    const totalMonths = Math.round((end - start) / 86400000 / 30.4375);
    const y = Math.floor(totalMonths / 12);
    const mo = totalMonths % 12;
    const period = y > 0 ? `${y}y ${mo}m` : `${mo}m`;
    const cagrStr = `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%`;
    return { period, cagr: cagrStr };
  }, [isSingleTicker, primaryData]);

  if (data.length === 0) {
    return (
      <div className="bg-panel rounded-lg shadow-md p-8 flex items-center justify-center h-96">
        <p className="text-muted">Enter tickers above to see the chart</p>
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

  // Get latest SMA values for bubbles
  const lastSMA50 = show50SMA && chartDataWithSMA.length > 0
    ? (chartDataWithSMA[chartDataWithSMA.length - 1] as Record<string, unknown>).sma50 as number | undefined
    : undefined;
  const lastSMA200 = show200SMA && chartDataWithSMA.length > 0
    ? (chartDataWithSMA[chartDataWithSMA.length - 1] as Record<string, unknown>).sma200 as number | undefined
    : undefined;

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

  // Resolved ticks: yearlyTicks for long range, mediumTicks for medium, undefined for short
  const resolvedTicks = yearlyTicks || mediumTicks;

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

  // Long histories produce enormous percentages (AAPL since 1980 is ~+265,000%),
  // which don't fit an axis tick or an end bubble — abbreviate those. Tooltips
  // pass abbreviate=false, since that's where the exact figure belongs.
  const formatPercent = (value: number, decimals = 1, abbreviate = true) => {
    const sign = value >= 0 ? '+' : '';
    const abs = Math.abs(value);
    if (abbreviate && abs >= 1000000) return `${sign}${(value / 1000000).toFixed(1)}M%`;
    if (abbreviate && abs >= 10000) return `${sign}${(value / 1000).toFixed(1)}K%`;
    return `${sign}${value.toFixed(decimals)}%`;
  };

  /** Re-express a price-unit value (marker, bubble, reference line) for the current mode. */
  const toDisplayValue = (price: number) =>
    inPercent && primaryBase !== undefined ? toPercent(price, primaryBase) : price;

  /** Label for a value already in display units. */
  const formatDisplay = (value: number) =>
    inPercent ? formatPercent(value) : formatPrice(value);

  // Format large numbers for Y axis
  const formatYAxis = (value: number) => {
    if (inPercent) {
      return formatPercent(value, 0);
    }
    // Log gridlines are 1-2-5 round numbers (0.5, 1, 2, 5, 20, 500…). Fixed decimals
    // would render those as "20.00"; show each at its own natural precision instead.
    if (logAxis) {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      if (value >= 10) return value.toFixed(0);
      if (value >= 1) return String(parseFloat(value.toFixed(1)));
      return String(parseFloat(value.toPrecision(2)));
    }
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(2);
  };

  // Format tooltip
  const formatTooltip = (value: number | [number, number], name: string) => {
    // The underwater band carries a [price, peak] pair rather than a single value —
    // report the gap between them, which is what the shading actually depicts.
    if (Array.isArray(value)) {
      const [price, peak] = value;
      const gap = peak > 0 ? (price / peak - 1) * 100 : 0;
      return [`${gap.toFixed(2)}% below peak`, 'Drawdown'];
    }
    if (name === 'hwm') return [formatPrice(value), 'High water mark'];
    if (name === 'sma50')
      return [inPercent ? formatPercent(value, 2, false) : value.toFixed(4), '50 SMA'];
    if (name === 'sma200')
      return [inPercent ? formatPercent(value, 2, false) : value.toFixed(4), '200 SMA'];
    if (inPercent) {
      return [formatPercent(value, 2, false), name];
    }
    if (isSingleTicker) {
      return [value.toFixed(4), name];
    }
    return [`${value.toFixed(2)}%`, name];
  };

  // XAxis tick height: taller for medium range (two-line labels)
  const xAxisHeight = (!isShortRange && !isLongRange) ? 35 : undefined;

  // Whether to show X axis on price chart (hide if drawdown chart is shown below)
  const hasDrawdown = (isSingleTicker && drawdownSeries && drawdownSeries.data.length > 0) ||
    (!isSingleTicker && multiDrawdownData && multiDrawdownData.length > 0);
  const showPriceChartXAxis = !hasDrawdown;

  return (
    <div className="bg-panel rounded-lg shadow-md p-4">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-content">
            {isSingleTicker
              ? `${primaryTicker} ${inPercent ? 'Return' : 'Price'} & Drawdown`
              : inPercent
              ? 'Normalized Comparison (% from start)'
              : 'Normalized Comparison (Base = 100)'}
            {isSingleTicker && periodCagr && (
              <span className="ml-2 text-sm font-semibold text-content">
                (Period: {periodCagr.period} | CAGR: {periodCagr.cagr})
              </span>
            )}
          </h2>
          {isSingleTicker && (
            <div className="flex gap-1 ml-2">
              <button
                onClick={() => setShow50SMA(!show50SMA)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  show50SMA
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-panel-2 text-muted border border-line hover:bg-panel-3'
                }`}
              >
                50SMA
              </button>
              <button
                onClick={() => setShow200SMA(!show200SMA)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  show200SMA
                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                    : 'bg-panel-2 text-muted border border-line hover:bg-panel-3'
                }`}
              >
                200SMA
              </button>
            </div>
          )}
        </div>
        {!isSingleTicker && (
          <p className="text-sm text-muted">
            {inPercent
              ? 'All series show cumulative % change from the common start date'
              : 'All series normalized to 100 at common start date'}
          </p>
        )}
        {isSingleTicker && inPercent && (
          <p className="text-sm text-muted">Cumulative % change from the first date in view</p>
        )}
        {drawdownView && (
          <p className="text-sm text-muted">
            Shaded area is the gap below the high water mark. For each stretch underwater
            lasting a year or more, the label above gives its full duration and the label
            at the low gives how deep the fall from the peak went and how long it took.
          </p>
        )}
      </div>

      <div className={hasDrawdown ? "h-80" : "h-96"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={drawdownData ?? displayData}
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
                    stopColor={colorFor(index)}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={colorFor(index)}
                    stopOpacity={0}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={showPriceChartXAxis
                ? (props) => <DateAxisTick {...props} isShortRange={isShortRange} isLongRange={isLongRange} />
                : false}
              ticks={resolvedTicks}
              tickCount={resolvedTicks ? undefined : tickCount}
              axisLine={showPriceChartXAxis}
              tickLine={showPriceChartXAxis}
              height={xAxisHeight}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickFormatter={formatYAxis}
              scale={logAxis ? 'log' : 'auto'}
              domain={logAxis ? logAxis.domain : ['auto', 'auto']}
              ticks={logAxis && logAxis.ticks.length > 0 ? logAxis.ticks : undefined}
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
            {(tickers.length > 1 || drawdownView) && <Legend />}

            {/* Shading between price and its high water mark — the gap still to be
                climbed back. Drawn before the lines so they sit on top of it. */}
            {drawdownView && (
              <Area
                type="monotone"
                dataKey="underwaterBand"
                name="Below peak"
                stroke="none"
                fill={HWM_COLOR}
                fillOpacity={0.28}
                activeDot={false}
                legendType="none"
                isAnimationActive={false}
              />
            )}

            {tickers.map((ticker, index) => (
              <Area
                key={ticker}
                type="monotone"
                dataKey={ticker}
                stroke={colorFor(index)}
                // The gradient would muddy the pink shading, so the price is a bare
                // line in the drawdown view.
                fill={drawdownView ? 'none' : `url(#gradient-${ticker})`}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                // Recharts animates a line by morphing its path. Switching between
                // Linear and Log moves every point at once, and morphing through that
                // makes the chart lurch — and briefly draws the line against the wrong
                // scale. Redrawing straight away is calmer and always self-consistent.
                isAnimationActive={false}
              />
            ))}

            {/* High water mark — the ratchet of previous peaks, flat until a new high */}
            {drawdownView && (
              <Line
                type="monotone"
                dataKey="hwm"
                name="High water mark"
                stroke={HWM_COLOR}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}

            {/* "2y 1m" over the middle of each underwater stretch of a year or more.
                The dot is invisible (r=0) and exists only to anchor the text at the
                peak level, just above the shaded area. */}
            {underwaterPeriods.map((period) => (
              <ReferenceDot
                key={`underwater-${period.startDate}`}
                x={period.midDate}
                y={period.peak}
                r={0}
                fill="none"
                stroke="none"
                label={{
                  value: formatDaysAsPeriod(period.days),
                  position: 'top',
                  fontSize: 11,
                  fill: HWM_LABEL_COLOR,
                  fontWeight: 600,
                }}
              />
            ))}

            {/* The other half of the same story, under the price line: how deep the
                fall went and how long it took, peak -> the lowest close of that
                stretch. Anchored at the trough by an invisible dot, so it sits
                below the low. */}
            {underwaterPeriods.map((period) => (
              <ReferenceDot
                key={`underwater-fall-${period.startDate}`}
                x={period.troughDate}
                y={period.troughPrice}
                r={0}
                fill="none"
                stroke="none"
                label={{
                  value: `${formatPercent((period.troughPrice / period.peak - 1) * 100, 1)} after ${formatDaysAsPeriod(period.daysToTrough)}`,
                  position: 'bottom',
                  fontSize: 11,
                  fill: HWM_LABEL_COLOR,
                  fontWeight: 600,
                }}
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
                isAnimationActive={false}
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
                isAnimationActive={false}
              />
            )}

            {/* Zero line — the break-even level once the series is re-based to % */}
            {inPercent && (
              <ReferenceLine y={0} stroke={ct.seriesPrimary} strokeWidth={1} strokeOpacity={0.5} />
            )}

            {/* High point marker with label */}
            {extremes && (
              <ReferenceDot
                x={extremes.highPoint.date}
                y={toDisplayValue(extremes.highPoint.price)}
                r={5}
                fill="#16a34a"
                stroke="white"
                strokeWidth={2}
              >
                <Label
                  content={
                    <PriceLabel
                      value={formatDisplay(toDisplayValue(extremes.highPoint.price))}
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
                y={toDisplayValue(extremes.lowPoint.price)}
                r={5}
                fill="#dc2626"
                stroke="white"
                strokeWidth={2}
              >
                <Label
                  content={
                    <PriceLabel
                      value={formatDisplay(toDisplayValue(extremes.lowPoint.price))}
                      color="#dc2626"
                      position="bottom"
                    />
                  }
                />
              </ReferenceDot>
            )}

            {/* Current price horizontal reference line */}
            {isSingleTicker && currentPrice && (
              <ReferenceLine
                y={toDisplayValue(currentPrice)}
                stroke={ct.seriesPrimary}
                strokeDasharray="4 4"
                strokeWidth={1}
                strokeOpacity={0.4}
              />
            )}

            {/* End-of-chart bubbles (price + SMAs) sorted by value, highest on top */}
            {isSingleTicker && currentPrice && lastDate && (() => {
              const bubble = (price: number, color: string) => {
                const value = toDisplayValue(price);
                return { value, label: formatDisplay(value), color };
              };
              const items: { value: number; label: string; color: string }[] = [
                bubble(currentPrice, ct.markerBg),
              ];
              if (show50SMA && lastSMA50 !== undefined) {
                items.push(bubble(lastSMA50, '#dc2626'));
              }
              if (show200SMA && lastSMA200 !== undefined) {
                items.push(bubble(lastSMA200, '#eab308'));
              }
              if (drawdownView && lastHwm !== undefined) {
                items.push(bubble(lastHwm, HWM_COLOR));
              }
              items.sort((a, b) => b.value - a.value);
              const anchorValue = items[0].value;
              return (
                <ReferenceDot x={lastDate} y={anchorValue} r={0}>
                  <Label
                    content={
                      <EndBubbles items={items.map(i => ({ label: i.label, color: i.color }))} />
                    }
                  />
                </ReferenceDot>
              );
            })()}
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
          resolvedTicks={resolvedTicks}
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
          resolvedTicks={resolvedTicks}
          multiData={multiDrawdownData}
        />
      )}

      {/* SMA Distance Chart - single ticker only */}
      {isSingleTicker && smaDistanceData.length > 0 && (
        <SMADistanceChart
          data={smaDistanceData}
          isShortRange={isShortRange}
          isLongRange={isLongRange}
          tickCount={tickCount}
          resolvedTicks={resolvedTicks}
          smaPeriod={distanceSMAPeriod}
          onTogglePeriod={() => setDistanceSMAPeriod(p => p === 200 ? 50 : 200)}
        />
      )}
    </div>
  );
}
