'use client';

import { YearlyData, ReturnCalcDetail } from '@/lib/statistics';

interface ReturnsTableProps {
  data: YearlyData[];
  ticker: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  if (value === null) return 'bg-gray-50';
  if (value > 0) return 'bg-emerald-600 text-white';
  if (value < 0) return 'bg-red-500 text-white';
  return 'bg-gray-100';
}

function getReturnColorLight(value: number | null): string {
  if (value === null) return 'bg-gray-50';
  if (value > 0) return 'bg-emerald-100 text-emerald-800';
  if (value < 0) return 'bg-red-100 text-red-800';
  return 'bg-gray-100';
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
          <div className="text-gray-400 mt-1 text-[10px]">
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

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        {ticker} Monthly Returns
      </h2>

      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="px-2 py-2 text-left font-medium">Year</th>
              {MONTHS.map(month => (
                <th key={month} className="px-2 py-2 text-center font-medium">
                  {month}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium bg-blue-700">Annual</th>
              <th className="px-2 py-2 text-center font-medium bg-blue-700">STD</th>
              <th className="px-2 py-2 text-center font-medium bg-blue-700">Max DD</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((yearData, index) => (
              <tr
                key={yearData.year}
                className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              >
                <td className="px-2 py-1.5 font-medium text-gray-700 border-r border-gray-200">
                  {yearData.year}
                </td>
                {yearData.monthlyReturns.map((ret, monthIndex) => (
                  <ReturnCell
                    key={monthIndex}
                    value={ret}
                    detail={yearData.monthlyDetails[monthIndex]}
                    className={`px-1 py-1.5 text-center border-r border-gray-100 ${getReturnColor(ret)}`}
                  />
                ))}
                <ReturnCell
                  value={yearData.annualReturn}
                  detail={yearData.annualDetail}
                  className={`px-2 py-1.5 text-center font-medium border-l-2 border-gray-300 ${getReturnColor(yearData.annualReturn)}`}
                />
                <td className={`px-2 py-1.5 text-center ${getReturnColorLight(yearData.annualStd !== null ? 1 : null)}`}>
                  {formatStd(yearData.annualStd)}
                </td>
                <td className={`px-2 py-1.5 text-center ${yearData.maxDrawdown !== null && yearData.maxDrawdown > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-50'}`}>
                  {yearData.maxDrawdown !== null ? `-${yearData.maxDrawdown.toFixed(1)}%` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-emerald-600 rounded"></div>
          <span>Positive return</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span>Negative return</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <span className="text-gray-400">Hover over cells to see calculation details</span>
        </div>
      </div>
    </div>
  );
}
