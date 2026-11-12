import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderUi } from '../../ui/testUtils';
import { readReplay } from './model';
import { ReadoutPanel } from './ReadoutPanel';
import { shippedFiles, syntheticTracking } from './testTracking';
import { loadTracking } from './useTrackingData';

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReadoutPanel', () => {
  it('says plainly when nobody is on the pitch and nothing is known about a player', () => {
    const empty = syntheticTracking(9, (f) => (f === 0 ? [0, 0] : null));
    renderUi(<ReadoutPanel readout={readReplay(empty, 1, 1, 0, null)} half="1st half" />);
    expect(screen.getAllByText('Nobody on the pitch')).toHaveLength(2);
    expect(screen.getByText('No players on the pitch')).toBeInTheDocument();
    expect(screen.getByText('Not on the pitch at this moment.')).toBeInTheDocument();
    expect(screen.getByText('Not known')).toBeInTheDocument();
  });

  it('uses Bosnian separators', async () => {
    await i18n.changeLanguage('bs');
    const run = syntheticTracking(41, (f, c) => [c === 1 ? 100 * f : 1000 * (c - 2), 100 * c]);
    renderUi(<ReadoutPanel readout={readReplay(run, 1, 5, 1, null)} half="1. poluvrijeme" />);
    expect(screen.getByText('4,0 m/s')).toBeInTheDocument();
  });
});

describe('loadTracking', () => {
  it('reads a body without a length header, or with no stream at all', async () => {
    const { meta, bin } = shippedFiles();
    const progress = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('.json')
            ? new Response(JSON.stringify(meta))
            : ({
                ok: true,
                body: null,
                headers: new Headers(),
                arrayBuffer: () => Promise.resolve(bin),
              } as unknown as Response),
        ),
      ),
    );
    const tracking = await loadTracking('J03WN1', new AbortController().signal, progress);
    expect(tracking.meta.roster).toHaveLength(29);
    expect(progress).toHaveBeenLastCalledWith(bin.byteLength, bin.byteLength);
  });
});
