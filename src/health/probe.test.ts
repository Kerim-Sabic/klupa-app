import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMEOUT_MS, probeHealth, readPulse, type HealthInput } from './probe';

const URL_BASE = 'https://project.supabase.co';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A stand-in for `fetch` that answers per path. */
function fakeFetch(answers: {
  database: () => Promise<Response>;
  auth: () => Promise<Response>;
  pulse?: () => Promise<Response>;
}) {
  return vi.fn<typeof fetch>((target) => {
    const path =
      typeof target === 'string' ? target : target instanceof URL ? target.href : target.url;
    if (path.endsWith('/rest/v1/rpc/field_pulse')) {
      return (answers.pulse ?? (() => Promise.resolve(json({ message: 'no pulse' }, 404))))();
    }
    return path.endsWith('/rest/v1/rpc/health') ? answers.database() : answers.auth();
  });
}

const PULSE = {
  errors_1h: 2,
  errors_24h: 9,
  error_kinds_24h: 3,
  vitals_7d: { samples: 140, lcp_p75_ms: 1840, inp_p75_ms: 96, cls_p75_milli: 42 },
};

function input(fetchImpl: typeof fetch, extra: Partial<HealthInput> = {}): HealthInput {
  return {
    supabaseUrl: URL_BASE,
    supabaseKey: 'publishable-key',
    commit: 'abc123',
    requestId: 'req-1',
    fetch: fetchImpl,
    now: () => 1_700_000_000_000,
    ...extra,
  };
}

const UP = {
  database: () => Promise.resolve(json({ status: 'ok' })),
  auth: () => Promise.resolve(json({ name: 'GoTrue' })),
};

