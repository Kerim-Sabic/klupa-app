/*
 * Telling us when a screen broke, without telling us anything about anyone.
 *
 * A report is the error's name, its message with identifiers scrubbed out, the route with ids
 * replaced, and the release. It is filed through a database function that accepts twenty an
 * hour per account, sixty an hour from all signed-out pages together, and that the app cannot
 * read back (see supabase/migrations, client_errors).
 * Reporting never throws: a failure to report must not become a second error.
 */

export interface ErrorReport {
  readonly name: string;
  readonly message: string;
  readonly route: string;
  readonly release: string;
  readonly fingerprint: string;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_NUMBER = /\d{4,}/g;

/** Removes what could identify a record or a person: ids, e-mail addresses, long numbers. */
export function scrub(text: string, limit: number): string {
  return text
    .replace(UUID, ':id')
    .replace(EMAIL, ':email')
    .replace(LONG_NUMBER, ':n')
    .slice(0, limit);
}

/** A short, stable id for "the same error": FNV-1a over the text, as eight hex digits. */
export function fingerprintOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** What would be sent for this error on this page. Pure, so it can be read and tested. */
export function describeError(error: unknown, pathname: string, release: string): ErrorReport {
  const isError = error instanceof Error;
  const name = scrub(isError ? error.name : 'NonError', 80);
  const raw = isError
    ? error.message
    : typeof error === 'string'
      ? error
      : 'A non-error was thrown';
  const message = scrub(raw, 300);
  const route = scrub(pathname, 120);
  return {
    name,
    message,
    route,
    release,
    fingerprint: fingerprintOf(`${name}|${message}|${route}`),
  };
}

export interface ReporterOptions {
  /** Files one report. Rejections are swallowed by the reporter. */
  readonly send: (report: ErrorReport) => Promise<void>;
  /** False when reporting is switched off for this build. Signed-out pages report too. */
  readonly enabled: boolean;
  readonly release: string;
  readonly pathname: () => string;
  /** At most this many distinct errors are reported per page load. */
  readonly limit?: number;
}

export interface Reporter {
  readonly report: (error: unknown) => Promise<void>;
}

export const DEFAULT_REPORT_LIMIT = 5;

/** A reporter that sends each distinct error once and stops after a few, so a loop cannot spam. */
export function createReporter(options: ReporterOptions): Reporter {
  const seen = new Set<string>();
  const limit = options.limit ?? DEFAULT_REPORT_LIMIT;
  return {
    async report(error) {
      try {
        const report = describeError(error, options.pathname(), options.release);
        if (seen.has(report.fingerprint) || seen.size >= limit) return;
        seen.add(report.fingerprint);
        if (!options.enabled) return;
        await options.send(report);
      } catch {
        // Deliberately silent: the page is already in trouble, and this must not add to it.
      }
    },
  };
}

/** Routes uncaught errors and unhandled rejections to the reporter. Returns the uninstaller. */
export function installErrorReporting(reporter: Reporter, target: Window): () => void {
  const onError = (event: ErrorEvent): void => {
    void reporter.report(event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    void reporter.report(event.reason);
  };
  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
