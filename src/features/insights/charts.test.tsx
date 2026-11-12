import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart } from './BarChart';
import { IntervalBar } from './IntervalBar';

function attribute(node: Element | null | undefined, name: string): number {
  return Number(node?.getAttribute(name));
}

describe('BarChart', () => {
  const bars = [
    { key: 'a', label: 'A', value: 50, valueText: '50%', reference: 25 },
    { key: 'b', label: 'B', value: 0, valueText: '0%', reference: 25 },
    { key: 'c', label: 'C', value: 10, valueText: '10%' },
  ];

  it('is an image with a text alternative, and every bar carries its own number', () => {
    const { container } = render(<BarChart bars={bars} max={50} description="Three bars" />);
    expect(screen.getByRole('img', { name: 'Three bars' })).toBeInTheDocument();
    for (const text of ['50%', '0%', '10%', 'A', 'B', 'C']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    // A zero bar draws no rectangle; the other two do. Dashed marks sit on the two with a reference.
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(container.querySelectorAll('line[stroke-dasharray]')).toHaveLength(2);
  });

  it('scales to the shared maximum, so two charts can be compared', () => {
    const { container } = render(
      <BarChart
        bars={[{ key: 'a', label: 'A', value: 25, valueText: '25%' }]}
        max={50}
        description="One"
      />,
    );
    expect(attribute(container.querySelector('rect'), 'height')).toBeCloseTo(48, 5);
  });

  it('draws flat bars, not NaN, when the scale is zero', () => {
    const { container } = render(
      <BarChart
        bars={[{ key: 'a', label: 'A', value: 0, valueText: '0' }]}
        max={0}
        description="Flat"
      />,
    );
    expect(container.querySelector('rect')).toBeNull();
    expect(container.innerHTML).not.toContain('NaN');
  });
});

describe('IntervalBar', () => {
  it('draws the range and the mark, with the reading as its text alternative', () => {
    const { container } = render(
      <IntervalBar point={0.6} interval={{ lower: 0.3, upper: 0.8 }} description="Rate 60%" />,
    );
    expect(screen.getByRole('img', { name: 'Rate 60%' })).toBeInTheDocument();
    const [range, mark] = Array.from(container.querySelectorAll('rect'));
    expect(attribute(range, 'x')).toBeCloseTo(30, 5);
    expect(attribute(range, 'width')).toBeCloseTo(50, 5);
    expect(attribute(mark, 'x')).toBeCloseTo(58.5, 5);
  });

  it('draws only the mark when no range can be formed, and keeps it inside the scale', () => {
    const { container } = render(<IntervalBar point={1} interval={null} description="Rate 100%" />);
    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(1);
    expect(attribute(rects[0], 'x') + attribute(rects[0], 'width')).toBeLessThanOrEqual(100);
  });

  it('never lets a range collapse to nothing', () => {
    const { container } = render(
      <IntervalBar point={0.5} interval={{ lower: 0.5, upper: 0.5 }} description="Narrow" />,
    );
    expect(attribute(container.querySelector('rect'), 'width')).toBeGreaterThanOrEqual(1);
  });
});
