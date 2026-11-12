import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refuseUsageReports, USAGE_REPORT_HOST } from './usageReports';

const network = vi.fn<typeof fetch>();

beforeEach(() => {
  network.mockReset();
  network.mockImplementation(() => Promise.resolve(new Response('ok')));
  vi.stubGlobal('fetch', network);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usage reports', () => {
  it('refuses the request the vision library makes, in each form an address can take', async () => {
    refuseUsageReports();
    const address = `https://${USAGE_REPORT_HOST}/v1/log`;
    await expect(fetch(address, { method: 'POST', body: 'counters' })).rejects.toThrow(TypeError);
    await expect(fetch(new URL(address))).rejects.toThrow(TypeError);
    await expect(fetch(new Request(address, { method: 'POST' }))).rejects.toThrow(TypeError);
    expect(network).not.toHaveBeenCalled();
  });

  it('lets every other request through untouched', async () => {
    refuseUsageReports();
    const init = { method: 'POST', body: '{}' };
    await fetch('https://example.supabase.co/rest/v1/players', init);
    await fetch('/models/efficientdet_lite0.tflite');
    await fetch(`https://example.org/?next=${USAGE_REPORT_HOST}`);
    expect(network.mock.calls).toEqual([
      ['https://example.supabase.co/rest/v1/players', init],
      ['/models/efficientdet_lite0.tflite', undefined],
      [`https://example.org/?next=${USAGE_REPORT_HOST}`, undefined],
    ]);
  });

  it('guards once, however often it is asked', async () => {
    refuseUsageReports();
    const guarded = globalThis.fetch;
    refuseUsageReports();
    refuseUsageReports();
    expect(globalThis.fetch).toBe(guarded);
    await fetch('/vision/vision_wasm_internal.wasm');
    expect(network).toHaveBeenCalledTimes(1);
  });
});
