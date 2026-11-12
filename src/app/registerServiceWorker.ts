/** The parts of the browser the registration touches, so tests can stand them in. */
export interface ServiceWorkerHost {
  readonly production: boolean;
  readonly serviceWorker: Pick<ServiceWorkerContainer, 'register'> | undefined;
  /** Runs `start` once the page has loaded, so the worker never competes with first paint. */
  readonly afterLoad: (start: () => void) => void;
}

function browserHost(): ServiceWorkerHost {
  return {
    production: import.meta.env.PROD,
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    afterLoad: (start) => {
      if (document.readyState === 'complete') start();
      else window.addEventListener('load', start, { once: true });
    },
  };
}

/**
 * Registers `/sw.js` in production builds only: in development a cache-first worker would
 * serve stale modules and hide every edit. Failure is silent by design: the app works the
 * same without a worker, it just cannot open offline. Returns whether it tried.
 */
export function registerServiceWorker(host: ServiceWorkerHost = browserHost()): boolean {
  const container = host.serviceWorker;
  if (!host.production || container === undefined) return false;
  host.afterLoad(() => {
    container.register('/sw.js', { scope: '/' }).catch(() => {
      // Private windows and some embedded browsers refuse workers; nothing to tell the coach.
    });
  });
  return true;
}
