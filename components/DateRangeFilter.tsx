'use client';

import { useState, useEffect } from 'react';

interface DateRangeFilterProps {
  minDate: string;
  maxDate: string;
  startDate: string;
  endDate: string;
  onRangeChange: (startDate: string, endDate: string) => void;
  disabled?: boolean;
  onDownloadExcel?: () => void;
  isDownloading?: boolean;
}

export default function DateRangeFilter({
  minDate,
  maxDate,
  startDate,
  endDate,
  onRangeChange,
  disabled = false,
  onDownloadExcel,
  isDownloading = false,
}: DateRangeFilterProps) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  const handleStartChange = (value: string) => {
    setLocalStart(value);
    if (value && value <= localEnd) {
      onRangeChange(value, localEnd);
    }
  };

  const handleEndChange = (value: string) => {
    setLocalEnd(value);
    if (value && value >= localStart) {
      onRangeChange(localStart, value);
    }
  };

  const handleReset = () => {
    setLocalStart(minDate);
    setLocalEnd(maxDate);
    onRangeChange(minDate, maxDate);
  };

  // Quick range presets
  const applyPreset = (months: number) => {
    const end = new Date(maxDate);
    const start = new Date(end);
    start.setMonth(start.getMonth() - months);

    const startStr = start.toISOString().split('T')[0];
    const clampedStart = startStr < minDate ? minDate : startStr;

    setLocalStart(clampedStart);
    setLocalEnd(maxDate);
    onRangeChange(clampedStart, maxDate);
  };

  const applyYearPreset = (years: number) => {
    const end = new Date(maxDate);
    const start = new Date(end);
    start.setFullYear(start.getFullYear() - years);

    const startStr = start.toISOString().split('T')[0];
    const clampedStart = startStr < minDate ? minDate : startStr;

    setLocalStart(clampedStart);
    setLocalEnd(maxDate);
    onRangeChange(clampedStart, maxDate);
  };

  // YTD preset
  const applyYTD = () => {
    const end = new Date(maxDate);
    const start = new Date(end.getFullYear(), 0, 1);

    const startStr = start.toISOString().split('T')[0];
    const clampedStart = startStr < minDate ? minDate : startStr;

    setLocalStart(clampedStart);
    setLocalEnd(maxDate);
    onRangeChange(clampedStart, maxDate);
  };

  if (!minDate || !maxDate) {
    return null;
  }

  return (
    <div className="bg-panel rounded-lg shadow-md p-4 mb-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-content">From:</label>
          <input
            type="date"
            value={localStart}
            min={minDate}
            max={localEnd}
            onChange={(e) => handleStartChange(e.target.value)}
            disabled={disabled}
            className="px-3 py-1.5 border border-line rounded-md text-sm bg-panel-2 text-content focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-content">To:</label>
          <input
            type="date"
            value={localEnd}
            min={localStart}
            max={maxDate}
            onChange={(e) => handleEndChange(e.target.value)}
            disabled={disabled}
            className="px-3 py-1.5 border border-line rounded-md text-sm bg-panel-2 text-content focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
        </div>

        <button
          onClick={handleReset}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-panel-2 hover:bg-panel-3 rounded-md transition-colors disabled:opacity-50"
        >
          Reset
        </button>

        <div className="h-6 w-px bg-line"></div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted self-center">Quick:</span>
          {[
            { label: '1M', action: () => applyPreset(1) },
            { label: '3M', action: () => applyPreset(3) },
            { label: '6M', action: () => applyPreset(6) },
            { label: 'YTD', action: applyYTD },
            { label: '1Y', action: () => applyYearPreset(1) },
            { label: '3Y', action: () => applyYearPreset(3) },
            { label: '5Y', action: () => applyYearPreset(5) },
            { label: '10Y', action: () => applyYearPreset(10) },
            { label: 'Max', action: handleReset },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={preset.action}
              disabled={disabled}
              className="px-2 py-1 text-xs bg-panel-2 hover:bg-panel-3 hover:text-content rounded transition-colors disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}

          {onDownloadExcel && (
            <button
              onClick={onDownloadExcel}
              disabled={disabled || isDownloading}
              title="Download all sourced data as an Excel workbook (daily, monthly, yearly)"
              className="ml-1 inline-flex items-center gap-1 px-3 py-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloading ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Excel
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
