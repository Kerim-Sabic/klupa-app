import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { registerServiceWorker, type ServiceWorkerHost } from './registerServiceWorker';
import { cacheStrategy, type CacheStrategy, type RequestFacts } from './swPolicy';

const ORIGIN = 'https://klupa.example';

function get(path: string, mode = 'cors'): RequestFacts {
  return { url: `${ORIGIN}${path}`, method: 'GET', mode, hasRange: false };
}

const CASES: readonly (readonly [string, RequestFacts, CacheStrategy])[] = [
  ['a navigation', get('/matches/123', 'navigate'), 'network-first'],
  ['the root navigation', get('/', 'navigate'), 'network-first'],
  ['a hashed build asset', get('/assets/index-abc123.js'), 'cache-first'],
  ['an icon', get('/icons/icon-192.png'), 'cache-first'],
  ['a model file', get('/models/pose.task'), 'cache-first'],
  ['a vision file', get('/vision/vision_wasm.wasm'), 'cache-first'],
  ['research data', get('/data/momentum.json'), 'cache-first'],
  ['the pro match list', get('/data/pro/index.json'), 'cache-first'],
  ['a pro match file', get('/data/pro/2058017.json'), 'cache-first'],
  ['a pro match page', get('/pro/2058017', 'navigate'), 'network-first'],
  // The seven tracked matches (about 20 MB): cached when a match is opened, never in advance.
  ['a match index', get('/data/tracking/index.json'), 'cache-first'],
  ['tracking positions', get('/data/tracking/J03WMX.bin'), 'cache-first'],
  ['a physical report', get('/data/tracking/J03WMX.physical.json'), 'cache-first'],
  ['a replay navigation', get('/movement/J03WMX', 'navigate'), 'network-first'],
  ['the manifest', get('/manifest.webmanifest'), 'none'],
  ['the worker itself', get('/sw.js'), 'none'],
  ['the health file', get('/healthz.json'), 'none'],
  ['a path that only starts like an asset folder', get('/assetsx/a.js'), 'none'],
  [
    'Supabase',
    {
      url: 'https://abc.supabase.co/rest/v1/players',
      method: 'GET',
      mode: 'cors',
      hasRange: false,
    },
    'none',
  ],
  [
    'a cross-origin navigation',
    { url: 'https://elsewhere.example/', method: 'GET', mode: 'navigate', hasRange: false },
    'none',
  ],
  ['a write', { ...get('/assets/a.js'), method: 'POST' }, 'none'],
  ['a range request', { ...get('/models/clip.mp4'), hasRange: true }, 'none'],
  ['an unreadable URL', { url: 'not a url', method: 'GET', mode: 'cors', hasRange: false }, 'none'],
];

/** The copy of the policy inside public/sw.js, run as the browser would run it. */
function workerPolicy(): typeof cacheStrategy {
  const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
  const start = source.indexOf('// policy:start');
  const end = source.indexOf('// policy:end');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const policy: unknown = runInNewContext(`${source.slice(start, end)}\ncacheStrategy;`, { URL });
  if (typeof policy !== 'function') throw new Error('sw.js has no cacheStrategy function.');
  return policy as typeof cacheStrategy;
}

describe('cacheStrategy', () => {
  for (const [what, request, expected] of CASES) {
    it(`gives ${what} "${expected}"`, () => {
      expect(cacheStrategy(request, ORIGIN)).toBe(expected);
    });
  }

  it('is word for word the policy the service worker runs', () => {
    const fromWorker = workerPolicy();
    for (const [what, request, expected] of CASES) {
      expect(fromWorker(request, ORIGIN), what).toBe(expected);
    }
  });
});

function host(overrides: Partial<ServiceWorkerHost> = {}) {
  const register = vi.fn<ServiceWorkerContainer['register']>();
  register.mockResolvedValue({} as ServiceWorkerRegistration);
  const value: ServiceWorkerHost = {
    production: true,
    serviceWorker: { register },
    afterLoad: (start) => {
      start();
    },
    ...overrides,
  };
  return { value, register };
}

describe('registerServiceWorker', () => {
  it('registers the worker for the whole app once the page has loaded, in production', () => {
    const { value, register } = host();
    expect(registerServiceWorker(value)).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('stays out of development and of browsers without workers', () => {
    const dev = host({ production: false });
    expect(registerServiceWorker(dev.value)).toBe(false);
    expect(dev.register).not.toHaveBeenCalled();
    expect(registerServiceWorker(host({ serviceWorker: undefined }).value)).toBe(false);
  });

  it('swallows a refused registration: the app works the same without one', async () => {
    const { value, register } = host();
    register.mockRejectedValue(new Error('denied'));
    expect(registerServiceWorker(value)).toBe(true);
    await Promise.resolve();
    expect(register).toHaveBeenCalledOnce();
  });

  it('does nothing in the test browser by default, which is not a production build', () => {
    expect(registerServiceWorker()).toBe(false);
  });
});
