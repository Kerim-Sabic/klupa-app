/*
 * Klupa's service worker: an offline app shell and a cache for files that do not change.
 *
 * Hand-written and dependency-free on purpose: it is small enough to read in one sitting,
 * and a worker that caches the wrong thing is worse than none.
 *
 * - Nothing is precached by name. Files are cached the first time the app fetches them.
 * - Navigations are network-first; the last good page is kept as the app shell, so a coach
 *   who has opened Klupa once can open it again at a pitch with no signal.
 * - Same-origin /assets/, /icons/, /models/, /vision/ and /data/ are cache-first.
 * - Supabase and every other origin are never touched: live data must never come from a cache.
 * - Bump VERSION to drop every old cache on the next activation.
 */

const VERSION = 'klupa-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const FILE_CACHE = `${VERSION}-files`;
/** The key the app shell is stored under: every navigation in this single-page app gets it. */
const SHELL_KEY = '/';

/*
 * The caching rules. This function is a copy of `cacheStrategy` in src/app/swPolicy.ts: the
 * worker is served as a plain static file from public/, outside the bundle, so it cannot
 * import the app's TypeScript. src/app/swPolicy.test.ts runs this copy and the original
 * against the same cases, so any drift fails the build.
 */
// policy:start
const CACHE_FIRST_PREFIXES = ['/assets/', '/icons/', '/models/', '/vision/', '/data/'];

function cacheStrategy(request, origin) {
  if (request.method !== 'GET' || request.hasRange) return 'none';
  let url;
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
// policy:end

self.addEventListener('install', () => {
  // A new worker has nothing to prepare, so it need not wait for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('klupa-') && !name.startsWith(`${VERSION}-`))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      await cache.put(SHELL_KEY, response.clone());
    }
    return response;
  } catch (error) {
    const shell = await cache.match(SHELL_KEY);
    if (shell !== undefined) return shell;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(FILE_CACHE);
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;
  const response = await fetch(request);
  // Only complete, same-origin answers are kept; an error page must never be replayed.
  if (response.ok && response.status === 200 && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const strategy = cacheStrategy(
    {
      url: request.url,
      method: request.method,
      mode: request.mode,
      hasRange: request.headers.has('range'),
    },
    self.location.origin,
  );
  if (strategy === 'network-first') event.respondWith(networkFirst(request));
  else if (strategy === 'cache-first') event.respondWith(cacheFirst(request));
  // 'none': no respondWith, so the browser handles the request as if there were no worker.
});
