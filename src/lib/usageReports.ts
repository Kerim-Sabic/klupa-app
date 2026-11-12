/**
 * MediaPipe's library keeps usage counters (which task ran, how long a frame took, the browser
 * family) and posts them to this Google address about once a minute and when a task is closed.
 * It has no switch for that. The counters carry no picture and no landmark, but the camera
 * screens promise that nothing is sent, so the request is refused here, in the page, before it
 * can leave. The production Content-Security-Policy would refuse it too; this holds wherever
 * the app is served. After one refusal the library stops trying.
 */
export const USAGE_REPORT_HOST = 'odml.pa.googleapis.com';

const guards = new WeakSet<typeof fetch>();

function hostOf(input: RequestInfo | URL): string {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(href).host;
  } catch {
    // A relative address is one of our own files.
    return '';
  }
}

/** Call before a MediaPipe task is created. Safe to call again: it guards `fetch` once. */
export function refuseUsageReports(): void {
  const send = globalThis.fetch;
  if (guards.has(send)) return;
  const guard: typeof fetch = (input, init) =>
    hostOf(input) === USAGE_REPORT_HOST
      ? Promise.reject(new TypeError('Usage reports are not sent.'))
      : send.call(globalThis, input, init);
  guards.add(guard);
  globalThis.fetch = guard;
}
