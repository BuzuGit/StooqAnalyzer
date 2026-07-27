'use client';

import { YearlyData, ReturnCalcDetail } from '@/lib/statistics';

interface ReturnsTableProps {
  data: YearlyData[];
  ticker: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTERS = ['1Q', '2Q', '3Q', '4Q'];

/** Mean of the values actually present, ignoring years that have no figure. */
function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/** How often the column was negative, over the years that have a figure. */
function lossRate(values: (number | null)[]): { losses: number; total: number } | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return { losses: present.filter((v) => v < 0).length, total: present.length };
}

function formatLossRate(rate: { losses: number; total: number } | null): string {
  if (rate === null) return '';
  return `${rate.losses}/${rate.total}`;
}

// Shade by how often the period lost money: mostly-negative reads red.
function getLossRateColor(rate: { losses: number; total: number } | null): string {
  if (rate === null || rate.total === 0) return 'bg-panel-2';
  const share = rate.losses / rate.total;
  if (share > 0.5) return 'bg-red-100 text-red-800';
  if (share < 0.5) return 'bg-emerald-100 text-emerald-800';
  return 'bg-panel-2';
}

function formatReturn(value: number | null): string {
  if (value === null) return '';
  return `${value >= 0 ? '' : ''}${value.toFixed(1)}%`;
}

function formatStd(value: number | null): string {
  if (value === null) return '';
  return `${value.toFixed(1)}%`;
}