describe('probeHealth', () => {
  it('is ok when the database and the sign-in service both answer', async () => {
    const fetchImpl = fakeFetch(UP);
    const report = await probeHealth(input(fetchImpl));
    expect(report).toEqual({
      status: 'ok',
      commit: 'abc123',
      requestId: 'req-1',
      checkedAt: '2023-11-14T22:13:20.000Z',
      checks: { database: { ok: true, ms: 0 }, auth: { ok: true, ms: 0 } },
      field: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [target, options] = fetchImpl.mock.calls[0] ?? [];
    expect(target).toBe(`${URL_BASE}/rest/v1/rpc/health`);
    expect(options).toMatchObject({ method: 'POST', headers: { apikey: 'publishable-key' } });
  });

  it('measures how long each answer took', async () => {
    let clock = 1000;
    const fetchImpl = fakeFetch({
      database: () => {
        clock += 42.4;
        return UP.database();
      },
      auth: UP.auth,
    });
    const report = await probeHealth(input(fetchImpl, { now: () => clock }));
    expect(report.checks.database.ms).toBe(42);
    expect(report.checks.database.ms).toBeCloseTo(42.4, 0);
  });

  it('is degraded when the database answers with an error', async () => {
    const report = await probeHealth(
      input(fakeFetch({ ...UP, database: () => Promise.resolve(json({ message: 'down' }, 503)) })),
    );
    expect(report.status).toBe('degraded');
    expect(report.checks.database).toEqual({ ok: false, ms: 0, failure: 'bad_answer' });
    expect(report.checks.auth.ok).toBe(true);
  });

  it('does not trust a 200 that is not the health answer', async () => {
    const report = await probeHealth(
      input(fakeFetch({ ...UP, database: () => Promise.resolve(json(['surprise'])) })),
    );
    expect(report.checks.database.failure).toBe('bad_answer');
  });

  it('is degraded when the sign-in service cannot be reached, without leaking why', async () => {
    const report = await probeHealth(
      input(
        fakeFetch({ ...UP, auth: () => Promise.reject(new TypeError('getaddrinfo secret.host')) }),
      ),
    );
    expect(report.status).toBe('degraded');
    expect(report.checks.auth).toEqual({ ok: false, ms: 0, failure: 'unreachable' });
    expect(JSON.stringify(report)).not.toContain('secret.host');
  });

  it('gives up on a service that does not answer in time', async () => {
    vi.useFakeTimers();
    try {
      const hanging = (_target: RequestInfo | URL, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      const pending = probeHealth(input(vi.fn(hanging), { timeoutMs: 50 }));
      await vi.advanceTimersByTimeAsync(50);
      const report = await pending;
      expect(report.status).toBe('degraded');
      expect(report.checks.database.failure).toBe('timeout');
      expect(report.checks.auth.failure).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
    expect(DEFAULT_TIMEOUT_MS).toBe(3000);
  });

  it('says so when it was deployed without its settings, and asks nobody', async () => {
    const fetchImpl = fakeFetch(UP);
    for (const extra of [{ supabaseUrl: undefined }, { supabaseKey: '' }]) {
      const report = await probeHealth(input(fetchImpl, { ...extra, commit: '' }));
      expect(report.status).toBe('degraded');
      expect(report.commit).toBeNull();
      expect(report.checks.database.failure).toBe('not_configured');
      expect(report.checks.auth.failure).toBe('not_configured');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads the real clock when none is passed in', async () => {
    const before = Date.now();
    const { now: _fixedClock, ...withoutClock } = input(fakeFetch(UP));
    const report = await probeHealth(withoutClock);
    expect(Date.parse(report.checkedAt)).toBeGreaterThanOrEqual(before);
  });
});

describe('the field pulse', () => {
  it("rides along with a healthy answer, in the endpoint's own words", async () => {
    const report = await probeHealth(
      input(fakeFetch({ ...UP, pulse: () => Promise.resolve(json(PULSE)) })),
    );
    expect(report.status).toBe('ok');
    expect(report.field).toEqual({
      errors1h: 2,
      errors24h: 9,
      errorKinds24h: 3,
      pages7d: { samples: 140, lcpP75Ms: 1840, inpP75Ms: 96, clsP75: 0.042 },
    });
  });

  it('never decides the status: no pulse is still ok, and a pulse does not rescue an outage', async () => {
    const noPulse = await probeHealth(
      input(fakeFetch({ ...UP, pulse: () => Promise.reject(new Error('boom')) })),
    );
    expect(noPulse.status).toBe('ok');
    expect(noPulse.field).toBeNull();

    const down = await probeHealth(
      input(
        fakeFetch({
          ...UP,
          database: () => Promise.resolve(json({ message: 'down' }, 503)),
          pulse: () => Promise.resolve(json(PULSE)),
        }),
      ),
    );
    expect(down.status).toBe('degraded');
    expect(down.field?.errors1h).toBe(2);
  });

  it('says "no samples yet" as null, and refuses anything that is not a pulse', () => {
    expect(
      readPulse({
        errors_1h: 0,
        errors_24h: 0,
        error_kinds_24h: 0,
        vitals_7d: { samples: 0, lcp_p75_ms: null, inp_p75_ms: null, cls_p75_milli: null },
      }),
    ).toEqual({
      errors1h: 0,
      errors24h: 0,
      errorKinds24h: 0,
      pages7d: { samples: 0, lcpP75Ms: null, inpP75Ms: null, clsP75: null },
    });
    expect(readPulse(null)).toBeNull();
    expect(readPulse('ok')).toBeNull();
    expect(readPulse({ errors_1h: 'many', vitals_7d: {} })).toBeNull();
    expect(readPulse({ errors_1h: 1 })).toBeNull();
    expect(
      readPulse({ errors_1h: -4, errors_24h: Number.NaN, vitals_7d: { samples: 'x' } }),
    ).toEqual({
      errors1h: 0,
      errors24h: 0,
      errorKinds24h: 0,
      pages7d: { samples: 0, lcpP75Ms: null, inpP75Ms: null, clsP75: null },
    });
  });
});
