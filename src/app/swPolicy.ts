/**
 * What the service worker does with one request. This is the single statement of the caching
 * rules; `public/sw.js` carries a copy of the same function body (see the note there), and
 * `swPolicy.test.ts` runs both against the same table so they cannot drift apart.
 *
 * - `network-first`: page navigations. Fresh when online, the cached app shell when not.
 * - `cache-first`: same-origin files that never change under the same URL (hashed build
 *   assets) or change rarely and are large (icons, models, vision files, research data).
 * - `none`: everything else, above all Supabase and every other origin, writes, and range
 *   requests (a partial 206 response cannot be cached and replayed as a whole file).
 */
export type CacheStrategy = 'network-first' | 'cache-first' | 'none';

export interface RequestFacts {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  /** True when the request asks for a byte range. */
  readonly hasRange: boolean;
}

export const CACHE_FIRST_PREFIXES = ['/assets/', '/icons/', '/models/', '/vision/', '/data/'];

export function cacheStrategy(request: RequestFacts, origin: string): CacheStrategy {
  if (request.method !== 'GET' || request.hasRange) return 'none';
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return 'none';
  }
  if (url.origin !== origin) return 'none';
  if (request.mode === 'navigate') return 'network-first';
  return CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    ? 'cache-first'
    : 'none';
}
