import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderUi } from '../../ui/testUtils';
import { sampleVideo, VideoUnreadable } from './analyseVideo';
import { createDetector, type DetectedFrame, type LoadProgress } from './detector';
import { exampleFrames } from './example';
import { ShotLabPage } from './ShotLabPage';
import { synthesizeKick } from './synthetic';

vi.mock('./detector', () => ({ createDetector: vi.fn() }));
vi.mock('./analyseVideo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./analyseVideo')>()),
  sampleVideo: vi.fn(),
}));
vi.mock('./Skeleton3D', () => ({
  Skeleton3D: ({ index }: { index: number }) => <div data-testid="skeleton-3d">{index}</div>,
}));

const detector = {
  delegate: 'CPU' as const,
  beginClip: vi.fn(),
  detect: vi.fn(),
  close: vi.fn(),
};
const createUrl = vi.fn(() => 'blob:clip');
const revokeUrl = vi.fn();

function webgl(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() =>
    available ? {} : null) as unknown as HTMLCanvasElement['getContext']);
}

function chooseClip() {
  const input = screen.getByTestId('shotlab-file-input');
  const file = new File(['x'], 'kick.mp4', { type: 'video/mp4' });
  fireEvent.change(input, { target: { files: [file] } });
}

const sampled = (frames: DetectedFrame[], truncated = false) => ({
  frames,
  truncated,
  duration: 2.4,
});

beforeEach(async () => {
  vi.resetAllMocks();
  webgl(false);
  Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  createUrl.mockReturnValue('blob:clip');
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShotLabPage start', () => {
  it('offers the three ways in, with filming tips and the privacy promise', () => {
    renderUi(<ShotLabPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Shot lab' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Film a shot' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose a video' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See an example' })).toBeInTheDocument();
    expect(screen.getByText(/side-on, whole body in frame/)).toBeInTheDocument();
    expect(screen.getByText(/never uploaded or saved/)).toBeInTheDocument();
    const camera = screen.getByTestId('shotlab-camera-input');
    expect(camera).toHaveAttribute('capture', 'environment');
    const open = vi.spyOn(camera, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Film a shot' }));
    expect(open).toHaveBeenCalled();
  });

  it('speaks Bosnian too', async () => {
    await i18n.changeLanguage('bs');
    renderUi(<ShotLabPage />);
    expect(screen.getByRole('button', { name: 'Snimi udarac' })).toBeInTheDocument();
    expect(screen.getByText(/Nikada se ne šalje/)).toBeInTheDocument();
  });
});

