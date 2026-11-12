import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { relativeAgeCheck, type QuarterCounts } from '../../engine/relativeAge';
import { setLanguage } from '../../ui/testUtils';
import type { RelativeAgeSummary } from './models';
import { RelativeAge } from './RelativeAge';

function summaryFor(counts: QuarterCounts, withMinutes = true): RelativeAgeSummary {
  const known = counts.reduce((sum, count) => sum + count, 0);
  return {
    status: 'ready',
    known,
    unknown: 0,
    result: relativeAgeCheck(counts),
    minuteShares: withMinutes ? [0.4, 0.2, 0.2, 0.2] : null,
  };
}

function show(summary: RelativeAgeSummary) {
  return render(
    <MemoryRouter>
      <RelativeAge summary={summary} />
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  await setLanguage('en');
});

describe('RelativeAge verdicts', () => {
  it.each([
    [[4, 4, 5, 5], 'Consistent with an even spread'],
    [[8, 3, 2, 1], 'Leans towards older players'],
    [[9, 1, 1, 1], 'Strongly towards older players'],
  ] as const)('says %j in plain words, with the low-power caveat every time', (counts, title) => {
    show(summaryFor(counts));
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(/this check has low power/)).toBeInTheDocument();
    expect(screen.getByText(/not that selection is fair/)).toBeInTheDocument();
  });

  it('says the exact test was not run for a squad above the cap', () => {
    show(summaryFor([31, 10, 10, 10]));
    expect(screen.getByText(/Exact test not run/)).toBeInTheDocument();
    expect(screen.queryByText(/Exact test: p =/)).not.toBeInTheDocument();
  });

  it('writes a very small p-value as below 0.001', () => {
    show(summaryFor([0, 0, 0, 12]));
    expect(screen.getByText(/Exact test: p = <0\.001\./)).toBeInTheDocument();
  });

  it('shows one chart, and says why, when no minutes were played', () => {
    show(summaryFor([4, 4, 5, 5], false));
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByText(/No match minutes yet/)).toBeInTheDocument();
  });

  it('shows the Bosnian verdict', async () => {
    await setLanguage('bs');
    show(summaryFor([9, 1, 1, 1]));
    expect(screen.getByText('Snažno naginje starijim igračima')).toBeInTheDocument();
    await setLanguage('en');
  });
});
