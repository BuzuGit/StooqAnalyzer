'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Scatter,
  LabelList,
} from 'recharts';
import {
  YearlyData,
  PeriodicReturnPoint,
  flattenMonthlyReturns,
  calculateQuarterlyReturns,
} from '@/lib/statistics';

type ViewMode = 'monthly' | 'quarterly' | 'annual';

interface AnnualReturnsChartProps {
  data: YearlyData[];
  ticker: string;
}

interface ChartDataPoint {
  year: number;
  annualReturn: number | null;
  maxDrawdown: number | null;
  athCount: number;
}

// Custom X axis tick that shows year and ATH count below (annual mode only)
function CustomXAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value: number };
  chartData: ChartDataPoint[];
}) {
  const { x, y, payload, chartData } = props;
  if (x === undefined || y === undefined || !payload) {
    return null;
  }

  const yearData = chartData.find(d => d.year === payload.value);
  const athCount = yearData?.athCount || 0;

  return (
    <g>
      <text
        x={x}
        y={y + 12}
        fill="#6b7280"
        textAnchor="middle"
        fontSize={11}
      >
        {payload.value}
      </text>
      {athCount > 0 && (
        <text
          x={x}
          y={y + 28}
          fill="#166534"
          textAnchor="middle"
          fontSize={12}
          fontWeight="600"
        >
          {athCount}
        </text>
      )}
    </g>
  );
}

// Custom label for bar values
function BarLabel(props: Record<string, unknown>) {
  const x = props.x as number | undefined;
  const y = props.y as number | undefined;
  const width = props.width as number | undefined;
  const value = props.value as number | null | undefined;

  if (x === undefined || y === undefined || width === undefined || value === null || value === undefined) {
    return <g />;
  }

  const numValue = Number(value);
  if (isNaN(numValue)) return <g />;

  const isPositive = numValue >= 0;
  const labelY = isPositive ? y - 5 : y + 10;

  return (
    <text
      x={x + width / 2}
      y={labelY}
      fill="#000"
      textAnchor="middle"
      fontSize={10}
      fontWeight="500"
    >
      {numValue.toFixed(1)}%
    </text>
  );
}

// Periodic bar label — for monthly/quarterly bars
// Positive: above the bar, black. Negative: above the 0 line (not below bar), red.
function PeriodicBarLabel(props: Record<string, unknown>) {
  const x = props.x as number | undefined;
  const y = props.y as number | undefined;
  const width = props.width as number | undefined;
  const height = props.height as number | undefined;
  const value = props.value as number | null | undefined;
  const barCount = (props as { barCount?: number }).barCount || 0;

  if (x === undefined || y === undefined || width === undefined || value === null || value === undefined) {
    return <g />;
  }

  const numValue = Number(value);
  if (isNaN(numValue)) return <g />;

  // Hide labels if there are too many bars
  if (barCount > 45) return <g />;

  const isPositive = numValue >= 0;
  // For positive bars: y is top of bar, place label above it
  // For negative bars: y is at bar tip (bottom), height is negative back to 0 line
  //   0 line = y + height, label goes above it
  const h = height || 0;
  const labelY = isPositive ? y - 4 : y + h - 4;

  return (
    <text
      x={x + width / 2}
      y={labelY}
      fill={isPositive ? '#000' : '#dc2626'}
      textAnchor="middle"
      fontSize={barCount > 30 ? 7 : barCount > 20 ? 8 : 9}
      fontWeight="500"
    >
      {numValue.toFixed(1)}%
    </text>
  );
}

