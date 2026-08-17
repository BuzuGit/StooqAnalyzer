'use client';

import { YearlyData } from '@/lib/statistics';
import { MONTH_NAMES as MONTHS, formatPrice } from '@/lib/format';

interface MonthEndPriceTableProps {
  data: YearlyData[];
  ticker: string;
}

/** Change vs the previous month-end, used only to tint the cell. */
function monthChange(
  data: YearlyData[],
  yearIndex: number,
  month: number
): number | null {
  const price = data[yearIndex].monthEndPrices[month];
  if (price === null) return null;

  let prior: number | null = null;
  if (month > 0) {
    prior = data[yearIndex].monthEndPrices[month - 1];
  } else if (yearIndex > 0) {
    prior = data[yearIndex - 1].monthEndPrices[11]; // January compares to prior December
  }
  if (prior === null || prior === 0) return null;
  return price / prior - 1;
}

function getPriceColor(change: number | null): string {
  if (change === null) return 'bg-panel-2';
  if (change > 0) return 'bg-emerald-100 text-emerald-800';
  if (change < 0) return 'bg-red-100 text-red-800';
  return 'bg-panel-2';
}

/** Price cell with the actual session date on hover — month end is the last *trading* day. */
function PriceCell({
  price,
  date,
  change,
  className,
}: {
  price: number | null;
  date: string | null;
  change: number | null;
  className: string;
}) {
  if (price === null) {
    return <td className={className}></td>;
  }

  return (
    <td className={`${className} relative group cursor-help`}>
      {formatPrice(price)}
      <div className="absolute z-50 hidden group-hover:block top-full left-1/2 transform -translate-x-1/2 mt-1 px-3 py-2 text-xs bg-gray-900 text-white rounded-lg shadow-lg whitespace-pre min-w-max">
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900"></div>
        <div className="font-mono">{formatPrice(price)}</div>
        <div className="text-gray-300 mt-1">Close on {date}</div>
        {change !== null && (
          <div className="text-subtle mt-1 text-[10px]">
            {change >= 0 ? '+' : ''}
            {(change * 100).toFixed(2)}% vs prior month end
          </div>
        )}
      </div>
    </td>
  );
}

export default function MonthEndPriceTable({ data, ticker }: MonthEndPriceTableProps) {
  if (data.length === 0) {
    return null;
  }

  // Most recent year first, matching the returns table above it. The change
  // lookups still index into `data`, which stays in ascending order.
  const rows = data.map((yearData, index) => ({ yearData, index })).reverse();

  return (
    <div className="bg-panel rounded-lg shadow-md p-4 mt-4">
      <h2 className="text-lg font-semibold text-content mb-4">{ticker} Month-End Prices</h2>

      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-700 text-white">
              <th className="px-2 py-2 text-left font-medium">Year</th>
              {MONTHS.map((month) => (
                <th key={month} className="px-2 py-2 text-center font-medium">
                  {month}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium bg-gray-800">Year End</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ yearData, index }, rowIndex) => (
              <tr key={yearData.year} className={rowIndex % 2 === 0 ? 'bg-panel' : 'bg-panel-2'}>
                <td className="px-2 py-1.5 font-medium text-content border-r border-line">
                  {yearData.year}
                </td>
                {yearData.monthEndPrices.map((price, monthIndex) => {
                  const change = monthChange(data, index, monthIndex);
                  return (
                    <PriceCell
                      key={monthIndex}
                      price={price}
                      date={yearData.monthEndDates[monthIndex]}
                      change={change}
                      className={`px-1 py-1.5 text-center border-r border-line ${getPriceColor(change)}`}
                    />
                  );
                })}
                <td className="px-2 py-1.5 text-center font-medium border-l-2 border-line bg-panel-2 text-content">
                  {formatPrice(yearData.yearEndPrice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-emerald-100 border border-emerald-800 rounded"></div>
          <span>Up on the month</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-100 border border-red-800 rounded"></div>
          <span>Down on the month</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-subtle">
            Closing price on the last trading day of each month — hover a cell for that date.
            Year End is December, or the latest month in a partial year.
          </span>
        </div>
      </div>
    </div>
  );
}
