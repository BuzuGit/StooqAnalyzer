import type { DataSource } from '@/components/TickerInput';

/**
 * Sources that can't return data right now, with the reason users are shown.
 * Shared by the page (which disables them) and the API (which refuses them), so a
 * source can't be switched off in one and still reachable in the other.
 *
 * Stooq: since 2026 it refuses every CSV download without a valid API key, and the
 * app's key (April 2026) is refused too — even Stooq's own site now denies a person
 * who solved its CAPTCHA. Remove the entry once a working key is set in Vercel.
 */
export const UNAVAILABLE_SOURCES: Partial<Record<DataSource, string>> = {
  stooq:
    'Unavailable for now. Stooq refuses every data download that doesn’t carry a working Stooq API key, and the app’s key (from April 2026) is no longer accepted. Stooq has stopped handing out keys on its website — ask for one at www@stooq.com. For the same instruments, use Google (WSE:KGH, WSE:WIG20) or Yahoo (KGH.WA, USDPLN=X).',
};

/** False for a source switched off above — nothing should try to load from it. */
export function isSourceAvailable(source: DataSource): boolean {
  return !UNAVAILABLE_SOURCES[source];
}