describe('the example', () => {
  it('plays the synthetic kick through the whole result, with no detector', async () => {
    const { user } = renderUi(<ShotLabPage />);
    await user.click(screen.getByRole('button', { name: 'See an example' }));
    expect(screen.getByText('Right-foot strike at 1.30 s')).toBeInTheDocument();
    expect(screen.getByText(/generated kick, not a real player/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Measurements around the strike' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Peak foot speed' })).toBeVisible();
    expect(screen.getAllByText(/standing foot was well behind/)).toHaveLength(1);
    expect(screen.getAllByText('Uses estimated depth')).toHaveLength(3);
    expect(screen.getByText(/not a verdict/)).toBeInTheDocument();
    expect(createDetector).not.toHaveBeenCalled();
    // No WebGL in this browser: the 3D view says so and the words stay.
    expect(screen.getByText(/needs WebGL/)).toBeInTheDocument();
    expect(screen.getByText(/At the strike: the right foot is kicking/)).toBeInTheDocument();
  });

  it('steps frame by frame and jumps to the marked moments', async () => {
    const { user } = renderUi(<ShotLabPage />);
    await user.click(screen.getByRole('button', { name: 'See an example' }));
    const slider = screen.getByRole('slider', { name: 'Frame' });
    expect(slider).toHaveValue('39');
    await user.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(slider).toHaveValue('40');
    await user.click(screen.getByRole('button', { name: 'Previous frame' }));
    await user.click(screen.getByRole('button', { name: 'Backswing' }));
    expect(Number((slider as HTMLInputElement).value)).toBeLessThan(39);
    await user.click(screen.getByRole('button', { name: 'Follow-through' }));
    expect(Number((slider as HTMLInputElement).value)).toBeGreaterThan(39);
    await user.click(screen.getByRole('button', { name: 'Strike' }));
    expect(slider).toHaveValue('39');
    fireEvent.change(slider, { target: { value: '5' } });
    expect(slider).toHaveAttribute('aria-valuetext', 'Frame 6 of 72, 0.17 s');
    await user.click(
      screen.getByRole('button', { name: /Show frame 35 for Kicking knee at the top/ }),
    );
    expect(slider).toHaveValue('34');
  });

  it('plays slowly and pauses', async () => {
    const { user } = renderUi(<ShotLabPage />);
    await user.click(screen.getByRole('button', { name: 'See an example' }));
    await user.click(screen.getByRole('button', { name: 'Play slowly' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play slowly' })).toBeInTheDocument();
  });

  it('shows the 3D view when WebGL is there, with turn, zoom and reset controls', async () => {
    webgl(true);
    const { user } = renderUi(<ShotLabPage />);
    await user.click(screen.getByRole('button', { name: 'See an example' }));
    expect(await screen.findByTestId('skeleton-3d')).toHaveTextContent('39');
    for (const name of ['Turn left', 'Turn right', 'Zoom in', 'Zoom out', 'Reset view']) {
      await user.click(screen.getByRole('button', { name }));
    }
    expect(screen.getByRole('img', { name: /Skeleton in 3D/ })).toBeInTheDocument();
  });

  it('goes back to the start with New clip', async () => {
    const { user } = renderUi(<ShotLabPage />);
    await user.click(screen.getByRole('button', { name: 'See an example' }));
    await user.click(screen.getByRole('button', { name: 'New clip' }));
    expect(screen.getByRole('button', { name: 'Film a shot' })).toBeInTheDocument();
  });
});

describe('analysing a clip', () => {
  it('loads the model with progress, reads the frames, then shows the result', async () => {
    let report: (p: LoadProgress) => void = () => undefined;
    let ready: (value: typeof detector) => void = () => undefined;
    vi.mocked(createDetector).mockImplementation((_signal, onProgress) => {
      report = onProgress;
      return new Promise((resolve) => {
        ready = resolve;
      });
    });
    vi.mocked(sampleVideo).mockResolvedValue(sampled(exampleFrames(), true));
    renderUi(<ShotLabPage />);
    chooseClip();
    expect(await screen.findByText('Getting the body model ready')).toBeInTheDocument();
    act(() => {
      report({ loaded: 5_000_000, total: 20_000_000 });
    });
    expect(screen.getByText('5.0 of 20.0 MB')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await act(async () => {
      ready(detector);
      await Promise.resolve();
    });
    expect(await screen.findByText('Right-foot strike at 1.30 s')).toBeInTheDocument();
    expect(screen.getByText('Only the first 6 seconds were read')).toBeInTheDocument();
    expect(screen.getByLabelText('Your clip, analysed on this device')).toHaveAttribute(
      'src',
      'blob:clip',
    );
    expect(createUrl).toHaveBeenCalledTimes(1);
  });

  it('reports frame progress while reading', async () => {
    vi.mocked(createDetector).mockResolvedValue(detector);
    vi.mocked(sampleVideo).mockImplementation((_video, _detector, _signal, onProgress) => {
      onProgress(30, 120);
      return new Promise(() => undefined);
    });
    renderUi(<ShotLabPage />);
    chooseClip();
    expect(await screen.findByText(/Frame 30 of 120/)).toBeInTheDocument();
  });

  it('can be cancelled, and lets go of the video', async () => {
    vi.mocked(createDetector).mockReturnValue(new Promise(() => undefined));
    const { user } = renderUi(<ShotLabPage />);
    chooseClip();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Film a shot' })).toBeInTheDocument();
    await waitFor(() => {
      expect(revokeUrl).toHaveBeenCalledWith('blob:clip');
    });
  });

  it('says so when the model cannot be loaded, with a way back', async () => {
    vi.mocked(createDetector).mockRejectedValue(new Error('offline'));
    const { user } = renderUi(<ShotLabPage />);
    chooseClip();
    expect(await screen.findByText('The body model could not be loaded')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Film a shot' })).toBeInTheDocument();
  });

  it('says so when the video cannot be read, and offers the example', async () => {
    vi.mocked(createDetector).mockResolvedValue(detector);
    vi.mocked(sampleVideo).mockRejectedValue(new VideoUnreadable());
    const { user } = renderUi(<ShotLabPage />);
    chooseClip();
    expect(await screen.findByText('This video could not be read')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See an example' }));
    expect(screen.getByText('Right-foot strike at 1.30 s')).toBeInTheDocument();
  });

  it('handles an unexpected failure', async () => {
    vi.mocked(createDetector).mockResolvedValue(detector);
    vi.mocked(sampleVideo).mockRejectedValue(new TypeError('boom'));
    renderUi(<ShotLabPage />);
    chooseClip();
    expect(await screen.findByText('Something went wrong during the analysis')).toBeInTheDocument();
  });

  it('refuses to measure a body it did not see', async () => {
    vi.mocked(createDetector).mockResolvedValue(detector);
    const unseen = exampleFrames().map((f) => ({ ...f, world: null }));
    vi.mocked(sampleVideo).mockResolvedValue(sampled(unseen));
    renderUi(<ShotLabPage />);
    chooseClip();
    expect(await screen.findByText('The body was not seen well enough to measure')).toBeVisible();
    expect(screen.getByText(/no body was found/)).toBeInTheDocument();
    expect(screen.queryByText('Measurements around the strike')).not.toBeInTheDocument();
  });

  it('says when there is no clear strike instead of guessing', async () => {
    vi.mocked(createDetector).mockResolvedValue(detector);
    const still = synthesizeKick({ still: true }).map((f) => ({ ...f, image: null }));
    vi.mocked(sampleVideo).mockResolvedValue(sampled(still));
    renderUi(<ShotLabPage />);
    chooseClip();
    expect(await screen.findByText('No clear strike found')).toBeVisible();
    expect(screen.getByText(/Neither foot moved fast enough/)).toBeInTheDocument();
    expect(
      screen.getByText(/No strike was found, so no moment is singled out/),
    ).toBeInTheDocument();
  });

  it('tells a browser without WebAssembly that it cannot run the model', async () => {
    vi.stubGlobal('WebAssembly', undefined);
    const { user } = renderUi(<ShotLabPage />);
    chooseClip();
    expect(screen.getByText('This browser cannot run the body model')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See an example' }));
    expect(screen.getByText('Right-foot strike at 1.30 s')).toBeInTheDocument();
  });
});
