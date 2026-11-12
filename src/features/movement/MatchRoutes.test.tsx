import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig } from 'motion/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { MovementLabPage } from './MovementLabPage';
import { serve, webgl } from './testServer';

function open(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <MotionConfig reducedMotion="user">
        <Routes>
          <Route path="/movement" element={<MovementLabPage />} />
          <Route path="/movement/:matchId" element={<MovementLabPage />} />
        </Routes>
      </MotionConfig>
    </MemoryRouter>,
  );
  return user;
}

const ready = () => screen.findByRole('button', { name: 'Play' }, { timeout: 5000 });

beforeEach(async () => {
  webgl(false);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  await i18n.changeLanguage('en');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('choosing a match', () => {
  it('opens a match by its address, fetching only that match', async () => {
    const fetchMock = serve();
    open('/movement/J03WMX');
    await ready();
    const picker = screen.getByRole('combobox', { name: 'Match' });
    expect(picker).toHaveValue('J03WMX');
    expect(
      screen.getByRole('option', {
        name: 'Köln 1–2 Bayern München · 27 May 2023 · Bundesliga',
      }),
    ).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.endsWith('.bin'))).toEqual(['/data/tracking/J03WMX.bin']);
    const readout = screen.getByRole('region', { name: 'Right now' });
    expect(readout).toHaveTextContent('1. FC Köln');
    expect(readout).toHaveTextContent('FC Bayern München');
  });

  it('switches match from the picker and starts the new one from kick-off', async () => {
    serve();
    const user = open('/movement');
    await ready();
    await user.click(screen.getByRole('button', { name: 'Forward 5 seconds' }));
    expect(screen.getByRole('slider', { name: 'Match time' })).toHaveValue('5');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Match' }), 'J03WOH');
    await ready();
    expect(screen.getByRole('combobox', { name: 'Match' })).toHaveValue('J03WOH');
    expect(screen.getByRole('slider', { name: 'Match time' })).toHaveValue('0');
    expect(screen.getByText(/Fortuna Düsseldorf: round markers/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Match' }), 'J03WN1');
    await ready();
    expect(screen.getByRole('combobox', { name: 'Match' })).toHaveValue('J03WN1');
  });

  it('says so, kindly, for a match that is not in the replay', async () => {
    const fetchMock = serve();
    open('/movement/NOPE00');
    expect(await screen.findByText('This match is not in the replay')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the replay' })).toHaveAttribute(
      'href',
      '/movement',
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/data/tracking/index.json']);
  });
});

describe('the physical report', () => {
  it('compares the clubs and lists every player, longest distance first', async () => {
    serve();
    const user = open('/movement');
    const report = await screen.findByRole('region', { name: 'Physical report' });
    const totals = await within(report).findByRole('region', { name: 'Team totals' });
    expect(totals).toHaveTextContent(
      'Distance: Bayer 04 Leverkusen 91.0 km, VfL Bochum 1848 105.0 km',
    );
    expect(totals).toHaveTextContent('Top speed: Bayer 04 Leverkusen 34.9 km/h (9.70 m/s)');
    const table = within(report).getByRole('table', { name: /Bayer 04 Leverkusen: every player/ });
    const rows = within(table).getAllByRole('row');
    // Header and 13 players.
    expect(rows).toHaveLength(14);
    const distances = rows.slice(1).map((row) =>
      Number(
        within(row)
          .getAllByRole('cell')[3]
          ?.textContent.replace(/[^\d.]/g, ''),
      ),
    );
    expect(distances).toEqual([...distances].sort((a, b) => b - a));
    await user.click(within(table).getByRole('button', { name: /Name/ }));
    await user.click(within(report).getByRole('radio', { name: 'VfL Bochum 1848' }));
    // Header and 16 players.
    expect(
      within(
        within(report).getByRole('table', { name: /VfL Bochum 1848: every player/ }),
      ).getAllByRole('row'),
    ).toHaveLength(17);
    expect(within(report).getByText(/faster than 5.5 m\/s \(19.8 km\/h\)/)).toBeInTheDocument();
    expect(
      within(report).getByText(/90 seconds of player time \(0.076% of it\)/),
    ).toBeInTheDocument();
  });

  it('has its own error and retry, and never holds up the replay', async () => {
    serve({ failPhysical: true });
    const user = open('/movement');
    await ready();
    const report = screen.getByRole('region', { name: 'Physical report' });
    expect(
      await within(report).findByText('The physical report could not be loaded'),
    ).toBeVisible();
    await user.click(within(report).getByRole('button', { name: 'Try again' }));
    expect(await within(report).findByRole('region', { name: 'Team totals' })).toBeVisible();
  });

  it('speaks Bosnian', async () => {
    await i18n.changeLanguage('bs');
    serve();
    open('/movement');
    const report = await screen.findByRole('region', { name: 'Fizički izvještaj' });
    expect(await within(report).findByRole('region', { name: 'Zbir po ekipi' })).toHaveTextContent(
      'Pretrčano: Bayer 04 Leverkusen 91,0 km',
    );
  });
});
