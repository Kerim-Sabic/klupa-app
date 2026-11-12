import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { renderUi } from '../../ui/testUtils';
import { createDetector } from './detector';
import { fakeDetector, installCamera, installFrames, removeCamera } from './liveFakes';
import { ShotLabPage } from './ShotLabPage';
import { synthesizeKick } from './synthetic';

vi.mock('./detector', () => ({ createDetector: vi.fn() }));
vi.mock('./Skeleton3D', () => ({ Skeleton3D: () => <div data-testid="skeleton-3d" /> }));

beforeEach(async () => {
  vi.resetAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  removeCamera();
});

describe('Shot lab live mode', () => {
  it('is offered only where the browser has a camera API, with what will happen first', () => {
    const { unmount } = renderUi(<ShotLabPage />);
    expect(screen.queryByRole('button', { name: 'Use the camera live' })).not.toBeInTheDocument();
    unmount();
    installCamera();
    renderUi(<ShotLabPage />);
    expect(screen.getByRole('button', { name: 'Use the camera live' })).toBeInTheDocument();
    expect(screen.getByText(/nothing is recorded or sent/)).toBeInTheDocument();
  });

  it('opens the camera, catches a strike and shows it as a skeleton-only result', async () => {
    const camera = installCamera();
    const clock = installFrames(1000 / 30);
    vi.mocked(createDetector).mockResolvedValue(
      fakeDetector(synthesizeKick({ duration: 5, strikeTime: 2 })),
    );
    renderUi(<ShotLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Use the camera live' }));
    await screen.findByText('Camera is on');
    act(() => {
      clock.run(80);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'See this strike' }));
    // Leaving the live view lets the camera go.
    expect(camera.tracks.every((track) => track.stop.mock.calls.length > 0)).toBe(true);
    expect(screen.getByText(/^Right-foot strike at/)).toBeInTheDocument();
    expect(screen.getByText(/skeleton only, no video was kept/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The caught strike' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the camera' }));
    expect(await screen.findByText('Camera is on')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: 'Use the camera live' })).toBeInTheDocument();
  });

  it('tells a browser without WebAssembly that it cannot run the model', () => {
    installCamera();
    vi.stubGlobal('WebAssembly', undefined);
    renderUi(<ShotLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Use the camera live' }));
    expect(screen.getByText('This browser cannot run the body model')).toBeInTheDocument();
  });
});
