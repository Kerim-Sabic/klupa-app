import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampShare, Ring } from './Ring';
import { RingStack } from './RingStack';
import { Sparkline, sparkPath, sparkPoints } from './Sparkline';
import { spanPercent, StateStrip } from './StateStrip';
import { renderUi, setLanguage } from './testUtils';

beforeEach(async () => {
  await setLanguage('en');
});

describe('Ring', () => {
  it('is one image named by its label and value', () => {
    renderUi(<Ring value={0.82} label="Fair minutes" valueText="82%" />);
    expect(screen.getByRole('img', { name: 'Fair minutes: 82%' })).toBeInTheDocument();
  });

  it('draws a dashed track and no arc when there is nothing to measure', () => {
    const { container } = renderUi(<Ring value={null} label="Observed" valueText="Not yet" />);
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(1);
    expect(circles[0]).toHaveAttribute('stroke-dasharray');
  });

  it('pins impossible shares to the ends', () => {
    expect(clampShare(1.4)).toBe(1);
    expect(clampShare(-0.2)).toBe(0);
    expect(clampShare(Number.NaN)).toBe(0);
    expect(clampShare(0.5)).toBe(0.5);
  });
});

describe('Ring sweep', () => {
  let callback: IntersectionObserverCallback = () => undefined;
  const disconnect = vi.fn();

  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(next: IntersectionObserverCallback) {
          callback = next;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('waits until the ring is on screen, then stops watching', () => {
    const { container } = renderUi(<Ring value={0.5} label="Effort" valueText="50%" />);
    expect(container.querySelectorAll('circle')).toHaveLength(2);
    act(() => {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('RingStack', () => {
  it('names the figure with every ring, and lists each with its detail and link', () => {
    renderUi(
      <RingStack
        title="Three rings"
        rings={[
          {
            id: 'a',
            label: 'Fair minutes',
            value: 0.9,
            valueText: '90%',
            tone: 'fair',
            to: '/fairness',
          },
          {
            id: 'b',
            label: 'Observed',
            value: null,
            valueText: 'Not yet',
            detail: 'Nothing yet',
            tone: 'seen',
          },
          { id: 'c', label: 'Effort', value: 0.25, valueText: '25%', tone: 'effort' },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', {
        name: 'Three rings. Fair minutes: 90%. Observed: Not yet. Effort: 25%',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fair minutes\s*90%/ })).toHaveAttribute(
      'href',
      '/fairness',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });
});

describe('Sparkline', () => {
  it('scales values into the box, highest at the top', () => {
    const points = sparkPoints([0, 10, 5], 100, 20, 0);
    expect(points).toEqual([
      { x: 0, y: 20 },
      { x: 50, y: 0 },
      { x: 100, y: 10 },
    ]);
    expect(sparkPath(points)).toBe('M0.00 20.00 L50.00 0.00 L100.00 10.00');
  });

  it('centres a flat or single-value series and skips values that are not numbers', () => {
    expect(sparkPoints([3, 3], 100, 20).map((point) => point.y)).toEqual([10, 10]);
    expect(sparkPoints([Number.NaN, 4], 100, 20)).toEqual([{ x: 50, y: 10 }]);
    expect(sparkPoints([], 100, 20)).toEqual([]);
  });

  it('is an image named by its caller and marks the latest value', () => {
    const { container } = renderUi(<Sparkline values={[1, 3, 2]} label="Load, last 6 weeks: 2" />);
    expect(screen.getByRole('img', { name: 'Load, last 6 weeks: 2' })).toBeInTheDocument();
    expect(container.querySelector('path')).not.toBeNull();
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });
});

describe('StateStrip', () => {
  it('keeps every span inside the whole', () => {
    expect(spanPercent(0, 30, 120)).toBe(25);
    expect(spanPercent(-10, 30, 120)).toBe(25);
    expect(spanPercent(100, 200, 120)).toBeCloseTo(100 / 6, 10);
    expect(spanPercent(50, 40, 120)).toBe(0);
    expect(spanPercent(0, 10, 0)).toBe(0);
  });

  it('draws one band per segment and a gap at each period break, behind a text alternative', () => {
    const { container } = renderUi(
      <StateStrip
        label="Stable 75%, Not enough evidence 25%"
        total={120}
        breaks={[60]}
        segments={[
          { from: 0, to: 90, state: 'stable' },
          { from: 90, to: 120, state: 'insufficient' },
        ]}
      />,
    );
    const strip = screen.getByRole('img', { name: 'Stable 75%, Not enough evidence 25%' });
    const bands = strip.querySelectorAll<HTMLElement>('span[class*="h-full"]');
    expect([...bands].map((band) => band.style.width)).toEqual(['75%', '25%']);
    expect(container.querySelector('span[style*="left: 50%"]')).not.toBeNull();
  });
});
