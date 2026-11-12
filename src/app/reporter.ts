import { env } from '../lib/env';
import { isEnabled } from '../lib/flags';
import { createReporter } from '../lib/report';
import { installVitals } from '../lib/vitals';
import { supabase } from '../lib/supabase';

/**
 * The one error reporter of the app, on every page, signed in or not: it files through the
 * database function, which limits how many one account, and all signed-out pages together,
 * can send in an hour.
 */
export const reporter = createReporter({
  release: env.release,
  pathname: () => window.location.pathname,
  enabled: isEnabled('errorReports', env.disabled),
  send: async (report) => {
    const { error } = await supabase.rpc('report_client_error', {
      error_name: report.name,
      error_message: report.message,
      error_route: report.route,
      app_release: report.release,
      error_fingerprint: report.fingerprint,
    });
    if (error !== null) throw error;
  },
});

/** Starts page-speed sampling for this page load (see lib/vitals.ts). */
export function startVitals(): () => void {
  return installVitals({
    enabled: isEnabled('pageSpeed', env.disabled),
    release: env.release,
    pathname: () => window.location.pathname,
    page: {
      addEventListener: (type, listener) => {
        (type === 'visibilitychange' ? document : window).addEventListener(type, listener);
      },
      removeEventListener: (type, listener) => {
        (type === 'visibilitychange' ? document : window).removeEventListener(type, listener);
      },
    },
    isHidden: () => document.visibilityState === 'hidden',
    Observer: typeof PerformanceObserver === 'undefined' ? undefined : PerformanceObserver,
    send: async (sample) => {
      const { error } = await supabase.rpc('report_vitals', {
        page_route: sample.route,
        app_release: sample.release,
        ...(sample.lcp !== null && { lcp: sample.lcp }),
        ...(sample.inp !== null && { inp: sample.inp }),
        ...(sample.cls !== null && { cls: sample.cls }),
      });
      if (error !== null) throw error;
    },
  });
}
