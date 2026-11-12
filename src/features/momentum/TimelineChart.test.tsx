import { describe, expect, it } from 'vitest';
import { momentumSeries } from '../../engine';
import { renderUi } from '../../ui/testUtils';
import { TimelineChart } from './TimelineChart';

const readings = momentumSeries(
  [{ id: 'a', period: 1, t: 60, side: 'home', weight: 900 }],
  1,
  600,
  5,
);

function draw(animate?: boolean) {
  const { container } = renderUi(
    <TimelineChart
      readings={readings}
      marks={[]}
      durationSeconds={600}
      windowIndex={0}
      cursorIndex={0}
      sideNames={{ home: 'Home', away: 'Away' }}
      label="chart"
      onScrub={() => undefined}
      {...(animate !== undefined && { animate })}
    />,
  );
  const line = container.querySelector('path.stroke-ink');
  if (line === null) throw new Error('No line drawn.');
  return line;
}

describe('TimelineChart animate', () => {
  it('draws the line in by default and lands at once when animation is off', () => {
    // Off: the line starts complete, with no dash offset left over from a draw-in.
    const still = draw(false);
    expect(still.getAttribute('d')).toMatch(/^M/);
    expect(still.getAttribute('stroke-dasharray') ?? '1px 1px').not.toMatch(/^0px/);
    const drawn = draw();
    expect(drawn.getAttribute('d')).toBe(still.getAttribute('d'));
  });
});
