/**
 * Shared display formatters. These existed as near-identical copies in several
 * components; keeping one copy means a change to how prices or months are rendered
 * lands everywhere at once instead of drifting.
 */

/** Canonical short month names, index 0 = Jan. */
export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Price with decimals scaled to magnitude, so a 4-figure index and a sub-unit FX
 * rate are both readable. `whenNull` is what to render for a missing value — the
 * returns table shows a dash, the month-end table leaves the cell empty.
 */
export function formatPrice(price: number | null | undefined, whenNull = ''): string {
  if (price === null || price === undefined) return whenNull;
  if (price >= 1000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(3);
  return price.toFixed(4);
}
