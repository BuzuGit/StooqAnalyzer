'use client';

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
import { YearlyData } from '@/lib/statistics';

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

// Custom X axis tick that shows year and ATH count below
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
      {numValue >= 0 ? '' : ''}{numValue.toFixed(1)}%
    </text>
  );
}

// Custom label for drawdown dots
function DrawdownLabel(props: {
  x?: number;
  y?: number;
  value?: number | null;
}) {
  const { x, y, value } = props;
  if (x === undefined || y === undefined || value === null || value === undefined) {
    return null;
  }

  return (
    <text
      x={x}
      y={y + 12}
      fill="#dc2626"
      textAnchor="middle"
      fontSize={9}
      fontWeight="500"
    >
      -{value.toFixed(1)}%
    </text>
  );
}

// Custom component to render ATH counts at the bottom
function ATHLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  payload?: { athCount: number };
}) {
  const { x, y, width, payload } = props;
  if (x === undefined || y === undefined || width === undefined || !payload) {
    return null;
  }

  const athCount = payload.athCount;
  if (athCount === 0) return null;

  return (
    <text
      x={x + width / 2}
      y={y + 25}
      fill="#dc2626"
      textAnchor="middle"
      fontSize={11}
      fontWeight="600"
    >
      {athCount}
    </text>
  );
}

export default function AnnualReturnsChart({ data, ticker }: AnnualReturnsChartProps) {
  if (data.length === 0) {
    return null;
  }

  // Transform data for the chart
  const chartData: ChartDataPoint[] = data.map((yearData) => ({
    year: yearData.year,
    annualReturn: yearData.annualReturn,
    maxDrawdown: yearData.maxDrawdown,
    athCount: yearData.athCount,
  }));

  // Calculate Y axis domain
  const returns = chartData.map(d => d.annualReturn).filter((r): r is number => r !== null);
  const drawdowns = chartData.map(d => d.maxDrawdown).filter((d): d is number => d !== null);

  const maxReturn = Math.max(...returns, 0);
  const minReturn = Math.min(...returns, 0);
  const maxDrawdown = Math.max(...drawdowns, 0);

  // Y domain: from -(maxDrawdown + padding) to maxReturn + padding
  // Extra padding at bottom for drawdown labels
  const yMin = Math.min(minReturn, -maxDrawdown) - 12;
  const yMax = maxReturn + 5;

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">
        {ticker} Annual Returns, Max Drawdowns & ATH Count
      </h2>

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

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 0, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="year"
              tick={(props) => <CustomXAxisTick {...props} chartData={chartData} />}
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
              {chartData.map((entry, index) => (
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
                // payload.maxDrawdown is already negative from data transformation
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
              // Transform maxDrawdown to negative Y position
              data={chartData.map(d => ({
                ...d,
                maxDrawdown: d.maxDrawdown !== null ? -d.maxDrawdown : null,
              }))}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
