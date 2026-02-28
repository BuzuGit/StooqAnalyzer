'use client';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DateAxisTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  isShortRange: boolean;
  isLongRange: boolean;
  yearChangeDates?: Set<string>;
}

/**
 * Custom X-axis tick for date labels.
 * - Short range: "15 Jan"
 * - Long range: "2024"
 * - Medium range: two-line — year (when it changes) + month
 *
 * `yearChangeDates` is a Set of date strings where the year differs from the previous tick.
 * Pass this to show the year label only on year transitions.
 */
export default function DateAxisTick({
  x,
  y,
  payload,
  isShortRange,
  isLongRange,
  yearChangeDates,
}: DateAxisTickProps) {
  if (x === undefined || y === undefined || !payload) return null;

  const d = new Date(payload.value);
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();

  if (isShortRange) {
    return (
      <text x={x} y={y + 12} fill="#6b7280" textAnchor="middle" fontSize={11}>
        {d.getDate()} {month}
      </text>
    );
  }

  if (isLongRange) {
    return (
      <text x={x} y={y + 12} fill="#6b7280" textAnchor="middle" fontSize={11}>
        {year}
      </text>
    );
  }

  // Medium range: year on first line (only when it changes), month on second
  const showYear = yearChangeDates ? yearChangeDates.has(payload.value) : true;

  return (
    <g>
      {showYear && (
        <text x={x} y={y + 12} fill="#9ca3af" textAnchor="middle" fontSize={10}>
          {year}
        </text>
      )}
      <text
        x={x}
        y={showYear ? y + 24 : y + 12}
        fill="#6b7280"
        textAnchor="middle"
        fontSize={11}
      >
        {month}
      </text>
    </g>
  );
}

/**
 * Pick ~count evenly-spaced dates from the data for use as explicit ticks.
 */
export function computeEvenTicks(dates: string[], count: number): string[] {
  if (dates.length <= count) return dates;
  const ticks: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (dates.length - 1)) / (count - 1));
    ticks.push(dates[idx]);
  }
  return ticks;
}

/**
 * Build a Set of tick dates where the year changes compared to the previous tick.
 * Always includes the first date. Pass the result as `yearChangeDates`.
 */
export function buildYearChangeDates(tickDates: string[]): Set<string> {
  const result = new Set<string>();
  let lastYear = -1;
  for (const date of tickDates) {
    const year = new Date(date).getFullYear();
    if (year !== lastYear) {
      result.add(date);
      lastYear = year;
    }
  }
  return result;
}
