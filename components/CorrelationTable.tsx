'use client';

import { useMemo, useState } from 'react';
import { TickerData } from '@/lib/types';
import {
  calculateCorrelations,
  CORRELATION_PERIODS,
  CorrelationCell,
  CorrelationFrequency,
} from '@/lib/statistics';

interface CorrelationTableProps {
  tickersData: TickerData[];
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Diverging scale: orange = move together, blue = move opposite, neutral near 0.
function getCorrelationColor(value: number | null): string {
  if (value === null) return 'bg-panel-2 text-subtle';
  if (value >= 0.75) return 'bg-orange-600 text-white';
  if (value >= 0.5) return 'bg-orange-400 text-orange-950';
  if (value >= 0.25) return 'bg-orange-200 text-orange-900';
  if (value > -0.25) return 'bg-panel-2 text-content';
  if (value > -0.5) return 'bg-sky-200 text-sky-900';
  if (value > -0.75) return 'bg-sky-400 text-sky-950';
  return 'bg-sky-600 text-white';
}

function CorrelationValueCell({
  cell,
  frequency,
}: {
  cell: CorrelationCell;
  frequency: CorrelationFrequency;
}) {
  const unit = frequency === 'daily' ? 'trading days' : 'months';

  return (
    <td
      className={`px-2 py-1.5 text-center font-medium border-r border-line relative group cursor-help ${getCorrelationColor(
        cell.value
      )}`}
    >
      {cell.value === null ? '–' : cell.value.toFixed(2)}
      <div className="absolute z-50 hidden group-hover:block top-full left-1/2 transform -translate-x-1/2 mt-1 px-3 py-2 text-xs bg-gray-900 text-white rounded-lg shadow-lg whitespace-pre min-w-max text-left font-normal">
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900"></div>
        {cell.value === null ? (
          <div>Not enough overlapping history</div>
        ) : (
          <div className="font-mono">correlation = {cell.value.toFixed(4)}</div>
        )}
        <div className="text-gray-300 mt-1">
          {cell.observations} paired {unit}
        </div>
        {cell.startDate && cell.endDate && (
          <div className="text-subtle mt-1 text-[10px]">
            {cell.startDate} → {cell.endDate}
          </div>
        )}
      </div>
    </td>
  );
}

export default function CorrelationTable({ tickersData }: CorrelationTableProps) {
  const [frequency, setFrequency] = useState<CorrelationFrequency>('daily');

  const pairs = useMemo(
    () => calculateCorrelations(tickersData, frequency),
    [tickersData, frequency]
  );

  // The longest window starts where the pair's history begins — label the column
  // with that month. Falls back to "Max" when pairs don't all start together.
  const maxColumnLabel = useMemo(() => {
    const startMonths = new Set(
      pairs
        .map((p) => p.periods.MAX.startDate?.substring(0, 7))
        .filter((m): m is string => m !== undefined)
    );
    if (startMonths.size !== 1) return 'Max';
    const [year, month] = Array.from(startMonths)[0].split('-');
    return `From ${MONTH_SHORT[Number(month) - 1]}${year.slice(-2)}`;
  }, [pairs]);

  if (pairs.length === 0) return null;

  return (
    <div className="bg-panel rounded-lg shadow-md p-4 mt-4">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-content">Correlation</h2>
        <div className="inline-flex rounded-lg border border-line p-0.5 bg-panel-2">
          {(['daily', 'monthly'] as CorrelationFrequency[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                frequency === f
                  ? 'bg-gray-700 text-white shadow-sm'
                  : 'text-muted hover:text-content'
              }`}
            >
              {f === 'daily' ? 'Daily' : 'Monthly'}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          Pearson correlation of {frequency} returns, over the dates both assets traded.
        </span>
      </div>

      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-700 text-white">
              <th className="px-2 py-2 text-left font-medium">Pair</th>
              {CORRELATION_PERIODS.map((period) => (
                <th key={period.key} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                  {period.key === 'MAX' ? maxColumnLabel : period.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair, index) => (
              <tr
                key={`${pair.tickerA}|${pair.tickerB}`}
                className={index % 2 === 0 ? 'bg-panel' : 'bg-panel-2'}
              >
                <td className="px-2 py-1.5 font-medium text-content border-r border-line whitespace-nowrap">
                  {pair.tickerA} / {pair.tickerB}
                </td>
                {CORRELATION_PERIODS.map((period) => (
                  <CorrelationValueCell
                    key={period.key}
                    cell={pair.periods[period.key]}
                    frequency={frequency}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-600 rounded"></div>
          <span>Move together (+1)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-panel-2 border border-line rounded"></div>
          <span>Unrelated (0)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-sky-600 rounded"></div>
          <span>Move opposite (−1)</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-subtle">Hover over cells for the sample size and window</span>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-subtle">
        Periods are measured back from the last date each pair has in common, so they follow the
        selected date range. Assets on different exchanges can show a lower daily correlation than
        they really have, because their trading hours don&apos;t overlap — the monthly view avoids
        that.
      </p>
    </div>
  );
}