export default function AnnualReturnsChart({ data, ticker }: AnnualReturnsChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('annual');

  // Transform annual data for the chart
  const annualChartData: ChartDataPoint[] = useMemo(() =>
    data.map((yearData) => ({
      year: yearData.year,
      annualReturn: yearData.annualReturn,
      maxDrawdown: yearData.maxDrawdown,
      athCount: yearData.athCount,
    })),
    [data]
  );

  // Transform monthly/quarterly data
  const periodicData = useMemo(() => {
    if (viewMode === 'monthly') return flattenMonthlyReturns(data);
    if (viewMode === 'quarterly') return calculateQuarterlyReturns(data);
    return [];
  }, [data, viewMode]);

  if (data.length === 0) {
    return null;
  }

  // Title and legend based on view mode
  const titleMap: Record<ViewMode, string> = {
    annual: `${ticker} Annual Returns, Max Drawdowns & ATH Count`,
    quarterly: `${ticker} Quarterly Returns`,
    monthly: `${ticker} Monthly Returns`,
  };

  // --- Annual mode rendering (unchanged from original) ---
  const renderAnnualChart = () => {
    const returns = annualChartData.map(d => d.annualReturn).filter((r): r is number => r !== null);
    const drawdowns = annualChartData.map(d => d.maxDrawdown).filter((d): d is number => d !== null);

    const maxReturn = Math.max(...returns, 0);
    const minReturn = Math.min(...returns, 0);
    const maxDD = Math.max(...drawdowns, 0);

    const yMin = Math.min(minReturn, -maxDD) - 12;
    const yMax = maxReturn + 5;

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={annualChartData}
          margin={{ top: 20, right: 20, left: 0, bottom: 30 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="year"
            tick={(props) => <CustomXAxisTick {...props} chartData={annualChartData} />}
            tickLine={false}
            height={45}
          />
          <YAxis
            tick={false}
            axisLine={false}
            width={0}
            domain={[yMin, yMax]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'annualReturn') {
                return [`${value?.toFixed(2)}%`, 'Annual Return'];
              }
              if (name === 'maxDrawdown') {
                return [`-${Math.abs(value)?.toFixed(2)}%`, 'Max Drawdown'];
              }
              return [value, name];
            }}
            labelFormatter={(year) => `Year: ${year}`}
          />

          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

          {/* Annual return bars */}
          <Bar
            dataKey="annualReturn"
            fill="#1f2937"
            radius={[2, 2, 0, 0]}
            maxBarSize={40}
          >
            {annualChartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.annualReturn !== null && entry.annualReturn >= 0 ? '#1f2937' : '#1f2937'}
              />
            ))}
            <LabelList
              dataKey="annualReturn"
              content={(props) => <BarLabel {...props} />}
            />
          </Bar>

          {/* Max drawdown dots */}
          <Scatter
            dataKey="maxDrawdown"
            fill="#dc2626"
            shape={(props: unknown) => {
              const p = props as Record<string, unknown>;
              const cx = p.cx as number | undefined;
              const cy = p.cy as number | undefined;
              const payload = p.payload as { maxDrawdown: number | null } | undefined;
              if (cx === undefined || cy === undefined || !payload || payload.maxDrawdown === null) {
                return <g />;
              }
              const ddValue = Math.abs(payload.maxDrawdown);
              return (
                <g>
                  <circle cx={cx} cy={cy} r={3} fill="#dc2626" />
                  <text
                    x={cx}
                    y={cy + 12}
                    fill="#dc2626"
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight="500"
                  >
                    -{ddValue.toFixed(1)}%
                  </text>
                </g>
              );
            }}
            data={annualChartData.map(d => ({
              ...d,
              maxDrawdown: d.maxDrawdown !== null ? -d.maxDrawdown : null,
            }))}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  // --- Monthly/Quarterly mode rendering ---
  const renderPeriodicChart = () => {
    const returns = periodicData
      .map(d => d.returnValue)
      .filter((r): r is number => r !== null);

    const maxReturn = Math.max(...returns, 0);
    const minReturn = Math.min(...returns, 0);
    const yMin = minReturn - 5;
    const yMax = maxReturn + 5;
    const barCount = periodicData.length;

    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={periodicData}
          margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: barCount > 30 ? 9 : 10, fill: '#6b7280' }}
            tickLine={false}
            angle={barCount > 20 ? -45 : 0}
            textAnchor={barCount > 20 ? 'end' : 'middle'}
            height={barCount > 20 ? 50 : 30}
            interval={barCount > 40 ? 2 : (barCount > 20 ? 1 : 0)}
          />
          <YAxis
            tick={false}
            axisLine={false}
            width={0}
            domain={[yMin, yMax]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              fontSize: '12px',
            }}
            formatter={(value: number) => [`${value?.toFixed(2)}%`, viewMode === 'monthly' ? 'Monthly Return' : 'Quarterly Return']}
            labelFormatter={(label) => label}
          />

          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />

          <Bar
            dataKey="returnValue"
            radius={[2, 2, 0, 0]}
            maxBarSize={viewMode === 'monthly' ? 20 : 35}
          >
            {periodicData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.returnValue !== null && entry.returnValue >= 0 ? '#1f2937' : '#dc2626'}
              />
            ))}
            <LabelList
              dataKey="returnValue"
              content={(props) => <PeriodicBarLabel {...props} barCount={barCount} />}
            />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-4">
      {/* Title row with toggle */}
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-lg font-semibold text-gray-800">
          {titleMap[viewMode]}
        </h2>
        <div className="flex gap-1">
          {(['monthly', 'quarterly', 'annual'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={viewMode !== mode ? () => setViewMode(mode) : undefined}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                viewMode === mode
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend — full for annual, simple for monthly/quarterly */}
      {viewMode === 'annual' ? (
        <div className="flex gap-4 text-xs text-gray-500 mb-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-800 rounded-sm"></div>
            <span>Annual Return (%)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
            <span>Max Drawdown (%)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-green-800 font-semibold">12</span>
            <span>Number of ATHs</span>
          </div>
        </div>
      ) : (
        <div className="flex gap-4 text-xs text-gray-500 mb-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-800 rounded-sm"></div>
            <span>Positive Return</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
            <span>Negative Return</span>
          </div>
        </div>
      )}

      <div className="h-64">
        {viewMode === 'annual' ? renderAnnualChart() : renderPeriodicChart()}
      </div>
    </div>
  );
}
