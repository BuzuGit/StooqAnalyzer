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
  ReferenceLine,
  Label,
} from 'recharts';
import { useMemo } from 'react';
import { DrawdownDataPoint } from '@/lib/statistics';

interface MultiDrawdownData {
  ticker: string;
  data: DrawdownDataPoint[];
  color: string;
}

interface DrawdownChartProps {
  data: DrawdownDataPoint[];
  maxDrawdown: number;
  maxDrawdownDate: string;
  currentDrawdown: number;
  isShortRange?: boolean;
  isLongRange?: boolean;
  tickCount?: number;
  yearlyTicks?: string[];
  multiData?: MultiDrawdownData[];
}

// Custom label for max drawdown point
function DrawdownLabel({
  viewBox,
  value,
}: {
  viewBox?: { x: number; y: number };
  value: string;
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;

  return (
    <text
      x={x - 10}
      y={y + 4}
      fill="#000000"
      fontSize={10}
      fontWeight="500"
      textAnchor="end"
    >
      {value}
    </text>
  );
}

// Custom component for current drawdown bubble
function CurrentDrawdownBubble({
  viewBox,
  value,
}: {
  viewBox?: { x: number; y: number; width: number };
  value: string;
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const bubbleX = x + 5;
  // Dynamic width based on text length (approx 7px per character + padding)
  const bubbleWidth = Math.max(value.length * 7 + 12, 40);

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

export default function DrawdownChart({
  data,
  maxDrawdown,
  maxDrawdownDate,
  currentDrawdown,
  isShortRange = false,
  isLongRange = false,
  tickCount = 8,
  yearlyTicks,
  multiData,
}: DrawdownChartProps) {
  const isMulti = multiData && multiData.length > 0;

  // Merge multi-ticker drawdown data into a single dataset
  const mergedMultiData = useMemo(() => {
    if (!isMulti) return [];
    // Collect all dates from all tickers
    const dateSet = new Set<string>();
    for (const td of multiData!) {
      for (const point of td.data) {
        dateSet.add(point.date);
      }
    }
    const dates = Array.from(dateSet).sort();

    // Build lookup maps per ticker
    const maps = multiData!.map(td => {
      const map = new Map<string, number>();
      for (const point of td.data) {
        map.set(point.date, point.drawdown);
      }
      return { ticker: td.ticker, map };
    });

    // Merge into single dataset
    return dates.map(date => {
      const point: Record<string, string | number> = { date };
      for (const { ticker, map } of maps) {
        const val = map.get(date);
        if (val !== undefined) {
          point[`dd_${ticker}`] = val;
        }
      }
      return point;
    });
  }, [isMulti, multiData]);

  if (!isMulti && data.length === 0) {
    return null;
  }

  const lastDate = isMulti
    ? (mergedMultiData.length > 0 ? mergedMultiData[mergedMultiData.length - 1].date as string : null)
    : data[data.length - 1].date;
  const lastDrawdown = !isMulti ? data[data.length - 1].drawdown : 0;

  // Format drawdown for display
  const formatDrawdown = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Format date for X axis - dynamic based on date range (matching price chart)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatDateAxis = (date: string) => {
    const d = new Date(date);
    if (isShortRange) {
      return `${d.getDate()} ${months[d.getMonth()]}`;
    }
    if (isLongRange) {
      return d.getFullYear().toString();
    }
    return `${months[d.getMonth()]}${d.getFullYear().toString().slice(-2)}`;
  };

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={isMulti ? mergedMultiData : data}
          margin={{ top: 5, right: 55, left: 0, bottom: 0 }}
          syncId="stockChart"
        >
          <defs>
            {isMulti ? (
              multiData!.map((td) => (
                <linearGradient key={`dd-gradient-${td.ticker}`} id={`dd-gradient-${td.ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={td.color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={td.color} stopOpacity={0} />
                </linearGradient>
              ))
            ) : (
              <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#000000" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#000000" stopOpacity={0.1} />
              </linearGradient>
            )}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={formatDateAxis}
            ticks={yearlyTicks}
            tickCount={yearlyTicks ? undefined : tickCount}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
            domain={['auto', 0]}
            allowDataOverflow={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              fontSize: '12px',
            }}
            labelFormatter={(date) => new Date(date).toLocaleDateString()}
            formatter={(value: number, name: string) => {
              const label = isMulti ? name.replace('dd_', '') : 'Drawdown';
              return [`${value.toFixed(2)}%`, label];
            }}
          />

          {/* Zero reference line */}
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

          {isMulti ? (
            multiData!.map((td) => (
              <Area
                key={td.ticker}
                type="monotone"
                dataKey={`dd_${td.ticker}`}
                stroke={td.color}
                fill={`url(#dd-gradient-${td.ticker})`}
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: td.color }}
              />
            ))
          ) : (
            <>
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="#000000"
                fill="url(#drawdownGradient)"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 3, fill: '#000000' }}
              />

              {/* Max drawdown marker with label */}
              <ReferenceDot
                x={maxDrawdownDate}
                y={-maxDrawdown}
                r={4}
                fill="#000000"
                stroke="white"
                strokeWidth={2}
              >
                <Label
                  content={
                    <DrawdownLabel value={formatDrawdown(-maxDrawdown)} />
                  }
                />
              </ReferenceDot>

              {/* Current drawdown bubble at the end */}
              <ReferenceDot
                x={lastDate!}
                y={lastDrawdown}
                r={0}
              >
                <Label
                  content={
                    <CurrentDrawdownBubble value={formatDrawdown(lastDrawdown)} />
                  }
                />
              </ReferenceDot>
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
