import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../../ui/testUtils';
import { fetchClubFactors } from './api';
import { attendance, renderInsights, rowCells, seed, session, statValue } from './testKit';

vi.mock('./api');
vi.mock('../../lib/club', () => ({
  useActiveClub: () => ({ clubId: 'club-1', teamId: 'team-1' }),
}));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: vi.fn(),
  useSessions: vi.fn(),
}));

const present = (count: number, sessionId: string, heldOn: string) =>
  Array.from({ length: count }, (_, index) => attendance(`p${String(index)}`, sessionId, heldOn));

const evidence = {
  sessions: [
    session('s1', '2026-11-02', { area: 'full', duration_minutes: 60, floodlit: true }),
    session('s2', '2026-11-03', { area: 'half', duration_minutes: 60 }),
    session('s3', '2026-11-04', { status: 'planned' }),
  ],
  attendance: [...present(10, 's1', '2026-11-02'), ...present(10, 's2', '2026-11-03')],
};

beforeEach(async () => {
  await setLanguage('en');
  seed();
});

async function stats(): Promise<void> {
  await screen.findByText('Pitch-hours booked');
}

describe('PitchView states', () => {
  it('shows a loading state', () => {
    seed({ players: 'loading' });
    vi.mocked(fetchClubFactors).mockReturnValue(new Promise(() => undefined));
    renderInsights('/fairness/pitch');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    seed(evidence);
    vi.mocked(fetchClubFactors).mockRejectedValueOnce(new Error('offline'));
    const { user } = renderInsights('/fairness/pitch');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await stats();
  });

  it('says there is nothing to look at without completed sessions with attendance', async () => {
    seed({ sessions: [session('s1', '2026-11-02')], attendance: [] });
    renderInsights('/fairness/pitch');
    expect(await screen.findByText('No completed sessions to look at yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to training' })).toHaveAttribute(
      'href',
      '/training',
    );
    expect(screen.getByText(/1 completed session has no attendance recorded/)).toBeInTheDocument();
  });

  it('says nothing about left-out sessions when there are none', async () => {
    renderInsights('/fairness/pitch');
    await screen.findByText('No completed sessions to look at yet');
    expect(screen.queryByText(/no attendance recorded/)).not.toBeInTheDocument();
  });
});

describe('PitchView success', () => {
  const factors = { floodlight_kw: 4, tariff_per_kwh: 0.25, grid_kg_co2_per_kwh: null };

  beforeEach(() => {
    seed({ ...evidence, factors });
  });

  it('shows pitch-hours, players per pitch-hour and floodlit hours', async () => {
    renderInsights('/fairness/pitch');
    await stats();
    expect(statValue('Pitch-hours booked')).toBe('1.5');
    expect(statValue('Players per pitch-hour')).toBe('13.3');
    expect(statValue('Floodlit hours')).toBe('1.0');
    expect(screen.getByText('From 2 completed sessions with attendance')).toBeInTheDocument();
  });

  it('shows only the estimates whose factors are set, each labelled as an estimate', async () => {
    renderInsights('/fairness/pitch');
    await stats();
    expect(statValue('Energy')).toBe('4.0 kWh');
    expect(statValue('Cost')).toBe('1.0 KM');
    expect(screen.queryByText('Emissions')).not.toBeInTheDocument();
    expect(screen.getAllByText('Estimate')).toHaveLength(2);
    expect(
      screen.getByText(
        /Floodlights are assumed to light the whole pitch whatever share was booked/,
      ),
    ).toBeInTheDocument();
  });

  it('sorts the over-booked sessions by every column', async () => {
    const { user } = renderInsights('/fairness/pitch');
    const sizes = await screen.findByRole('table', {
      name: 'Sessions that booked more pitch than needed',
    });
    for (const button of within(sizes).getAllByRole('button')) await user.click(button);
    expect(within(sizes).getAllByRole('row')).toHaveLength(2);
  });

  it('prompts for the missing factors with a link to the club settings', async () => {
    renderInsights('/fairness/pitch');
    await stats();
    expect(
      screen.getByText(/Some estimates need numbers from your club settings/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open club settings' })).toHaveAttribute(
      'href',
      '/club/settings',
    );
  });

  it('lists over-booked sessions with the smaller area that fits and the hours freed', async () => {
    renderInsights('/fairness/pitch');
    const table = await screen.findByRole('table', {
      name: 'Sessions that booked more pitch than needed',
    });
    expect(rowCells(table, '2 Nov 2026')).toEqual([
      '2 Nov 2026',
      'full pitch',
      'half pitch',
      '10',
      '0.50',
    ]);
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(
      screen.getByText('In total, 0.50 pitch-hours could have been freed.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a prompt about booking habits, not a verdict on any session/),
    ).toBeInTheDocument();
  });
});

describe('PitchView without factors or over-booking', () => {
  it('shows no estimate at all when no factor is set, only the prompt', async () => {
    seed(evidence);
    renderInsights('/fairness/pitch');
    await stats();
    expect(screen.queryByText('Energy')).not.toBeInTheDocument();
    expect(screen.queryByText('Estimate')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open club settings' })).toBeInTheDocument();
  });

  it('shows all three estimates and no prompt when every factor is set', async () => {
    seed({
      ...evidence,
      factors: { floodlight_kw: 4, tariff_per_kwh: 0.25, grid_kg_co2_per_kwh: 0.5 },
    });
    renderInsights('/fairness/pitch');
    await stats();
    expect(statValue('Emissions')).toBe('2.0 kg CO₂');
    expect(screen.queryByRole('link', { name: 'Open club settings' })).not.toBeInTheDocument();
  });

  it('has an empty state when nothing is over-booked', async () => {
    seed({
      sessions: [session('s1', '2026-11-02', { area: 'full' })],
      attendance: present(20, 's1', '2026-11-02'),
    });
    renderInsights('/fairness/pitch');
    expect(await screen.findByText('No over-booked sessions')).toBeInTheDocument();
  });

  it('uses Bosnian text and leaves no key untranslated', async () => {
    seed(evidence);
    await setLanguage('bs');
    renderInsights('/fairness/pitch');
    await screen.findByText('Sati zauzetog terena');
    expect(statValue('Sati zauzetog terena')).toBe('1,5');
    expect(screen.getByText('cijeli teren')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/insights\./);
    await setLanguage('en');
  });
});
