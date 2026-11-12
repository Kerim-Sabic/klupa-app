import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderUi } from '../../ui/testUtils';
import { installCamera, installFrames, removeCamera } from '../shotlab/liveFakes';
import type { GetDetector } from './detector';
import { OverlayPage, SAMPLE_URL } from './OverlayPage';
import { setup, twoKits } from './testSetup';

function domError(name: string) {
  return Object.assign(new Error(name), { name });
}

beforeEach(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  removeCamera();
});

describe('OverlayPage', () => {
  it('opens with three ways in, the promise that nothing is uploaded, and its limits', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Player overlay' })).toBeInTheDocument();
    for (const name of ['Choose a video', 'Use the camera', 'Try it on a sample clip']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/Nothing is uploaded/)).toBeInTheDocument();
    expect(screen.getByText(/not where they are on the pitch/)).toBeInTheDocument();
    expect(screen.getByText(/Pressmaster on Pexels/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /See a whole match from tracking data/ }),
    ).toHaveAttribute('href', '/movement');
  });

  it('is in Bosnian for a Bosnian coach', async () => {
    await i18n.changeLanguage('bs');
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Igrači na snimku' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Koristi kameru' })).toBeInTheDocument();
    // One, a few and many frames each take their own form.
    expect(i18n.t('overlay.live.fps', { count: 1 })).toBe('Analiziran 1 kadar u sekundi');
    expect(i18n.t('overlay.live.fps', { count: 3 })).toBe('Analizirana 3 kadra u sekundi');
    expect(i18n.t('overlay.live.fps', { count: 12 })).toBe('Analizirano 12 kadrova u sekundi');
    expect(screen.getByText(/Ništa se ne šalje/)).toBeInTheDocument();
  });

  it('opens the back camera without sound, follows the players and counts them by team', async () => {
    const { user, camera, clock, detector } = setup({ pixels: twoKits() });
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    expect(await screen.findByText('Camera is on')).toBeInTheDocument();
    expect(camera.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false,
    });
    act(() => {
      clock.run(16);
    });
    expect(detector.detect).toHaveBeenCalledTimes(16);
    expect(screen.getByText(/frames a second analysed/)).toHaveTextContent(/^1[4-6] frames/);
    const counts = within(screen.getByTestId('overlay-counts'));
    expect(counts.getByText('Team 1').closest('div')).toHaveTextContent(/solid ring1$/);
    expect(counts.getByText('Team 2').closest('div')).toHaveTextContent(/dashed ring1$/);
    expect(counts.getByText('Neither team').closest('div')).toHaveTextContent(/0$/);
    expect(screen.getByText(/Still nothing uploaded/)).toBeInTheDocument();
  });

  it('says so when the kits cannot be told apart, and before anyone is found', async () => {
    const { user, clock } = setup();
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    await screen.findByText('Camera is on');
    expect(screen.getByText(/Nobody found yet/)).toBeInTheDocument();
    act(() => {
      clock.run(6);
    });
    const counts = within(screen.getByTestId('overlay-counts'));
    expect(counts.getByText('People found').closest('div')).toHaveTextContent(/2$/);
    expect(counts.queryByText('Team 1')).not.toBeInTheDocument();
    expect(screen.getByText(/too alike to tell the teams apart/)).toBeInTheDocument();
  });

  it('lets go of the camera on Stop, goes back to the start, and loads the model only once', async () => {
    const { user, camera, clock, getDetector, detector, unmount } = setup();
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    await screen.findByText('Camera is on');
    act(() => {
      clock.run(3);
    });
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
    expect(screen.queryByText('Camera is on')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    await screen.findByText('Camera is on');
    expect(getDetector).toHaveBeenCalledTimes(1);
    expect(detector.close).not.toHaveBeenCalled();
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(detector.close).toHaveBeenCalledTimes(1);
    expect(camera.tracks[1]?.stop).toHaveBeenCalled();
  });

  it('switches each layer off and on, also while nothing new is being analysed', async () => {
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const { user, clock } = setup();
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    await screen.findByText('Camera is on');
    act(() => {
      clock.run(5);
    });
    expect(context.ellipse).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('1', expect.any(Number), expect.any(Number));
    for (const name of ['Rings', 'Numbers', 'Trails']) {
      expect(screen.getByRole('switch', { name })).toBeChecked();
    }
    context.ellipse.mockClear();
    context.fillText.mockClear();
    await user.click(screen.getByRole('switch', { name: 'Rings' }));
    expect(screen.getByRole('switch', { name: 'Rings' })).not.toBeChecked();
    // Repainted at once from the last frame: numbers still there, rings gone.
    expect(context.fillText).toHaveBeenCalled();
    expect(context.ellipse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('switch', { name: 'Rings' }));
    expect(context.ellipse).toHaveBeenCalled();
  });

  it('plays a picked video from the device, pauses it, and forgets it on Stop', async () => {
    const { user, clock, createUrl, revokeUrl, play, camera } = setup();
    const file = new File(['not really a video'], 'match.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByTestId('overlay-file-input'), file);
    expect(await screen.findByText('Video is playing')).toBeInTheDocument();
    expect(createUrl).toHaveBeenCalledWith(file);
    expect(camera.getUserMedia).not.toHaveBeenCalled();
    const video = screen.getByLabelText('The picture being analysed');
    expect(video).toHaveAttribute('src', 'blob:picked-video');
    expect((video as HTMLVideoElement).loop).toBe(true);
    act(() => {
      clock.run(4);
    });
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeInTheDocument();
    play.mockClear();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Video is playing')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(revokeUrl).toHaveBeenCalledWith('blob:picked-video');
    expect(screen.getByRole('button', { name: 'Choose a video' })).toBeInTheDocument();
  });

  it('plays the sample clip straight from this site', async () => {
    const { user, createUrl } = setup();
    await user.click(screen.getByRole('button', { name: 'Try it on a sample clip' }));
    await screen.findByText('Video is playing');
    expect(screen.getByLabelText('The picture being analysed')).toHaveAttribute('src', SAMPLE_URL);
    expect(SAMPLE_URL).toBe('/data/overlay/sample.mp4');
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('shows how far the model has come while it loads', async () => {
    const camera = installCamera(1);
    installFrames(50);
    let ready: (() => void) | undefined;
    const getDetector: GetDetector = (_signal, onProgress) => {
      onProgress({ loaded: 3_627_170, total: 7_254_339 });
      return new Promise((resolve) => {
        ready = () => {
          resolve({ delegate: 'CPU', detect: () => [], close: vi.fn() });
        };
      });
    };
    const { user } = renderUi(<OverlayPage detector={getDetector} pixels={() => null} />);
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    expect(await screen.findByText('Loading the model: 3.6 of 7.3 MB')).toBeInTheDocument();
    expect(screen.queryByText('Camera is on')).not.toBeInTheDocument();
    await act(async () => {
      ready?.();
      await Promise.resolve();
    });
    expect(await screen.findByText('Camera is on')).toBeInTheDocument();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('explains a refused camera and offers the way back', async () => {
    const { user, camera } = setup();
    camera.getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    expect(await screen.findByText('Permission for the camera was refused')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to the start' }));
    expect(screen.getByRole('button', { name: 'Use the camera' })).toBeInTheDocument();
  });

  it('says when the model could not be loaded, lets go of the camera, and tries again', async () => {
    const { user, camera, getDetector } = setup({ model: 'fails' });
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    expect(await screen.findByText('The model could not be loaded')).toBeInTheDocument();
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('The model could not be loaded');
    // A failed load is not remembered: the second try asks for the model afresh.
    expect(getDetector).toHaveBeenCalledTimes(2);
  });

  it('says when a file is not a video the browser can play', async () => {
    const { user, play, revokeUrl } = setup();
    play.mockRejectedValueOnce(domError('NotSupportedError'));
    await user.upload(
      screen.getByTestId('overlay-file-input'),
      new File(['x'], 'notes.mkv', { type: 'video/x-matroska' }),
    );
    expect(await screen.findByText('This video could not be played')).toBeInTheDocument();
    expect(revokeUrl).toHaveBeenCalledWith('blob:picked-video');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Choose a video' })).toBeInTheDocument();
  });

  it('switches the camera off when the page is hidden, and on again when asked', async () => {
    const { user, camera } = setup();
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    await screen.findByText('Camera is on');
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
    expect(screen.getByText(/switched off because this page was hidden/)).toBeInTheDocument();
    visibility.mockReturnValue('visible');
    await user.click(screen.getByRole('button', { name: 'Switch the camera on again' }));
    expect(await screen.findByText('Camera is on')).toBeInTheDocument();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
  });
});
