import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { beforeEach, describe, expect, it } from 'vitest';
import scale from '../../../research/out/momentum_scale.json';
import cv from '../../../research/out/xg_cv.json';
import { demoMatches } from '../../data/dfl';
import { momentumSeries } from '../../engine';
import i18n from '../../i18n';
import { formatCount, formatDecimal, formatPercent } from './chartModel';
import { MomentumLab } from './MomentumLab';

MotionGlobalConfig.skipAnimations = true;

function firstHalfReadings(matchIndex: number) {
  const match = demoMatches[matchIndex];
  const period = match?.periods[0];
  if (match === undefined || period === undefined) throw new Error('Demo data is missing.');
  return {
    readings: momentumSeries(match.events, period.period, period.durationSeconds, 5),
    period,
  };
}

function moveCursor(index: number): void {
  fireEvent.change(screen.getByRole('slider'), { target: { value: String(index) } });
}

function chart(): HTMLElement {
  return screen.getByRole('img', { name: /Chance balance/ });
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('MomentumLab: the explorer', () => {
  it('renders the chart, the controls and one tile per conclusion', () => {
    render(<MomentumLab />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Who is on top');
    expect(chart()).toHaveAccessibleName(/Chance balance over the last 5 minutes/);
    expect(screen.getByLabelText('Match')).toHaveValue('0');
    expect(screen.getByRole('heading', { name: 'This half at a glance' })).toBeInTheDocument();
    expect(screen.getAllByText('Stable').length).toBeGreaterThan(0);
    const table = screen.getByRole('table', { name: 'Time spent in each conclusion this half' });
    expect(within(table).getAllByRole('row')).toHaveLength(6);
  });

  it('opens on the first moment where windows favour opposite teams', () => {
    const { readings } = firstHalfReadings(0);
    const index = readings.findIndex((reading) => reading.opposed);
    expect(index).toBeGreaterThan(0);
    render(<MomentumLab />);
    expect(screen.getByRole('slider')).toHaveValue(String(index));
    expect(screen.getByText(/The windows favour opposite teams/)).toBeInTheDocument();
  });

  it('says there is nothing to conclude before any chance was recorded', () => {
    render(<MomentumLab />);
    moveCursor(0);
    expect(screen.getByText(/There is nothing to conclude/)).toBeInTheDocument();
    expect(screen.getByText('No chances recorded.')).toBeInTheDocument();
    expect(screen.getAllByText('No chances in this window')).toHaveLength(3);
  });

  it('names the favoured side, the evidence and the chance that carries the result', () => {
    const { readings } = firstHalfReadings(0);
    const index = readings.findIndex((reading) => reading.favoured !== null);
    expect(index).toBeGreaterThan(0);
    render(<MomentumLab />);
    moveCursor(index);
    expect(screen.getAllByText(/^Favours Team [AB] by \d\.\d\d xG$/)).toHaveLength(3);
    expect(screen.getAllByText('carries the result').length).toBeGreaterThan(0);
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      expect.stringMatching(/^\d+:\d\d, (Stable|Depends on one chance)$/),
    );
  });

  it('scrubs by pointer on the chart, which changes the reading', () => {
    const { readings, period } = firstHalfReadings(0);
    render(<MomentumLab />);
    const svg = chart();
    svg.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 640, height: 244 });
    fireEvent.pointerDown(svg, { clientX: 0, pointerId: 1 });
    expect(screen.getByRole('slider')).toHaveValue('0');
    expect(screen.getByRole('heading', { name: 'At 0:00' })).toBeInTheDocument();
    // Halfway across the drawable width (14 px padding each side) is halfway through the half.
    fireEvent.pointerMove(svg, { clientX: 320, pointerId: 1 });
    const middle = readings.findIndex((reading) => reading.t >= period.durationSeconds / 2);
    expect(
      Math.abs(Number(screen.getByRole('slider').getAttribute('value')) - middle),
    ).toBeLessThanOrEqual(1);
    fireEvent.pointerUp(svg, { pointerId: 1 });
    fireEvent.pointerMove(svg, { clientX: 600, pointerId: 1 });
    expect(
      Math.abs(Number(screen.getByRole('slider').getAttribute('value')) - middle),
    ).toBeLessThanOrEqual(1);
    expect(screen.queryByRole('heading', { name: 'At 0:00' })).not.toBeInTheDocument();
  });

  it('switches the charted window', async () => {
    const user = userEvent.setup();
    render(<MomentumLab />);
    const tenMinutes = screen.getByRole('radio', { name: '10 min' });
    expect(tenMinutes).toHaveAttribute('aria-checked', 'false');
    await user.click(tenMinutes);
    expect(tenMinutes).toHaveAttribute('aria-checked', 'true');
    expect(chart()).toHaveAccessibleName(/last 10 minutes/);
  });

  it('resets the cursor when another match or half is chosen', async () => {
    const user = userEvent.setup();
    render(<MomentumLab />);
    moveCursor(3);
    await user.selectOptions(screen.getByLabelText('Match'), '1');
    const expected = Math.max(
      firstHalfReadings(1).readings.findIndex((reading) => reading.opposed),
      0,
    );
    expect(screen.getByRole('slider')).toHaveValue(String(expected));
    await user.selectOptions(screen.getByLabelText('Half'), '2');
    expect(chart()).toHaveAccessibleName(/of half 2/);
  });
});

