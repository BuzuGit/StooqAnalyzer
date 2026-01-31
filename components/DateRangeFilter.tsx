'use client';

import { useState, useEffect } from 'react';

interface DateRangeFilterProps {
  minDate: string;
  maxDate: string;
  startDate: string;
  endDate: string;
  onRangeChange: (startDate: string, endDate: string) => void;
  disabled?: boolean;
}

export default function DateRangeFilter({
  minDate,
  maxDate,
  startDate,
  endDate,
  onRangeChange,
  disabled = false,
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
    <div className="bg-white rounded-lg shadow-md p-4 mb-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">From:</label>
          <input
            type="date"
            value={localStart}
            min={minDate}
            max={localEnd}
            onChange={(e) => handleStartChange(e.target.value)}
            disabled={disabled}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">To:</label>
          <input
            type="date"
            value={localEnd}
            min={localStart}
            max={maxDate}
            onChange={(e) => handleEndChange(e.target.value)}
            disabled={disabled}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        </div>

        <button
          onClick={handleReset}
          disabled={disabled}
          className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50"
        >
          Reset
        </button>

        <div className="h-6 w-px bg-gray-300"></div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-500 self-center">Quick:</span>
          {[
            { label: '1M', action: () => applyPreset(1) },
            { label: '3M', action: () => applyPreset(3) },
            { label: '6M', action: () => applyPreset(6) },
            { label: 'YTD', action: applyYTD },
            { label: '1Y', action: () => applyYearPreset(1) },
            { label: '3Y', action: () => applyYearPreset(3) },
            { label: '5Y', action: () => applyYearPreset(5) },
            { label: '10Y', action: () => applyYearPreset(10) },
            { label: 'All', action: handleReset },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={preset.action}
              disabled={disabled}
              className="px-2 py-1 text-xs bg-gray-100 hover:bg-blue-100 hover:text-blue-700 rounded transition-colors disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
