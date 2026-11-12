import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { downloadJson } from './download';

describe('downloadJson', () => {
  const createObjectURL = vi.fn<(blob: Blob) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();
  let click: MockInstance<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL.mockReset().mockReturnValue('blob:klupa-test');
    revokeObjectURL.mockReset();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves pretty-printed JSON under the given name, then lets go of the object URL', async () => {
    downloadJson('klupa-export-2026-11-12.json', { club: 'FK Sunce', players: [1, 2] });

    const link = click.mock.contexts[0];
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link instanceof HTMLAnchorElement && link.download).toBe('klupa-export-2026-11-12.json');
    expect(link instanceof HTMLAnchorElement && link.getAttribute('href')).toBe('blob:klupa-test');
    const blob = createObjectURL.mock.calls[0]?.[0];
    expect(blob?.type).toBe('application/json');
    expect(await blob?.text()).toBe(JSON.stringify({ club: 'FK Sunce', players: [1, 2] }, null, 2));
    // The link was only ever a means to the click.
    expect(document.querySelector('a[download]')).toBeNull();

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:klupa-test');
  });
});
