import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderUi } from '../../ui/testUtils';
import { fakeDetector, installCamera, installFrames, removeCamera } from './liveFakes';
import { LiveView } from './LiveView';
import { synthesizeKick } from './synthetic';
import { cameraError } from './useLiveCamera';

const kick = synthesizeKick({ duration: 5, strikeTime: 2 });

function domError(name: string) {
  return Object.assign(new Error(name), { name });
}

function setup(frames = kick, options: { cameras?: number; stepMs?: number } = {}) {
  const camera = installCamera(options.cameras ?? 1);
  const clock = installFrames(options.stepMs ?? 1000 / 30);
  const detector = fakeDetector(frames);
  const getDetector = vi.fn(() => Promise.resolve(detector));
  const onSeeStrike = vi.fn();
  const onBack = vi.fn();
  const view = renderUi(
    <LiveView getDetector={getDetector} onSeeStrike={onSeeStrike} onBack={onBack} />,
  );
  return { ...view, camera, clock, detector, getDetector, onSeeStrike, onBack };
}

async function running() {
  await screen.findByText('Camera is on');
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

describe('LiveView', () => {
  it('asks for the back camera without sound and tracks a body over the picture', async () => {
    const { camera, clock } = setup();
    await running();
    expect(camera.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment', width: { ideal: 960 } },
      audio: false,
    });
    act(() => {
      clock.run(31);
    });
    expect(screen.getByText('Tracking')).toBeInTheDocument();
    expect(screen.getByText(/frames a second analysed/)).toHaveTextContent(/^(29|30|31) frames/);
    expect(screen.getByText('Left knee angle')).toBeInTheDocument();
    expect(screen.getByText(/Estimates from one camera/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is recorded, sent or saved/)).toBeInTheDocument();
  });

  it('runs one inference per animation frame', async () => {
    const { clock, detector } = setup();
    await running();
    act(() => {
      clock.run(10);
    });
    expect(vi.mocked(detector).detect.mock.calls).toHaveLength(10);
  });

  it('releases the camera on Stop and goes back to the start', async () => {
    const { camera, onBack } = setup();
    await running();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
    expect(screen.queryByText('Camera is on')).not.toBeInTheDocument();
  });

  it('releases the camera when the tab is hidden', async () => {
    const { camera } = setup();
    await running();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Reflect.deleteProperty(document, 'visibilityState');
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
    expect(screen.getByText(/turned off because the page was hidden/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Start the camera again' }));
    await running();
    expect(camera.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('releases the camera when the page is left', async () => {
    const { camera, unmount } = setup();
    await running();
    unmount();
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
  });

  it('says plainly when tracking is lost', async () => {
    const { clock } = setup([{ time: 0, world: null }]);
    await running();
    act(() => {
      clock.run(5);
    });
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText(/Step back so the whole body is in the picture/)).toBeInTheDocument();
  });

  it('catches a strike and offers it without stopping the camera', async () => {
    const { clock, onSeeStrike } = setup();
    await running();
    act(() => {
      clock.run(80);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'See this strike' }));
    expect(screen.getByText('Right-foot strike caught')).toBeInTheDocument();
    const caught = onSeeStrike.mock.calls[0]?.[0] as { analysis: { foot: string } };
    expect(caught.analysis.foot).toBe('right');
    expect(screen.getByText('Camera is on')).toBeInTheDocument();
  });

  it('suggests filming a clip when the device stays under five frames a second', async () => {
    const { clock, onBack } = setup(kick, { stepMs: 300 });
    await running();
    act(() => {
      clock.run(25);
    });
    expect(screen.getByText('This device is too slow for live analysis')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Film a clip instead' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('switches between cameras when there are two, mirroring the front one', async () => {
    const { camera } = setup(kick, { cameras: 2 });
    await running();
    fireEvent.click(await screen.findByRole('button', { name: 'Switch camera' }));
    await running();
    expect(camera.getUserMedia).toHaveBeenLastCalledWith({
      video: { facingMode: 'user', width: { ideal: 960 } },
      audio: false,
    });
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
    expect(screen.getByLabelText(/Live camera picture/)).toHaveClass('-scale-x-100');
  });

  it('explains a refused permission and offers a way back', async () => {
    const camera = installCamera();
    camera.getUserMedia.mockRejectedValueOnce(domError('NotAllowedError'));
    installFrames(33);
    const onBack = vi.fn();
    renderUi(
      <LiveView
        getDetector={() => Promise.resolve(fakeDetector(kick))}
        onSeeStrike={vi.fn()}
        onBack={onBack}
      />,
    );
    expect(await screen.findByText('Camera permission was refused')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the start' }));
    expect(onBack).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Camera is on')).toBeInTheDocument();
  });

  it('keeps the camera message when the model download carries on behind it', async () => {
    const camera = installCamera();
    camera.getUserMedia.mockRejectedValueOnce(domError('NotReadableError'));
    installFrames(33);
    let report: (p: { loaded: number; total: number }) => void = () => undefined;
    const getDetector = (_signal: AbortSignal, onProgress: typeof report) => {
      report = onProgress;
      return new Promise<never>(() => undefined);
    };
    renderUi(<LiveView getDetector={getDetector} onSeeStrike={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByText('The camera is in use')).toBeInTheDocument();
    act(() => {
      report({ loaded: 3, total: 6 });
    });
    expect(screen.getByText('The camera is in use')).toBeInTheDocument();
  });

  it('says when the model cannot be loaded, and lets the camera go', async () => {
    const camera = installCamera();
    installFrames(33);
    renderUi(
      <LiveView
        getDetector={() => Promise.reject(new Error('offline'))}
        onSeeStrike={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(await screen.findByText('The body model could not be loaded')).toBeInTheDocument();
    expect(camera.tracks[0]?.stop).toHaveBeenCalled();
  });

  it('maps camera failures to what the coach can do', () => {
    expect(cameraError(domError('NotAllowedError'))).toBe('denied');
    expect(cameraError(domError('SecurityError'))).toBe('denied');
    expect(cameraError(domError('NotFoundError'))).toBe('no-camera');
    expect(cameraError(domError('OverconstrainedError'))).toBe('no-camera');
    expect(cameraError(domError('NotReadableError'))).toBe('in-use');
    expect(cameraError(domError('AbortError'))).toBe('in-use');
    expect(cameraError('nope')).toBe('unknown');
  });
});
