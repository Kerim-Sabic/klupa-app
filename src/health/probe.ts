/*
 * What `/api/health` answers with. The page itself is static, so "is the site up" says little:
 * this asks the two services every screen depends on and reports each one separately.
 *
 *   database  a round trip through the REST API into Postgres (the `health` function)
 *   auth      the sign-in service's own health route
 *
 * It also passes on the field pulse: how many error reports the app filed in the last hour
 * and day, and how fast pages were for the people using it this week. The pulse is counts and
 * percentiles only, and it never decides the status: a site can be up and still be having a
 * bad hour, and the monitor reads the two separately.
 *
 * It reveals nothing about the data: only up or down, how long each answer took, the commit
 * being served and the id of this request, so a failed probe can be found in the host's logs.
 */

export type ProbeFailure = 'not_configured' | 'timeout' | 'unreachable' | 'bad_answer';

export interface ProbeResult {
  readonly ok: boolean;
  /** Whole milliseconds the answer took. */
  readonly ms: number;
  readonly failure?: ProbeFailure;
}

/** How the last day went for the people using the app. Null numbers mean "no samples yet". */
export interface FieldPulse {
  readonly errors1h: number;
  readonly errors24h: number;
  readonly errorKinds24h: number;
  readonly pages7d: {
    readonly samples: number;
    /** 75th percentile: three in four page loads were at least this good. */
    readonly lcpP75Ms: number | null;
    readonly inpP75Ms: number | null;
    /** Layout movement, as the usual unitless score. */
    readonly clsP75: number | null;
  };
}

export interface HealthReport {
  readonly status: 'ok' | 'degraded';
  readonly commit: string | null;
  readonly requestId: string;
  readonly checkedAt: string;
  readonly checks: { readonly database: ProbeResult; readonly auth: ProbeResult };
  /** Null when the pulse could not be read; that alone never makes the site "degraded". */
  readonly field: FieldPulse | null;
}

export interface HealthInput {
  readonly supabaseUrl: string | undefined;
  readonly supabaseKey: string | undefined;
  readonly commit: string | undefined;
  readonly requestId: string;
  readonly fetch: typeof fetch;
  /** A clock in milliseconds; passed in so tests do not wait. */
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 3000;

/** How long the edge may answer from memory when the last probe was healthy. */
export const HEALTHY_FOR_SECONDS = 15;

type Ask = (signal: AbortSignal) => Promise<boolean>;

async function probe(ask: Ask, now: () => number, timeoutMs: number): Promise<ProbeResult> {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const elapsed = () => Math.max(0, Math.round(now() - started));
  try {
    const ok = await ask(controller.signal);
    return ok ? { ok, ms: elapsed() } : { ok, ms: elapsed(), failure: 'bad_answer' };
  } catch {
    // The reason stays one of a few fixed words: an error message could name internals.
    const failure = controller.signal.aborted ? 'timeout' : 'unreachable';
    return { ok: false, ms: elapsed(), failure };
  } finally {
    clearTimeout(timer);
  }
}

function isOkStatus(body: unknown): boolean {
  return (
    typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok'
  );
}

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
const measure = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** The database's pulse in the endpoint's own words; null for anything that is not a pulse. */
export function readPulse(body: unknown): FieldPulse | null {
  if (typeof body !== 'object' || body === null) return null;
  const pulse = body as Record<string, unknown>;
  const pages = pulse.vitals_7d;
  if (typeof pulse.errors_1h !== 'number' || typeof pages !== 'object' || pages === null) {
    return null;
  }
  const vitals = pages as Record<string, unknown>;
  const cls = measure(vitals.cls_p75_milli);
  return {
    errors1h: count(pulse.errors_1h),
    errors24h: count(pulse.errors_24h),
    errorKinds24h: count(pulse.error_kinds_24h),
    pages7d: {
      samples: count(vitals.samples),
      lcpP75Ms: measure(vitals.lcp_p75_ms),
      inpP75Ms: measure(vitals.inp_p75_ms),
      clsP75: cls === null ? null : cls / 1000,
    },
  };
}

/** Asks the database and the sign-in service, side by side, and never throws. */
export async function probeHealth(input: HealthInput): Promise<HealthReport> {
  const now = input.now ?? Date.now;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { supabaseUrl: url, supabaseKey: key } = input;
  const base = {
    commit: input.commit === undefined || input.commit === '' ? null : input.commit,
    requestId: input.requestId,
    checkedAt: new Date(now()).toISOString(),
  };

  if (url === undefined || url === '' || key === undefined || key === '') {
    const missing: ProbeResult = { ok: false, ms: 0, failure: 'not_configured' };
    return {
      status: 'degraded',
      ...base,
      checks: { database: missing, auth: missing },
      field: null,
    };
  }

  const headers = { apikey: key, 'Content-Type': 'application/json' };
  let field: FieldPulse | null = null;
  const [database, auth] = await Promise.all([
    probe(
      async (signal) => {
        const response = await input.fetch(`${url}/rest/v1/rpc/health`, {
          method: 'POST',
          headers,
          body: '{}',
          signal,
        });
        return response.ok && isOkStatus(await response.json());
      },
      now,
      timeoutMs,
    ),
    probe(
      async (signal) => {
        const response = await input.fetch(`${url}/auth/v1/health`, { headers, signal });
        return response.ok;
      },
      now,
      timeoutMs,
    ),
    // The pulse rides along under the same time limit. Its failure is recorded as "no pulse".
    probe(
      async (signal) => {
        const response = await input.fetch(`${url}/rest/v1/rpc/field_pulse`, {
          method: 'POST',
          headers,
          body: '{}',
          signal,
        });
        field = response.ok ? readPulse(await response.json()) : null;
        return field !== null;
      },
      now,
      timeoutMs,
    ),
  ]);

  return {
    status: database.ok && auth.ok ? 'ok' : 'degraded',
    ...base,
    checks: { database, auth },
    field,
  };
}
