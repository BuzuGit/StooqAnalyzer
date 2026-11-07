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

/**
 * English name of a currency pair from its ISO codes, e.g. USD + PLN →
 * "US Dollar / Polish Zloty". Gold (XAU) reads as "Gold"; an unknown code is
 * kept as typed.
 */
export function currencyPairName(base: string, quote: string): string {
  const names = new Intl.DisplayNames(['en'], { type: 'currency' });
  const of = (code: string) => {
    try {
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  };
  return `${of(base)} / ${of(quote)}`;
}
