import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderPage, serveProData } from '../../test/proRender';
import { ProMatchPage } from './ProMatchPage';

const page = (path: string) => renderPage(path, [['/pro/:matchId', <ProMatchPage key="m" />]]);

const frames: FrameRequestCallback[] = [];
function runFrames(from: number, count: number, stepMs: number) {
  for (let i = 0; i < count; i += 1) {
    const pending = frames.splice(0);
    act(() => {
      for (const callback of pending) callback(from + i * stepMs);
    });
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function openFinal() {
  serveProData();
  const view = page('/pro/2058017');
  await screen.findByRole('heading', { level: 1, name: 'France v Croatia' }, { timeout: 5000 });
  return view;
}

const score = () => screen.getByText(/^France \d, Croatia \d$/);

describe('ProMatchPage', () => {
  it('opens at full time with the header score and every section', async () => {
    await openFinal();
    expect(score()).toHaveTextContent('France 4, Croatia 2');
    for (const name of [
      'Match in numbers',
      'Chance quality, as it piled up',
      'Who was on top',
      'Where the chances came from',
      'Players',
      'Source and limits',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText('Full time')).toBeInTheDocument();
    // Each goal is in the scoreboard and heads its own replay.
    expect(screen.getAllByText("38' A. Griezmann (pen)")).toHaveLength(2);
    expect(screen.getAllByText("18' M. Mandžukić (og)")).toHaveLength(2);
    expect(screen.getAllByRole('heading', { level: 3, name: /^\d+' / })).toHaveLength(6);
    const numbers = screen.getByRole('table', { name: 'France and Croatia compared' });
    expect(
      within(numbers).getByRole('rowheader', { name: 'Shots' }).parentElement,
    ).toHaveTextContent('8Shots14');
    expect(
      screen.getByRole('link', { name: 'doi:10.6084/m9.figshare.c.4415000' }),
    ).toBeInTheDocument();
  });

  it('is 0–0 at kick-off, follows the scrubber and returns to the full match', async () => {
    const { user } = await openFinal();
    const scrubber = screen.getByRole('slider', { name: 'Match time' });
    fireEvent.change(scrubber, { target: { value: '0' } });
    expect(score()).toHaveTextContent('France 0, Croatia 0');
    expect(screen.getByText('Paused')).toBeInTheDocument();
    fireEvent.change(scrubber, { target: { value: '2904' } });
    expect(score()).toHaveTextContent('France 2, Croatia 1');
    expect(screen.queryByText("59' P. Pogba")).toBeNull();
    fireEvent.keyDown(scrubber, { key: 'ArrowRight', shiftKey: true });
    expect(scrubber).toHaveValue('2964');
    await user.click(screen.getByRole('button', { name: 'Full match' }));
    expect(score()).toHaveTextContent('France 4, Croatia 2');
  });

  it(
    'plays as live, announces a goal and stops at the final whistle',
    { timeout: 20_000 },
    async () => {
      const { user } = await openFinal();
      await user.click(screen.getByRole('button', { name: 'Watch as live' }));
      expect(score()).toHaveTextContent('France 0, Croatia 0');
      expect(screen.getByText('As live')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Speed: 30 times/ }));
      // From 15:00 at 60x, six seconds of wall time is six minutes of play; the own goal came at 18'.
      fireEvent.change(screen.getByRole('slider', { name: 'Match time' }), {
        target: { value: '900' },
      });
      runFrames(0, 25, 250);
      expect(score()).toHaveTextContent('France 1, Croatia 0');
      expect(screen.getByText(/18' Goal, France: M\. Mandžukić, own goal/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Pause' }));
      expect(screen.getByText('Paused')).toBeInTheDocument();
      const scrubber = screen.getByRole('slider', { name: 'Match time' });
      fireEvent.change(scrubber, { target: { value: String(5907 - 40) } });
      fireEvent.keyDown(scrubber, { key: ' ' });
      expect(screen.getByText('As live')).toBeInTheDocument();
      runFrames(30_000, 6, 250);
      expect(score()).toHaveTextContent('France 4, Croatia 2');
      expect(screen.getByText('Full time')).toBeInTheDocument();
    },
  );

  it('pauses when the tab is hidden', async () => {
    const { user } = await openFinal();
    await user.click(screen.getByRole('button', { name: 'Watch as live' }));
    runFrames(0, 3, 250);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByText('Paused')).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('says plainly when a match does not exist', async () => {
    const fetchMock = serveProData();
    page('/pro/12345');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Match not found' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('treats an id that is not a number as not found', async () => {
    serveProData();
    page('/pro/not-a-number');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Match not found' }),
    ).toBeInTheDocument();
  });

  it('offers a retry when the match file fails', { timeout: 10_000 }, async () => {
    serveProData({ fail: ['2058017'] });
    const { user } = page('/pro/2058017');
    const alert = await screen.findByRole('alert', {}, { timeout: 6000 });
    expect(alert).toHaveTextContent('The match did not load');
    serveProData();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'France v Croatia' }),
    ).toBeInTheDocument();
  });
});
