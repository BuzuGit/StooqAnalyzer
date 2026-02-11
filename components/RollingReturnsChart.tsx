'use client';

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  Label,
} from 'recharts';
import { StooqDataPoint } from '@/lib/types';
import { calculateRollingReturns } from '@/lib/statistics';

interface RollingReturnsChartProps {
  data: StooqDataPoint[];
  ticker: string;
}

const ROLLING_YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateAxis(date: string, isLongRange: boolean): string {
  const d = new Date(date);
  if (isLongRange) {
    return d.getFullYear().toString();
  }
  return `${months[d.getMonth()]}${d.getFullYear().toString().slice(-2)}`;
}

function RollingReturnTooltip({ active, payload, rollingYears }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

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
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#2563eb' }}>
        Rolling {rollingYears}Y CAGR: {point.rollingCagr.toFixed(2)}%
      </div>
      <div style={{ color: '#6b7280' }}>
        Start: {new Date(point.startDate).toLocaleDateString()} @ {point.startPrice.toFixed(2)}
      </div>
      <div style={{ color: '#6b7280' }}>
        End: {new Date(point.date).toLocaleDateString()} @ {point.endPrice.toFixed(2)}
      </div>
    </div>
  );
}

export default function RollingReturnsChart({ data, ticker }: RollingReturnsChartProps) {
  const [rollingYears, setRollingYears] = useState(3);

  const rollingData = useMemo(() => {
    return calculateRollingReturns(data, rollingYears);
  }, [data, rollingYears]);

  const stats = useMemo(() => {
    if (rollingData.length === 0) return null;
    const values = rollingData.map(d => d.rollingCagr);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { max, min, avg };
  }, [rollingData]);

  if (rollingData.length === 0 || !stats) {
    return null;
  }

  const firstDate = rollingData[0].date;
  const lastDate = rollingData[rollingData.length - 1].date;
  const dateRangeDays = Math.ceil(
    (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24)
  );
  const isLongRange = dateRangeDays > 365 * 5;

  // Generate yearly ticks for long ranges
  const getYearlyTicks = () => {
    if (!isLongRange) return undefined;
    const startYear = new Date(firstDate).getFullYear();
    const endYear = new Date(lastDate).getFullYear();
    const ticks: string[] = [];
    for (let year = startYear; year <= endYear; year++) {
      const yearDate = rollingData.find(d => new Date(d.date).getFullYear() === year)?.date;
      if (yearDate && !ticks.includes(yearDate)) {
        ticks.push(yearDate);
      }
    }
    return ticks;
  };
  const yearlyTicks = getYearlyTicks();

  const lastPoint = rollingData[rollingData.length - 1];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-4">
      {/* Header */}
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-semibold text-gray-800">
            {ticker} Rolling {rollingYears}Y Returns (CAGR)
          </h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Annualized return over rolling {rollingYears}-year windows.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Rolling Years:</label>
          <select
            value={rollingYears}
            onChange={(e) => setRollingYears(parseInt(e.target.value))}
            className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ROLLING_YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}Y
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rollingData}
            margin={{ top: 10, right: 30, left: -15, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickFormatter={(date) => formatDateAxis(date, isLongRange)}
              ticks={yearlyTicks}
              tickCount={yearlyTicks ? undefined : 8}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6b7280' }}
              tickFormatter={(value) => `${value.toFixed(0)}%`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<RollingReturnTooltip rollingYears={rollingYears} />} />

            {/* Zero line */}
            <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

            {/* Max line */}
            <ReferenceLine
              y={stats.max}
              stroke="#16a34a"
              strokeDasharray="6 4"
              strokeWidth={1}
            >
              <Label
                value={`Max: ${stats.max.toFixed(1)}%`}
                position="insideTopRight"
                fill="#16a34a"
                fontSize={11}
                fontWeight={500}
              />
            </ReferenceLine>

            {/* Avg line */}
            <ReferenceLine
              y={stats.avg}
              stroke="#f59e0b"
              strokeDasharray="6 4"
              strokeWidth={1}
            >
              <Label
                value={`Avg: ${stats.avg.toFixed(1)}%`}
                position="insideTopRight"
                fill="#f59e0b"
                fontSize={11}
                fontWeight={500}
              />
            </ReferenceLine>

            {/* Min line */}
            <ReferenceLine
              y={stats.min}
              stroke="#dc2626"
              strokeDasharray="6 4"
              strokeWidth={1}
            >
              <Label
                value={`Min: ${stats.min.toFixed(1)}%`}
                position="insideBottomRight"
                fill="#dc2626"
                fontSize={11}
                fontWeight={500}
              />
            </ReferenceLine>

            {/* Main CAGR line */}
            <Line
              type="monotone"
              dataKey="rollingCagr"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="Rolling CAGR"
            />

            {/* Latest value dot */}
            <ReferenceDot
              x={lastPoint.date}
              y={lastPoint.rollingCagr}
              r={4}
              fill="#2563eb"
              stroke="white"
              strokeWidth={2}
            >
              <Label
                value={`${lastPoint.rollingCagr.toFixed(2)}%`}
                position="right"
                fill="#2563eb"
                fontSize={12}
                fontWeight={600}
                offset={8}
              />
            </ReferenceDot>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
