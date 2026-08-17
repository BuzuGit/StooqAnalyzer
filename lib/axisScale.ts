/**
 * Y-axis scales for the price chart. Ported from PortfolioBacktester so both apps
 * pick the same gridlines for the same data.
 */

export interface AxisScale {
  domain: [number, number];
  ticks: number[];
}

/**
 * A tight, tidy LINEAR scale.
 *
 * Recharts' `domain={['auto','auto']}` is generous to a fault: a series topping out at
 * 11.16 gets an axis running to 15, leaving a third of the chart as empty sky. This does
 * the job by hand:
 *   1. take the actual high and low on screen,
 *   2. try gridline steps from fine to coarse — 1, 2, 2.5 or 5 times a power of ten,
 *   3. round the low DOWN and the high UP to a multiple of that step,
 *   4. keep the FIRST (finest) step that still fits inside maxTicks gridlines.
 *
 * Finest-that-fits is what keeps it tight — the axis never overshoots the data by more
 * than one gridline — and snapping to a multiple of the step is what makes it readable:
 * 20, 30, 40 rather than 21.4, 30.6, 39.8.
 */
export function niceAxisScale(
  values: (number | null | undefined)[],
  opts?: { maxTicks?: number }
): AxisScale | null {
  const clean = values.filter((v): v is number => typeof v === 'number' && isFinite(v));
  if (clean.length === 0) return null;

  let lo = Math.min(...clean);
  let hi = Math.max(...clean);
  let span = hi - lo;
  // A dead-flat series has no span at all; invent one so the line lands mid-chart
  // instead of collapsing onto a single gridline.
  if (span <= 0) {
    span = Math.abs(hi) * 0.1 || 1;
    lo = hi - span / 2;
    hi = lo + span;
  }

  const maxTicks = opts?.maxTicks ?? 10;
  // Start two orders of magnitude below the span — far finer than could ever fit — and
  // walk upwards, so the first step that fits is the tightest possible nice axis.
  const startExp = Math.floor(Math.log10(span)) - 2;
  for (let exp = startExp; exp <= startExp + 6; exp++) {
    for (const mantissa of [1, 2, 2.5, 5]) {
      const step = mantissa * Math.pow(10, exp);
      const axisLo = Math.floor(lo / step) * step;
      const axisHi = Math.ceil(hi / step) * step;
      const count = Math.round((axisHi - axisLo) / step) + 1;
      if (count < 3 || count > maxTicks) continue;
      // Floating point leaves crumbs like 6.000000000000001 — round one decimal past
      // the step's own precision.
      const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
      const ticks: number[] = [];
      for (let i = 0; i < count; i++) {
        ticks.push(parseFloat((axisLo + i * step).toFixed(decimals)));
      }
      return { domain: [ticks[0], ticks[ticks.length - 1]], ticks };
    }
  }
  return { domain: [lo, hi], ticks: [] };
}

/**
 * The same job on a LOGARITHMIC axis.
 *
 * On a log axis equal distances mean equal PERCENTAGE moves, so a doubling looks the
 * same at 5 as at 500. That is what rescues an asset that has grown a hundredfold: on a
 * linear axis its early years are squashed flat against the bottom, because a move from
 * 4 to 5 is one unit while a recent move is fifty.
 *
 * Two things differ from the linear version:
 *  - padding is MULTIPLICATIVE (a 2% divide/multiply), because that is what "a little
 *    breathing room" means on this scale;
 *  - gridlines come from the 1-2-5 family (10, 20, 50, 100…) rather than a constant
 *    step, since a constant step is not what looks even here. How dense that family
 *    needs to be depends on how many powers of ten the data spans.
 *
 * Returns null when nothing positive is left to plot — a log axis cannot draw zero or a
 * negative number — so the caller can fall back to linear rather than break.
 */
export function niceLogAxisScale(
  values: (number | null | undefined)[],
  opts?: { maxTicks?: number }
): AxisScale | null {
  const clean = values.filter(
    (v): v is number => typeof v === 'number' && isFinite(v) && v > 0
  );
  if (clean.length === 0) return null;

  const maxTicks = opts?.maxTicks ?? 10;
  const pad = 1.02;
  const domLo = Math.min(...clean) / pad;
  const domHi = Math.max(...clean) * pad;

  const decades = Math.log10(domHi / domLo);
  const mantissas =
    decades >= 2
      ? [1, 2, 5] // wide range: decade markers only
      : decades >= 1
      ? [1, 1.5, 2, 3, 5, 7] // about one decade
      : [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8]; // less than a decade: finer

  let ticks: number[] = [];
  for (let exp = Math.floor(Math.log10(domLo)); exp <= Math.ceil(Math.log10(domHi)); exp++) {
    for (const m of mantissas) {
      // toPrecision(12) clears binary-floating-point crumbs like 0.30000000000000004
      const t = parseFloat((m * Math.pow(10, exp)).toPrecision(12));
      if (t >= domLo && t <= domHi) ticks.push(t);
    }
  }
  ticks.sort((a, b) => a - b);
  while (ticks.length > maxTicks) ticks = ticks.filter((_, i) => i % 2 === 0);

  // Too sparse to read (a narrow range) — borrow the linear axis's round numbers. They
  // are still POSITIONED by the log scale; only the choice of label values comes from
  // there.
  if (ticks.length < 4) {
    const linear = niceAxisScale(clean, { maxTicks });
    const borrowed = linear ? linear.ticks.filter((t) => t >= domLo && t <= domHi) : [];
    if (borrowed.length > ticks.length) ticks = borrowed;
  }

  return { domain: [domLo, domHi], ticks };
}
