import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { Scrubber } from './Scrubber';
import { SkeletonPanel } from './SkeletonPanel';

vi.mock('./Skeleton3D', () => ({
  Skeleton3D: ({ view }: { view: { azimuth: number; elevation: number; distance: number } }) => (
    <output data-testid="view">
      {[view.azimuth, view.elevation, view.distance].map((n) => n.toFixed(2)).join(' ')}
    </output>
  ),
}));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ({})) as unknown as HTMLCanvasElement['getContext'],
  );
  Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const view = () => screen.getByTestId('view').textContent;
const distance = (text: string) => Number(text.split(' ')[2]);

describe('SkeletonPanel gestures', () => {
  it('turns on drag, zooms on pinch and on Ctrl+wheel, and lets plain scrolling through', async () => {
    render(<SkeletonPanel poses={[]} index={0} foot={null} trail={null} summary="At the strike" />);
    expect(await screen.findByTestId('view')).toHaveTextContent('0.60 0.25 3.40');
    const surface = screen.getByRole('img', { name: /Skeleton in 3D/ });
    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 80, clientY: 110 });
    expect(view()).toBe('0.80 0.35 3.40');
    fireEvent.pointerDown(surface, { pointerId: 2, clientX: 200, clientY: 110 });
    fireEvent.pointerMove(surface, { pointerId: 2, clientX: 320, clientY: 110 });
    expect(distance(view())).toBeLessThan(3.4);
    fireEvent.pointerUp(surface, { pointerId: 1 });
    fireEvent.pointerCancel(surface, { pointerId: 2 });
    fireEvent.pointerMove(surface, { pointerId: 3, clientX: 0, clientY: 0 });
    const before = view();
    fireEvent.wheel(surface, { deltaY: 200 });
    expect(view()).toBe(before);
    fireEvent.wheel(surface, { deltaY: 200, ctrlKey: true });
    expect(distance(view())).toBeGreaterThan(distance(before));
    expect(screen.getByText('At the strike')).toBeInTheDocument();
  });
});

describe('Scrubber playback', () => {
  it('plays in slow motion to the end and stops', () => {
    let clock = 0;
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onChange = vi.fn();
    const times = [0, 0.1, 0.2, 0.3];
    const { rerender } = render(
      <Scrubber times={times} index={0} onChange={onChange} marks={null} speeds={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play slowly' }));
    for (let i = 0; i < 12 && queue.length > 0; i += 1) {
      const next = queue.shift();
      clock += 200;
      act(() => next?.(clock));
    }
    expect(onChange).toHaveBeenLastCalledWith(3);
    expect(screen.getByRole('button', { name: 'Play slowly' })).toBeInTheDocument();
    rerender(<Scrubber times={times} index={3} onChange={onChange} marks={null} speeds={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play slowly' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
