import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { removeCamera } from '../shotlab/liveFakes';
import { PEOPLE, setup } from './testSetup';

beforeEach(async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  removeCamera();
});

/**
 * The model runs on the page's own thread. These check the rule that keeps the page
 * answering on a slow device without costing a fast one any frames.
 */
describe('the overlay rests between analyses', () => {
  it('rests after each analysis on a slow device, so the page keeps answering', async () => {
    const { user, clock, detector } = setup();
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    await screen.findByText('Camera is on');
    // A detector that takes 300 ms of the page's own thread for every frame.
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    detector.detect.mockImplementation(() => {
      time += 300;
      return PEOPLE;
    });
    for (let frame = 0; frame < 45; frame += 1) {
      time += 1000 / 15;
      act(() => {
        clock.run(1);
      });
    }
    // Forty-five pictures arrived; one in five was analysed, and four frames in five were
    // left to the page: 300 ms of work, then at least 300 ms of rest.
    expect(detector.detect).toHaveBeenCalledTimes(9);
    // One a second reads "1 frame", not "1 frames".
    expect(screen.getByText(/frames? a second analysed/)).toHaveTextContent(
      /^(1 frame|2 frames) a second analysed$/,
    );
    // And Stop is answered at once.
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.getByRole('button', { name: 'Use the camera' })).toBeInTheDocument();
  });

  it('analyses every picture on a fast device: the rest is over before the next one arrives', async () => {
    const { user, clock, detector } = setup();
    await user.click(screen.getByRole('button', { name: 'Use the camera' }));
    await screen.findByText('Camera is on');
    // A detector that needs 10 ms, on a camera that gives thirty pictures a second.
    let time = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    detector.detect.mockImplementation(() => {
      time += 10;
      return PEOPLE;
    });
    for (let frame = 0; frame < 30; frame += 1) {
      time += 1000 / 30 - 10;
      act(() => {
        clock.run(1);
      });
    }
    expect(detector.detect).toHaveBeenCalledTimes(30);
  });
});
