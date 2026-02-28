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
import { SMADistancePoint } from '@/lib/statistics';
import DateAxisTick from './DateAxisTick';

interface SMADistanceChartProps {
  data: SMADistancePoint[];
  isShortRange?: boolean;
  isLongRange?: boolean;
  tickCount?: number;
  resolvedTicks?: string[];
  yearChangeDates?: Set<string>;
  smaPeriod: 50 | 200;
  onTogglePeriod: () => void;
}

// Label for extreme points (positioned to the left of the dot)
function ExtremeLabel({
  viewBox,
  value,
  color,
}: {
  viewBox?: { x: number; y: number };
  value: string;
  color: string;
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  return (
    <text
      x={x - 10}
      y={y + 4}
      fill={color}
      fontSize={10}
      fontWeight="500"
      textAnchor="end"
    >
      {value}
    </text>
  );
}

// Current distance bubble at right edge
function DistanceBubble({
  viewBox,
  value,
  color,
}: {
  viewBox?: { x: number; y: number; width: number };
  value: string;
  color: string;
}) {
  if (!viewBox) return null;
  const { x, y } = viewBox;
  const bubbleX = x + 5;
  const bubbleWidth = Math.max(value.length * 7 + 12, 40);

  return (
    <g>
      <rect
        x={bubbleX}
        y={y - 10}
        width={bubbleWidth}
        height={20}
        rx={4}
        fill={color}
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

export default function SMADistanceChart({
  data,
  isShortRange = false,
  isLongRange = false,
  tickCount = 8,
  resolvedTicks,
  yearChangeDates,
  smaPeriod,
  onTogglePeriod,
}: SMADistanceChartProps) {
  if (data.length === 0) return null;

  // Find extremes
  let maxAbove = 0;
  let maxAboveDate = '';
  let maxBelow = 0;
  let maxBelowDate = '';

  for (const point of data) {
    if (point.distance > maxAbove) {
      maxAbove = point.distance;
      maxAboveDate = point.date;
    }
    if (point.distance < maxBelow) {
      maxBelow = point.distance;
      maxBelowDate = point.date;
    }
  }

  // Current distance
  const lastPoint = data[data.length - 1];
  const currentDistance = lastPoint.distance;
  const currentColor = currentDistance >= 0 ? '#16a34a' : '#dc2626';
  const lastDate = lastPoint.date;

  // Calculate gradient offset — where 0 falls in the value range
  // This splits the fill/stroke gradient into green (above 0) and red (below 0)
  const dataMax = Math.max(...data.map(d => d.distance));
  const dataMin = Math.min(...data.map(d => d.distance));
  let gradientOffset = 0.5;
  if (dataMax > 0 && dataMin < 0) {
    gradientOffset = dataMax / (dataMax - dataMin);
  } else if (dataMax <= 0) {
    gradientOffset = 0; // all negative
  } else {
    gradientOffset = 1; // all positive
  }

  const formatDistance = (value: number) => {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const xAxisHeight = (!isShortRange && !isLongRange) ? 35 : undefined;

  return (
    <div>
      {/* Header with toggle */}
      <div className="flex items-center gap-2 mt-2 mb-1 ml-1">
        <span className="text-xs text-gray-500">Distance from</span>
        <div className="flex gap-1">
          <button
            onClick={smaPeriod === 200 ? onTogglePeriod : undefined}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              smaPeriod === 50
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            50 SMA
          </button>
          <button
            onClick={smaPeriod === 50 ? onTogglePeriod : undefined}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              smaPeriod === 200
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            200 SMA
          </button>
        </div>
      </div>

      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 55, left: 0, bottom: 0 }}
            syncId="stockChart"
          >
            <defs>
              {/* Split fill gradient: green above 0, red below 0 */}
              <linearGradient id="smaDistFillGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="#16a34a" stopOpacity={0.05} />
                <stop offset={`${gradientOffset * 100}%`} stopColor="#dc2626" stopOpacity={0.05} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.3} />
              </linearGradient>
              {/* Split stroke gradient: green above 0, red below 0 */}
              <linearGradient id="smaDistStrokeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset={`${gradientOffset * 100}%`} stopColor="#16a34a" />
                <stop offset={`${gradientOffset * 100}%`} stopColor="#dc2626" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={(props) => <DateAxisTick {...props} isShortRange={isShortRange} isLongRange={isLongRange} yearChangeDates={yearChangeDates} />}
              ticks={resolvedTicks}
              tickCount={resolvedTicks ? undefined : tickCount}
              height={xAxisHeight}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)}%`}
              domain={['auto', 'auto']}
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
                if (name === 'distance') {
                  const label = `Distance from ${smaPeriod} SMA`;
                  return [formatDistance(value), label];
                }
                return [null, null];
              }}
            />

            {/* Single area with split gradient — one continuous line */}
            <Area
              type="monotone"
              dataKey="distance"
              stroke="url(#smaDistStrokeGradient)"
              fill="url(#smaDistFillGradient)"
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              baseValue={0}
            />

            {/* Zero reference line */}
            <ReferenceLine y={0} stroke="#6b7280" strokeWidth={1} />

            {/* Max positive distance marker */}
            {maxAbove > 0 && (
              <ReferenceDot
                x={maxAboveDate}
                y={maxAbove}
                r={4}
                fill="#16a34a"
                stroke="white"
                strokeWidth={2}
              >
                <Label
                  content={
                    <ExtremeLabel value={formatDistance(maxAbove)} color="#16a34a" />
                  }
                />
              </ReferenceDot>
            )}

            {/* Max negative distance marker */}
            {maxBelow < 0 && (
              <ReferenceDot
                x={maxBelowDate}
                y={maxBelow}
                r={4}
                fill="#dc2626"
                stroke="white"
                strokeWidth={2}
              >
                <Label
                  content={
                    <ExtremeLabel value={formatDistance(maxBelow)} color="#dc2626" />
                  }
                />
              </ReferenceDot>
            )}

            {/* Current distance bubble */}
            <ReferenceDot
              x={lastDate}
              y={currentDistance}
              r={0}
            >
              <Label
                content={
                  <DistanceBubble
                    value={formatDistance(currentDistance)}
                    color={currentColor}
                  />
                }
              />
            </ReferenceDot>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
