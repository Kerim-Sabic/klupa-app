import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  SEND_AFTER_MS,
  installVitals,
  largestShiftBurst,
  slowestInteraction,
  type ObserverClass,
  type VitalsOptions,
  type VitalsSample,
} from './vitals';

describe('largestShiftBurst', () => {
  it('adds up shifts less than a second apart and reports the worst burst', () => {
    const shifts = [
      { startTime: 100, value: 0.02, hadRecentInput: false },
      { startTime: 600, value: 0.03, hadRecentInput: false },
      { startTime: 4000, value: 0.01, hadRecentInput: false },
    ];
    expect(largestShiftBurst(shifts)).toBeCloseTo(0.05);
  });

  it('ignores movement right after a tap, and is zero when nothing moved', () => {
    expect(largestShiftBurst([{ startTime: 10, value: 0.4, hadRecentInput: true }])).toBe(0);
    expect(largestShiftBurst([])).toBe(0);
  });

  it('closes a burst after five seconds even if the page keeps moving', () => {
    const steady = Array.from({ length: 12 }, (_, index) => ({
      startTime: index * 900,
      value: 0.01,
      hadRecentInput: false,
    }));
    // 0 to 4,500 ms is one window of six shifts; the next window starts at 5,400 ms.
    expect(largestShiftBurst(steady)).toBeCloseTo(0.06);
  });

  it('is never more than everything added up, and never less than the largest single shift', () => {
    const shift = fc.record({
      startTime: fc.double({ min: 0, max: 60_000, noNaN: true }),
      value: fc.double({ min: 0, max: 1, noNaN: true }),
      hadRecentInput: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(shift, { maxLength: 40 }), (drawn) => {
        const shifts = [...drawn].sort((a, b) => a.startTime - b.startTime);
        const counted = shifts.filter((entry) => !entry.hadRecentInput);
        const total = counted.reduce((sum, entry) => sum + entry.value, 0);
        const largest = Math.max(0, ...counted.map((entry) => entry.value));
        const burst = largestShiftBurst(shifts);
        expect(burst).toBeLessThanOrEqual(total + 1e-9);
        expect(burst).toBeGreaterThanOrEqual(largest - 1e-9);
      }),
    );
  });
});

describe('slowestInteraction', () => {
  it('is the slowest of a few, and null when nobody tapped', () => {
    expect(slowestInteraction([80, 240, 120])).toBe(240);
    expect(slowestInteraction([])).toBeNull();
  });

  it('forgives one outlier for every fifty interactions', () => {
    const many = [...Array.from({ length: 99 }, () => 100), 3000];
    expect(slowestInteraction(many)).toBe(100);
  });
});

interface Harness {
  readonly sent: VitalsSample[];
  readonly emit: (type: string, entries: readonly object[]) => void;
  readonly fire: (event: string) => void;
  readonly runTimer: () => void;
  readonly stop: () => void;
  readonly timerMs: () => number | undefined;
}

function start(
  overrides: Partial<VitalsOptions> = {},
  unsupported: readonly string[] = [],
  realTimer = false,
): Harness {
  const sent: VitalsSample[] = [];
  const callbacks = new Map<string, (list: { getEntries: () => readonly object[] }) => void>();
  const listeners = new Map<string, () => void>();
  let hidden = false;
  let timer: (() => void) | undefined;
  let timerMs: number | undefined;
  const Observer = class {
    private readonly callback: (list: { getEntries: () => readonly object[] }) => void;
    constructor(callback: (list: { getEntries: () => readonly object[] }) => void) {
      this.callback = callback;
    }
    observe(options: { type: string }) {
      if (unsupported.includes(options.type)) throw new TypeError('not supported');
      callbacks.set(options.type, this.callback);
    }
    disconnect() {
      for (const [type, callback] of callbacks)
        if (callback === this.callback) callbacks.delete(type);
    }
  } as unknown as ObserverClass;
  const stop = installVitals({
    send: (sample) => {
      sent.push(sample);
      return Promise.resolve();
    },
    enabled: true,
    release: 'abc1234',
    pathname: () => '/pro/2058017',
    page: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
    },
    isHidden: () => hidden,
    Observer,
    ...(!realTimer && {
      setTimer: (run: () => void, ms: number) => {
        timer = run;
        timerMs = ms;
      },
    }),
    ...overrides,
  });
  return {
    sent,
    emit: (type, entries) => callbacks.get(type)?.({ getEntries: () => entries }),
    fire: (event) => {
      if (event === 'visibilitychange') hidden = true;
      listeners.get(event)?.();
    },
    runTimer: () => timer?.(),
    stop,
    timerMs: () => timerMs,
  };
}

describe('installVitals', () => {
  it('sends one sample when the page is hidden, with ids taken out of the route', () => {
    const page = start();
    page.emit('largest-contentful-paint', [{ startTime: 900.4, duration: 0 }]);
    page.emit('largest-contentful-paint', [{ startTime: 1840.6, duration: 0 }]);
    page.emit('layout-shift', [
      { startTime: 300, duration: 0, value: 0.042, hadRecentInput: false },
    ]);
    page.emit('event', [
      { startTime: 5000, duration: 96, interactionId: 7 },
      { startTime: 5001, duration: 184.2, interactionId: 7 },
      { startTime: 9000, duration: 300, interactionId: 0 },
    ]);
    page.fire('visibilitychange');
    page.fire('pagehide');
    page.runTimer();
    expect(page.sent).toEqual([
      { route: '/pro/:n', release: 'abc1234', lcp: 1841, inp: 184, cls: 42 },
    ]);
  });

  it('sends after twenty seconds if the page is never hidden', () => {
    const page = start();
    page.emit('largest-contentful-paint', [{ startTime: 1200, duration: 0 }]);
    expect(page.timerMs()).toBe(SEND_AFTER_MS);
    expect(page.sent).toEqual([]);
    page.runTimer();
    expect(page.sent).toEqual([
      { route: '/pro/:n', release: 'abc1234', lcp: 1200, inp: null, cls: 0 },
    ]);
  });

  it('leaves out what the browser cannot measure, and sends nothing if it can measure nothing', () => {
    const partial = start({}, ['layout-shift', 'event']);
    partial.emit('largest-contentful-paint', [{ startTime: 700, duration: 0 }]);
    partial.fire('pagehide');
    expect(partial.sent).toEqual([
      { route: '/pro/:n', release: 'abc1234', lcp: 700, inp: null, cls: null },
    ]);

    const none = start({}, ['largest-contentful-paint', 'layout-shift', 'event']);
    none.fire('pagehide');
    expect(none.sent).toEqual([]);
  });

  it('does nothing when switched off, without an observer, or after it is stopped', () => {
    const off = start({ enabled: false });
    off.fire('pagehide');
    expect(off.sent).toEqual([]);

    const old = start({ Observer: undefined });
    old.fire('pagehide');
    expect(old.sent).toEqual([]);

    const stopped = start();
    stopped.emit('largest-contentful-paint', [{ startTime: 700, duration: 0 }]);
    stopped.stop();
    stopped.runTimer();
    expect(stopped.sent).toEqual([]);
  });

  it('swallows a failed send and falls back to the real timer when none is given', async () => {
    vi.useFakeTimers();
    try {
      const failing = vi.fn(() => Promise.reject(new Error('offline')));
      const page = start({ send: failing }, [], true);
      page.emit('largest-contentful-paint', [{ startTime: 500, duration: 0 }]);
      await vi.advanceTimersByTimeAsync(SEND_AFTER_MS);
      expect(failing).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
