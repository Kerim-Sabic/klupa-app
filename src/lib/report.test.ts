import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REPORT_LIMIT,
  createReporter,
  describeError,
  fingerprintOf,
  installErrorReporting,
  scrub,
  type ErrorReport,
} from './report';

describe('scrub', () => {
  it('removes ids, e-mail addresses and long numbers, and cuts to the limit', () => {
    expect(
      scrub(
        'match 3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b of coach@example.org, row 1234567, shirt 7',
        300,
      ),
    ).toBe('match :id of :email, row :n, shirt 7');
    expect(scrub('x'.repeat(500), 300)).toHaveLength(300);
  });
});

describe('fingerprintOf', () => {
  it('is stable, eight hex digits, and different for different text', () => {
    expect(fingerprintOf('TypeError|x is undefined|/matches/:id')).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprintOf('a')).toBe(fingerprintOf('a'));
    expect(fingerprintOf('a')).not.toBe(fingerprintOf('b'));
    expect(fingerprintOf('')).toBe('811c9dc5');
  });
});

describe('describeError', () => {
  it('keeps the name and a scrubbed message, and turns the address into a route pattern', () => {
    const error = new TypeError('Cannot read player 3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b');
    const report = describeError(
      error,
      '/matches/3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b/live',
      'abc1234',
    );
    expect(report).toMatchObject({
      name: 'TypeError',
      message: 'Cannot read player :id',
      route: '/matches/:id/live',
      release: 'abc1234',
    });
    // The same bug on another match is the same error.
    const again = describeError(
      new TypeError('Cannot read player 11111111-2222-4333-8444-555555555555'),
      '/matches/99999999-2222-4333-8444-555555555555/live',
      'abc1234',
    );
    expect(again.fingerprint).toBe(report.fingerprint);
  });

  it('describes thrown strings and other values without guessing', () => {
    expect(describeError('boom', '/', 'r')).toMatchObject({ name: 'NonError', message: 'boom' });
    expect(describeError({ secret: 'value' }, '/', 'r')).toMatchObject({
      name: 'NonError',
      message: 'A non-error was thrown',
    });
  });
});

function setup(overrides: { enabled?: boolean; send?: () => Promise<void>; limit?: number } = {}) {
  const sent: ErrorReport[] = [];
  const send = vi.fn(async (report: ErrorReport) => {
    sent.push(report);
    await (overrides.send ?? (() => Promise.resolve()))();
  });
  const reporter = createReporter({
    send,
    enabled: overrides.enabled ?? true,
    release: 'abc1234',
    pathname: () => '/matches',
    ...(overrides.limit === undefined ? {} : { limit: overrides.limit }),
  });
  return { reporter, sent, send };
}

describe('createReporter', () => {
  it('files a report for an error', async () => {
    const { reporter, sent } = setup();
    await reporter.report(new RangeError('out of range'));
    expect(sent).toEqual([
      expect.objectContaining({ name: 'RangeError', route: '/matches', release: 'abc1234' }),
    ]);
  });

  it('sends the same error once, and stops after a handful of different ones', async () => {
    const { reporter, send } = setup();
    await reporter.report(new Error('same'));
    await reporter.report(new Error('same'));
    expect(send).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 10; index += 1)
      await reporter.report(new Error(`e${String(index)}`));
    expect(send).toHaveBeenCalledTimes(DEFAULT_REPORT_LIMIT);

    const tight = setup({ limit: 1 });
    await tight.reporter.report(new Error('first'));
    await tight.reporter.report(new Error('second'));
    expect(tight.send).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when reporting is switched off for the build', async () => {
    const { reporter, send } = setup({ enabled: false });
    await reporter.report(new Error('switched off'));
    expect(send).not.toHaveBeenCalled();
  });

  it('never throws, even when filing the report fails', async () => {
    const { reporter } = setup({ send: () => Promise.reject(new Error('offline')) });
    await expect(reporter.report(new Error('first failure'))).resolves.toBeUndefined();
  });
});

describe('installErrorReporting', () => {
  it('reports uncaught errors and unhandled rejections until it is removed', () => {
    const report = vi.fn<(error: unknown) => Promise<void>>(() => Promise.resolve());
    // A stand-in for the window: the test runner itself listens for uncaught errors on the real one.
    const page = new EventTarget() as unknown as Window;
    const remove = installErrorReporting({ report }, page);
    const error = new Error('uncaught');
    page.dispatchEvent(new ErrorEvent('error', { error }));
    page.dispatchEvent(new ErrorEvent('error', { message: 'script error' }));
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', { value: 'rejected' });
    page.dispatchEvent(rejection);
    expect(report.mock.calls.map(([value]) => value)).toEqual([error, 'script error', 'rejected']);

    remove();
    page.dispatchEvent(new ErrorEvent('error', { error }));
    expect(report).toHaveBeenCalledTimes(3);
  });
});
