import { z } from 'zod';

/*
 * What `/api/health` answers, as the status page reads it. The endpoint is ours, but the page
 * may be newer or older than the function behind it (the service worker can serve an old page
 * for a while), so the answer is validated like any other input.
 */

const probe = z.object({
  ok: z.boolean(),
  ms: z.number().nonnegative(),
  failure: z.enum(['not_configured', 'timeout', 'unreachable', 'bad_answer']).optional(),
});

const measure = z.number().nonnegative().nullable();

const field = z.object({
  errors1h: z.number().int().nonnegative(),
  errors24h: z.number().int().nonnegative(),
  errorKinds24h: z.number().int().nonnegative(),
  pages7d: z.object({
    samples: z.number().int().nonnegative(),
    lcpP75Ms: measure,
    inpP75Ms: measure,
    clsP75: measure,
  }),
});

const report = z.object({
  status: z.enum(['ok', 'degraded']),
  commit: z.string().nullable(),
  checkedAt: z.string(),
  checks: z.object({ database: probe, auth: probe }),
  // Absent on a function older than this page; null when the pulse could not be read.
  field: field.nullable().optional(),
});

export type StatusReport = z.infer<typeof report>;
export type ServiceCheck = z.infer<typeof probe>;
export type FieldNumbers = z.infer<typeof field>;

/** The health answer if it is one; an error naming nothing if it is not. */
export function parseStatus(body: unknown): StatusReport {
  const parsed = report.safeParse(body);
  if (!parsed.success) throw new Error('The health endpoint answered with something else.');
  return parsed.data;
}

/**
 * Asks the endpoint. A 503 is still an answer (the service saying it is degraded), so the
 * body is read whatever the status code; only an unreadable answer is a failure.
 */
export async function fetchStatus(fetchImpl: typeof fetch = fetch): Promise<StatusReport> {
  const response = await fetchImpl('/api/health', { headers: { Accept: 'application/json' } });
  return parseStatus(await response.json());
}

export const SPEED_MEASURES = ['lcp', 'inp', 'cls'] as const;
export type SpeedMeasure = (typeof SPEED_MEASURES)[number];
export type Rating = 'good' | 'fair' | 'poor';

/**
 * The thresholds the web's own guidance uses for "good" and "poor", at the 75th percentile:
 * largest paint 2.5 s and 4 s, slowest interaction 200 ms and 500 ms, layout movement 0.1 and
 * 0.25. Between the two is "needs work".
 */
export const SPEED_LIMITS: Readonly<Record<SpeedMeasure, readonly [number, number]>> = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
};

export function rate(measureName: SpeedMeasure, value: number): Rating {
  const [good, poor] = SPEED_LIMITS[measureName];
  if (value <= good) return 'good';
  return value <= poor ? 'fair' : 'poor';
}

/** The week's three numbers by name; null where no browser has reported one yet. */
export function speedOf(pages: FieldNumbers['pages7d']): Record<SpeedMeasure, number | null> {
  return { lcp: pages.lcpP75Ms, inp: pages.inpP75Ms, cls: pages.clsP75 };
}