function formatPrice(price: number | null): string {
  if (price === null) return '-';
  if (price >= 1000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(3);
  return price.toFixed(4);
}

function formatDate(date: string | null): string {
  if (!date) return '-';
  return date;
}

function getReturnColor(value: number | null): string {
  if (value === null) return 'bg-panel-2';
  if (value > 0) return 'bg-emerald-600 text-white';
  if (value < 0) return 'bg-red-500 text-white';
  return 'bg-panel-2';
}

function getReturnColorLight(value: number | null): string {
  if (value === null) return 'bg-panel-2';
  if (value > 0) return 'bg-emerald-100 text-emerald-800';
  if (value < 0) return 'bg-red-100 text-red-800';
  return 'bg-panel-2';
}

// Tooltip component for return cells
function ReturnCell({
  value,
  detail,
  className,
}: {
  value: number | null;
  detail: ReturnCalcDetail;
  className: string;
}) {
  if (value === null) {
    return <td className={className}></td>;
  }

  const tooltipContent = detail.startPrice !== null && detail.endPrice !== null
    ? `${formatPrice(detail.endPrice)} / ${formatPrice(detail.startPrice)} - 1 = ${value.toFixed(2)}%\n` +
      `From: ${formatDate(detail.startDate)}\n` +
      `To: ${formatDate(detail.endDate)}`
    : '';

  return (
    <td className={`${className} relative group cursor-help`}>
      {formatReturn(value)}
      {tooltipContent && (
        <div className="absolute z-50 hidden group-hover:block top-full left-1/2 transform -translate-x-1/2 mt-1 px-3 py-2 text-xs bg-gray-900 text-white rounded-lg shadow-lg whitespace-pre min-w-max">
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-gray-900"></div>
          <div className="font-mono">{formatPrice(detail.endPrice)} / {formatPrice(detail.startPrice)} - 1</div>
          <div className="text-gray-300 mt-1">= {value.toFixed(2)}%</div>
          <div className="text-subtle mt-1 text-[10px]">
            {formatDate(detail.startDate)} → {formatDate(detail.endDate)}
          </div>
        </div>
      )}
    </td>
  );
}

export default function ReturnsTable({ data, ticker }: ReturnsTableProps) {
  if (data.length === 0) {
    return null;
  }

  // Reverse to show most recent years first
  const sortedData = [...data].reverse();

  // Column-wise views of the whole history, for the summary rows.
  const monthColumns = MONTHS.map((_, m) => data.map((y) => y.monthlyReturns[m]));
  const quarterColumns = QUARTERS.map((_, q) => data.map((y) => y.quarterlyReturns[q]));
  const annualColumn = data.map((y) => y.annualReturn);
  const avgStd = average(data.map((y) => y.annualStd));
  const avgMaxDrawdown = average(data.map((y) => y.maxDrawdown));

  return (
    <div className="bg-panel rounded-lg shadow-md p-4 mt-4">
      <h2 className="text-lg font-semibold text-content mb-4">
        {ticker} Monthly Returns
      </h2>

      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-700 text-white">
              <th className="px-2 py-2 text-left font-medium">Year</th>
              {MONTHS.map(month => (
                <th key={month} className="px-2 py-2 text-center font-medium">
                  {month}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium bg-gray-800">Annual</th>
              <th className="px-2 py-2 text-center font-medium bg-gray-800">STD</th>
              <th className="px-2 py-2 text-center font-medium bg-gray-800">Max DD</th>
              {QUARTERS.map(quarter => (
                <th key={quarter} className="px-2 py-2 text-center font-medium bg-gray-800">
                  {quarter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((yearData, index) => (
              <tr
                key={yearData.year}
                className={index % 2 === 0 ? 'bg-panel' : 'bg-panel-2'}
              >
                <td className="px-2 py-1.5 font-medium text-content border-r border-line">
                  {yearData.year}
                </td>
                {yearData.monthlyReturns.map((ret, monthIndex) => (
                  <ReturnCell
                    key={monthIndex}
                    value={ret}
                    detail={yearData.monthlyDetails[monthIndex]}
                    className={`px-1 py-1.5 text-center border-r border-line ${getReturnColor(ret)}`}
                  />
                ))}
                <ReturnCell
                  value={yearData.annualReturn}
                  detail={yearData.annualDetail}
                  className={`px-2 py-1.5 text-center font-medium border-l-2 border-line ${getReturnColor(yearData.annualReturn)}`}
                />
                <td className={`px-2 py-1.5 text-center ${getReturnColorLight(yearData.annualStd !== null ? 1 : null)}`}>
                  {formatStd(yearData.annualStd)}
                </td>
                <td className={`px-2 py-1.5 text-center ${yearData.maxDrawdown !== null && yearData.maxDrawdown > 0 ? 'bg-red-100 text-red-800' : 'bg-panel-2'}`}>
                  {yearData.maxDrawdown !== null ? `-${yearData.maxDrawdown.toFixed(1)}%` : ''}
                </td>
                {yearData.quarterlyReturns.map((ret, quarterIndex) => (
                  <ReturnCell
                    key={quarterIndex}
                    value={ret}
                    detail={yearData.quarterlyDetails[quarterIndex]}
                    className={`px-2 py-1.5 text-center border-r border-line ${
                      quarterIndex === 0 ? 'border-l-2' : ''
                    } ${getReturnColor(ret)}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line">
              <td className="px-2 py-1.5 font-medium text-content border-r border-line">
                Average
              </td>
              {monthColumns.map((column, monthIndex) => (
                <td
                  key={monthIndex}
                  className={`px-1 py-1.5 text-center border-r border-line ${getReturnColorLight(
                    average(column)
                  )}`}
                >
                  {formatReturn(average(column))}
                </td>
              ))}
              <td
                className={`px-2 py-1.5 text-center font-medium border-l-2 border-line ${getReturnColorLight(
                  average(annualColumn)
                )}`}
              >
                {formatReturn(average(annualColumn))}
              </td>
              <td className={`px-2 py-1.5 text-center ${getReturnColorLight(avgStd !== null ? 1 : null)}`}>
                {formatStd(avgStd)}
              </td>
              <td className={`px-2 py-1.5 text-center ${avgMaxDrawdown !== null && avgMaxDrawdown > 0 ? 'bg-red-100 text-red-800' : 'bg-panel-2'}`}>
                {avgMaxDrawdown !== null ? `-${avgMaxDrawdown.toFixed(1)}%` : ''}
              </td>
              {quarterColumns.map((column, quarterIndex) => (
                <td
                  key={quarterIndex}
                  className={`px-2 py-1.5 text-center border-r border-line ${
                    quarterIndex === 0 ? 'border-l-2' : ''
                  } ${getReturnColorLight(average(column))}`}
                >
                  {formatReturn(average(column))}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-2 py-1.5 font-medium text-content border-r border-line">
                Loss rate
              </td>
              {monthColumns.map((column, monthIndex) => (
                <td
                  key={monthIndex}
                  className={`px-1 py-1.5 text-center border-r border-line ${getLossRateColor(
                    lossRate(column)
                  )}`}
                >
                  {formatLossRate(lossRate(column))}
                </td>
              ))}
              <td
                className={`px-2 py-1.5 text-center font-medium border-l-2 border-line ${getLossRateColor(
                  lossRate(annualColumn)
                )}`}
              >
                {formatLossRate(lossRate(annualColumn))}
              </td>
              {/* STD and Max DD are never negative, so a loss rate is meaningless there. */}
              <td className="px-2 py-1.5 bg-panel-2"></td>
              <td className="px-2 py-1.5 bg-panel-2"></td>
              {quarterColumns.map((column, quarterIndex) => (
                <td
                  key={quarterIndex}
                  className={`px-2 py-1.5 text-center border-r border-line ${
                    quarterIndex === 0 ? 'border-l-2' : ''
                  } ${getLossRateColor(lossRate(column))}`}
                >
                  {formatLossRate(lossRate(column))}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-emerald-600 rounded"></div>
          <span>Positive return</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span>Negative return</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-subtle">
            Loss rate = negative periods / periods with data. Hover over cells to see calculation
            details
          </span>
        </div>
      </div>
    </div>
  );
}