describe('MomentumLab: the research', () => {
  it('shows headline numbers read from the result files', () => {
    render(<MomentumLab />);
    const { total } = scale;
    expect(screen.getAllByText(formatCount(total.matches, 'en')).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(formatPercent(total.opposedPct / 100, 'en', 1)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(formatPercent(total.robust / total.gridPoints, 'en', 1)).length,
    ).toBeGreaterThan(0);
  });

  it('charts every competition with the pilot marked, and explains the pilot', () => {
    render(<MomentumLab />);
    const bars = screen.getByRole('img', { name: /by competition/ });
    expect(bars).toHaveAccessibleName(
      new RegExp(formatPercent(scale.priorStudy.pct / 100, 'en', 1).replace('.', '\\.')),
    );
    const table = screen.getByRole('table', { name: /by competition/ });
    expect(within(table).getAllByRole('row')).toHaveLength(
      Object.keys(scale.byCompetition).length + 1,
    );
    const england = within(table).getByRole('row', { name: /England/ });
    expect(england).toHaveTextContent(
      formatPercent(scale.byCompetition.England.opposedPct / 100, 'en', 1),
    );
    expect(screen.getByText(/Our first pilot, on 7 matches/)).toHaveTextContent(
      formatCount(scale.matchLevelSpread.random7MatchSubsets.draws, 'en'),
    );
  });

  it('reports the xG model against the base rate and its reliability', () => {
    render(<MomentumLab />);
    const metrics = screen.getByRole('table', { name: /against the base rate/ });
    expect(within(metrics).getByRole('row', { name: /Our model/ })).toHaveTextContent(
      formatDecimal(cv.groupedCv.model.logLoss, 4, 'en'),
    );
    expect(within(metrics).getByRole('row', { name: /Base rate/ })).toHaveTextContent(
      formatDecimal(cv.groupedCv.baseline.brier, 4, 'en'),
    );
    const reliability = screen.getByRole('table', { name: /Reliability chart/ });
    expect(within(reliability).getAllByRole('row')).toHaveLength(
      cv.reliabilityGroupedCv.bins.length + 1,
    );
    expect(screen.getByText(/1\.0954/)).toHaveTextContent('1.1235');
    expect(screen.getByRole('link', { name: /Pappalardo et al\. 2019/ })).toHaveAttribute(
      'href',
      expect.stringContaining('doi.org'),
    );
  });

  it('speaks Bosnian with Bosnian number formats', async () => {
    await i18n.changeLanguage('bs');
    render(<MomentumLab />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ko ima inicijativu');
    expect(screen.getAllByText(formatCount(scale.total.matches, 'bs')).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(formatPercent(scale.total.opposedPct / 100, 'bs', 1).replace(' ', ' '))
        .length,
    ).toBeGreaterThan(0);
  });
});
