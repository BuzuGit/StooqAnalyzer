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
import { DrawdownDataPoint } from '@/lib/statistics';

interface DrawdownChartProps {
  data: DrawdownDataPoint[];
  maxDrawdown: number;
  maxDrawdownDate: string;
  currentDrawdown: number;
  isShortRange?: boolean;
  isLongRange?: boolean;
  tickCount?: number;
  yearlyTicks?: string[];
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
      fill="#dc2626"
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
        fill="#dc2626"
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
}: DrawdownChartProps) {
  if (data.length === 0) {
    return null;
  }

  const lastDate = data[data.length - 1].date;
  const lastDrawdown = data[data.length - 1].drawdown;

  // Format drawdown for display
  const formatDrawdown = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  // Format date for X axis - dynamic based on date range (matching price chart)
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

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 55, left: 0, bottom: 0 }}
          syncId="stockChart"
        >
          <defs>
            <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#dc2626" stopOpacity={0.1} />
            </linearGradient>
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
            formatter={(value: number) => [`${value.toFixed(2)}%`, 'Drawdown']}
          />

          {/* Zero reference line */}
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="#dc2626"
            fill="url(#drawdownGradient)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: '#dc2626' }}
          />

          {/* Max drawdown marker with label */}
          <ReferenceDot
            x={maxDrawdownDate}
            y={-maxDrawdown}
            r={4}
            fill="#dc2626"
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
            x={lastDate}
            y={lastDrawdown}
            r={0}
          >
            <Label
              content={
                <CurrentDrawdownBubble value={formatDrawdown(lastDrawdown)} />
              }
            />
          </ReferenceDot>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
