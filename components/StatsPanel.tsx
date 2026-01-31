'use client';

import { useState } from 'react';
import { Statistics } from '@/lib/types';

interface StatsPanelProps {
  statistics: Statistics[];
  isLoading: boolean;
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 px-3 bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        <span className="font-semibold text-sm text-gray-700">{title}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-3 bg-white">{children}</div>}
    </div>
  );
}

interface StatRowProps {
  label: string;
  value: string | number;
  isNegative?: boolean;
  isPositive?: boolean;
}

function StatRow({ label, value, isNegative, isPositive }: StatRowProps) {
  let valueColor = 'text-gray-900';
  if (isNegative) valueColor = 'text-red-600';
  if (isPositive) valueColor = 'text-green-600';

  return (
    <div className="flex justify-between items-center py-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${valueColor}`}>{value}</span>
    </div>
  );
}

function formatNumber(num: number, decimals: number = 2): string {
  return num.toFixed(decimals);
}

function formatPercent(num: number, decimals: number = 2): string {
  return `${num >= 0 ? '+' : ''}${num.toFixed(decimals)}%`;
}

function formatDate(dateStr: string): string {
  return dateStr;
}

export default function StatsPanel({ statistics, isLoading }: StatsPanelProps) {
  if (isLoading) {
    return (
      <div className="bg-gray-50 rounded-lg shadow-md overflow-hidden">
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (statistics.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg shadow-md p-4">
        <p className="text-gray-500 text-sm text-center">
          Statistics will appear here after loading data
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-lg shadow-md overflow-hidden custom-scrollbar max-h-[calc(100vh-200px)] overflow-y-auto">
      {statistics.map((stats, index) => (
        <div key={stats.ticker} className={index > 0 ? 'border-t-4 border-gray-300' : ''}>
          {/* Ticker Header */}
          <div className="bg-blue-600 text-white py-2 px-3">
            <h3 className="font-bold text-lg">{stats.ticker}</h3>
          </div>

          {/* RETURNS Section */}
          <CollapsibleSection title="RETURNS">
            <StatRow
              label="Period Return"
              value={formatPercent(stats.periodReturn)}
              isPositive={stats.periodReturn > 0}
              isNegative={stats.periodReturn < 0}
            />
            <StatRow
              label="CAGR"
              value={formatPercent(stats.cagr)}
              isPositive={stats.cagr > 0}
              isNegative={stats.cagr < 0}
            />
            {stats.ytdReturn !== null && (
              <StatRow
                label="YTD Return"
                value={formatPercent(stats.ytdReturn)}
                isPositive={stats.ytdReturn > 0}
                isNegative={stats.ytdReturn < 0}
              />
            )}
            {stats.oneYearReturn !== null && (
              <StatRow
                label="1Y Return"
                value={formatPercent(stats.oneYearReturn)}
                isPositive={stats.oneYearReturn > 0}
                isNegative={stats.oneYearReturn < 0}
              />
            )}
            {stats.threeYearReturn !== null && (
              <StatRow
                label="3Y Return"
                value={formatPercent(stats.threeYearReturn)}
                isPositive={stats.threeYearReturn > 0}
                isNegative={stats.threeYearReturn < 0}
              />
            )}
            <StatRow
              label="Growth of $1"
              value={`$${formatNumber(stats.growthOf1)}`}
              isPositive={stats.growthOf1 > 1}
              isNegative={stats.growthOf1 < 1}
            />
          </CollapsibleSection>

          {/* DRAWDOWNS Section */}
          <CollapsibleSection title="DRAWDOWNS">
            <StatRow
              label="Max Drawdown"
              value={`-${formatNumber(stats.maxDrawdown)}%`}
              isNegative
            />
            <StatRow
              label="Current Drawdown"
              value={stats.currentDrawdown > 0 ? `-${formatNumber(stats.currentDrawdown)}%` : '0.00%'}
              isNegative={stats.currentDrawdown > 0}
            />
            <StatRow
              label="To Return to ATH"
              value={stats.toReturnToATH > 0 ? `+${formatNumber(stats.toReturnToATH)}%` : '0.00%'}
            />
            <StatRow label="Longest DD (days)" value={stats.longestDrawdownDays.toLocaleString()} />
          </CollapsibleSection>

          {/* STATS Section */}
          <CollapsibleSection title="STATS">
            <StatRow
              label="Annualized STD"
              value={`${formatNumber(stats.annualizedStd)}%`}
            />
            <StatRow
              label="Sharpe Ratio"
              value={formatNumber(stats.sharpeRatio)}
              isPositive={stats.sharpeRatio > 0}
              isNegative={stats.sharpeRatio < 0}
            />
          </CollapsibleSection>
        </div>
      ))}
    </div>
  );
}
