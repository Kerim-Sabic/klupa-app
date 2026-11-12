import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler, { config } from '../../api/health';
import { HEALTHY_FOR_SECONDS } from './probe';

const URL_BASE = 'https://project.supabase.co';

function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const pathOf = (target: RequestInfo | URL): string =>
  typeof target === 'string' ? target : target instanceof URL ? target.href : target.url;

function request(): Request {
  return new Request('https://klupa.example/api/health', {
    headers: { 'x-vercel-id': 'fra1::abc' },
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', URL_BASE);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_unit_tests_only_000000');
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'abc123');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/health', () => {
  it('answers 200 with the commit and the request id when both services answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((target: RequestInfo | URL) =>
        Promise.resolve(
          pathOf(target).endsWith('/rpc/health') ? answer({ status: 'ok' }) : answer({}),
        ),
      ),
    );
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Request-Id')).toBe('fra1::abc');
    expect(await response.json()).toMatchObject({
      status: 'ok',
      commit: 'abc123',
      requestId: 'fra1::abc',
      checks: { database: { ok: true }, auth: { ok: true } },
    });
  });

  it('lets the edge keep a healthy answer briefly, so callers cannot multiply load downstream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(answer({ status: 'ok' }))),
    );
    const response = await handler(request());
    expect(response.headers.get('Cache-Control')).toBe(
      `public, max-age=0, s-maxage=${String(HEALTHY_FOR_SECONDS)}`,
    );
    expect(HEALTHY_FOR_SECONDS).toBe(15);
  });

  it('answers 503, never cached, and writes one structured line when a service is down', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn((target: RequestInfo | URL) =>
        pathOf(target).endsWith('/rpc/health')
          ? Promise.reject(new TypeError('connect ECONNREFUSED 10.0.0.1'))
          : Promise.resolve(answer({})),
      ),
    );
    const response = await handler(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await response.text();
    expect(body).toContain('"unreachable"');
    expect(body).not.toContain('ECONNREFUSED');

    expect(logged).toHaveBeenCalledTimes(1);
    const line: unknown = JSON.parse(String(logged.mock.calls[0]?.[0]));
    expect(line).toMatchObject({
      level: 'error',
      event: 'health.degraded',
      requestId: 'fra1::abc',
      checks: { database: { ok: false, failure: 'unreachable' }, auth: { ok: true } },
    });
  });

  it('mints a request id when the host did not send one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(answer({ status: 'ok' }))),
    );
    const response = await handler(new Request('https://klupa.example/api/health'));
    expect(response.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('runs at the edge, next to the database', () => {
    expect(config).toEqual({ runtime: 'edge', regions: ['fra1'] });
  });
});
