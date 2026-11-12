import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderUi } from '../../ui/testUtils';
import { MovementLabPage } from './MovementLabPage';
import { serve, webgl } from './testServer';

vi.mock('./Pitch3D', () => ({
  Pitch3D: ({ selected, reduced }: { selected: number | null; reduced: boolean }) => (
    <div data-testid="pitch-3d">{`${String(selected)} ${String(reduced)}`}</div>
  ),
}));

async function ready() {
  return screen.findByRole('button', { name: 'Play' }, { timeout: 5000 });
}

const frames: FrameRequestCallback[] = [];
function runFrame(now: number) {
  const pending = frames.splice(0);
  act(() => {
    for (const callback of pending) callback(now);
  });
}

beforeEach(async () => {
  webgl(false);
  frames.length = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loading the match', () => {
  it('shows real download progress, with the honest note from the start', async () => {
    serve({ hold: true });
    renderUi(<MovementLabPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Match replay' })).toBeInTheDocument();
    expect(screen.getByText(/have no tracking data/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    });
    expect(screen.getByText('1.4 of 2.7 MB')).toBeInTheDocument();
  });

  it('says so when the match cannot be loaded, and tries again', async () => {
    const fetchMock = serve({ failFirst: true });
    const { user } = renderUi(<MovementLabPage />);
    expect(await screen.findByText('The match could not be loaded')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await ready()).toBeInTheDocument();
    // Index (failed), index, metadata, positions, physical report.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('treats a missing file as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );
    renderUi(<MovementLabPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });
});

describe('the replay without WebGL', () => {
  it('draws the flat pitch with every player, the readout and the attribution', async () => {
    serve();
    renderUi(<MovementLabPage />);
    await ready();
    expect(screen.getByText(/cannot draw 3D/)).toBeInTheDocument();
    const pitch = screen.getByRole('group', { name: 'The match from above' });
    expect(within(pitch).getAllByRole('button')).toHaveLength(22);
    expect(within(pitch).getByTestId('ball')).toBeInTheDocument();
    expect(screen.getByTestId('shape-home')).toBeInTheDocument();
    const readout = screen.getByRole('region', { name: 'Right now' });
    expect(readout).toHaveTextContent('00:00 · 1st half');
    expect(readout).toHaveTextContent(/Bayer 04 Leverkusen \d+% VfL Bochum 1848 \d+%/);
    expect(screen.getByTestId('live-line')).toHaveTextContent(/00:00, 1st half\./);
    expect(screen.getByText(/Bassek, M\., Rein, R\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CC BY 4.0 licence' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by/4.0/',
    );
    expect(screen.getAllByTestId('shot-mark').length).toBeGreaterThan(5);
  });

  it('steps, scrubs, changes half and speed, and jumps to chances', async () => {
    serve();
    const { user } = renderUi(<MovementLabPage />);
    await ready();
    const slider = screen.getByRole('slider', { name: 'Match time' });
    await user.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));
    expect(slider).toHaveValue('5');
    await user.click(screen.getByRole('button', { name: 'Back 5 seconds' }));
    await user.click(screen.getByRole('button', { name: 'Back 5 seconds' }));
    expect(slider).toHaveValue('0');
    fireEvent.change(slider, { target: { value: '754.5' } });
    expect(slider).toHaveAttribute('aria-valuetext', '12:34, 1st half');
    await user.click(screen.getByRole('button', { name: 'Previous chance' }));
    expect(Number((slider as HTMLInputElement).value)).toBeLessThan(754.5);
    await user.click(screen.getByRole('button', { name: 'Next chance' }));
    const first = screen.getAllByRole('option', { name: /shot by .* · xG/ })[0];
    if (first === undefined) throw new Error('no chances listed');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Jump to a chance' }), first);
    expect(slider).toHaveValue('46.374');
    await user.click(screen.getByRole('radio', { name: '4×' }));
    expect(screen.getByRole('radio', { name: '4×' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: '2nd half' }));
    expect(slider).toHaveAttribute('aria-valuetext', '45:00, 2nd half');
  });

  it('plays at the chosen speed and pauses, from the button and the keyboard', async () => {
    serve();
    const { user } = renderUi(<MovementLabPage />);
    await ready();
    const slider = screen.getByRole('slider', { name: 'Match time' });
    await user.click(screen.getByRole('radio', { name: '2×' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    runFrame(1000);
    runFrame(2000);
    expect(slider).toHaveValue('2');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(slider).toHaveValue('7');
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    fireEvent.keyDown(slider, { key: ' ' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('stops at the end of the half and starts again from kick-off', async () => {
    serve();
    const { user } = renderUi(<MovementLabPage />);
    await ready();
    const slider = screen.getByRole('slider', { name: 'Match time' });
    fireEvent.change(slider, { target: { value: '2768.5' } });
    await user.click(screen.getByRole('button', { name: 'Play' }));
    runFrame(0);
    runFrame(1000);
    expect(slider).toHaveValue('2769');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(slider).toHaveValue('0');
  });

  it('switches layers and follows a chosen player', async () => {
    serve();
    const { user } = renderUi(<MovementLabPage />);
    await ready();
    await user.click(screen.getByRole('switch', { name: 'Team shape' }));
    expect(screen.queryByTestId('shape-home')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Space control' }));
    expect(screen.getByTestId('space-layer')).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Player' }),
      'Bayer 04 Leverkusen 9',
    );
    await user.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));
    const readout = screen.getByRole('region', { name: 'Right now' });
    expect(readout).toHaveTextContent('Bayer 04 Leverkusen 9');
    expect(readout).toHaveTextContent(/Speed now\d+\.\d m\/s/);
    expect(readout).toHaveTextContent(/Distance this half0\.0\d km/);
    expect(screen.getByTestId('trail-layer')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Player trail' }));
    expect(screen.queryByTestId('trail-layer')).not.toBeInTheDocument();
    const pitch = screen.getByRole('group', { name: 'The match from above' });
    await user.click(within(pitch).getByRole('button', { name: 'VfL Bochum 1848 1' }));
    expect(readout).toHaveTextContent('VfL Bochum 1848 1');
    fireEvent.keyDown(within(pitch).getByRole('button', { name: 'Bayer 04 Leverkusen 1' }), {
      key: 'Enter',
    });
    expect(readout).toHaveTextContent('Bayer 04 Leverkusen 1');
  });

  it('speaks Bosnian', async () => {
    await i18n.changeLanguage('bs');
    serve();
    renderUi(<MovementLabPage />);
    expect(await screen.findByRole('button', { name: 'Pokreni' }, { timeout: 5000 })).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: '3D prikaz utakmice' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Za vaše utakmice nema podataka o praćenju/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Kontrola prostora' })).toBeInTheDocument();
  });
});

describe('the replay with WebGL', () => {
  it('opens the 3D view with camera presets', async () => {
    webgl(true);
    serve();
    const { user } = renderUi(<MovementLabPage />);
    await ready();
    expect(await screen.findByTestId('pitch-3d')).toHaveTextContent('null false');
    for (const name of ['From above', 'Behind a goal', 'Follow the ball', 'Side-on']) {
      await user.click(screen.getByRole('button', { name }));
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(screen.getByRole('img', { name: 'The match in 3D' })).toBeInTheDocument();
    expect(screen.getByText(/hold Ctrl and drag/)).toBeInTheDocument();
  });

  it('points a coach with a video of their own to the player overlay', async () => {
    webgl(true);
    serve();
    renderUi(<MovementLabPage />);
    await ready();
    expect(screen.getByRole('link', { name: /Try the player overlay/ })).toHaveAttribute(
      'href',
      '/overlay',
    );
  });

  it('shows the chosen player and their speed on the picture itself', async () => {
    webgl(true);
    serve();
    const { user } = renderUi(<MovementLabPage />);
    await ready();
    await screen.findByTestId('pitch-3d');
    expect(screen.queryByTestId('player-chip')).not.toBeInTheDocument();
    const player = screen.getByRole('combobox', { name: 'Player' });
    await user.selectOptions(player, within(player).getAllByRole('option')[1] as HTMLElement);
    // At kick-off nobody has a second of movement behind them yet.
    const chip = screen.getByTestId('player-chip');
    expect(chip).toHaveTextContent('Speed not known');
    expect(chip).toHaveAttribute('aria-hidden', 'true');
    await user.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));
    expect(screen.getByTestId('player-chip')).toHaveTextContent(/km\/h|Off the pitch/);
  });

  it('starts flat for reduced motion and opens 3D once the coach presses Play', async () => {
    webgl(true);
    serve();
    const { user } = renderUi(
      <MotionConfig reducedMotion="always">
        <MovementLabPage />
      </MotionConfig>,
    );
    await ready();
    expect(screen.getByText(/reduced motion/)).toBeInTheDocument();
    expect(screen.queryByTestId('pitch-3d')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByTestId('pitch-3d')).toHaveTextContent('null true');
  });
});
