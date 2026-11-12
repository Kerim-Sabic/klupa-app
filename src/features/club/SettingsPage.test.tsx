import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useActiveClub, useClub } from '../../lib/club';
import { fetchClubSettings, updateClubSettings } from './api';
import { SettingsPage } from './SettingsPage';
import { CLUB, renderScreen } from './test-utils';

vi.mock('./api');
vi.mock('../../lib/club', () => ({ useActiveClub: vi.fn(), useClub: vi.fn() }));

const SETTINGS = {
  name: 'FK Sunce',
  floodlight_kw: 4.5,
  tariff_per_kwh: 0.302,
  grid_kg_co2_per_kwh: null,
};

const refresh = vi.fn();

function setup(role: typeof CLUB.role = 'owner') {
  vi.mocked(useActiveClub).mockReturnValue({ ...CLUB, role });
  vi.mocked(useClub).mockReturnValue({ state: { status: 'ready', club: CLUB }, refresh });
  return renderScreen(<SettingsPage />, '/club/settings');
}

beforeEach(async () => {
  vi.resetAllMocks();
  refresh.mockResolvedValue(undefined);
  vi.mocked(fetchClubSettings).mockResolvedValue(SETTINGS);
  await i18n.changeLanguage('en');
});

describe('SettingsPage states', () => {
  it('shows a loading status first', () => {
    vi.mocked(fetchClubSettings).mockReturnValue(new Promise(() => undefined));
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('explains a failure and retries', async () => {
    vi.mocked(fetchClubSettings).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Club name')).toHaveValue('FK Sunce');
    expect(fetchClubSettings).toHaveBeenCalledTimes(2);
  });

  it('fills the form from the club', async () => {
    setup();
    expect(await screen.findByLabelText('Club name')).toHaveValue('FK Sunce');
    expect(screen.getByLabelText('Floodlight power (kW)')).toHaveValue('4.5');
    expect(screen.getByLabelText('Electricity price (KM per kWh)')).toHaveValue('0.302');
    expect(screen.getByLabelText('Grid carbon intensity (kg CO₂ per kWh)')).toHaveValue('');
    expect(
      screen.getByText(/every cost and carbon figure for the facility in Klupa is an estimate/i),
    ).toBeInTheDocument();
  });

  it('shows decimals with a comma in Bosnian', async () => {
    await i18n.changeLanguage('bs');
    setup();
    expect(await screen.findByLabelText('Snaga reflektora (kW)')).toHaveValue('4,5');
    expect(screen.getByLabelText('Cijena struje (KM po kWh)')).toHaveValue('0,302');
  });

  it('shows the sources of the reference values', async () => {
    setup();
    await screen.findByLabelText('Club name');
    expect(
      screen.getByText(
        /BHAS, electricity prices for small non-household users, second half of 2025/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ember via Our World in Data, 2025/)).toBeInTheDocument();
  });
});

describe('editing the settings as the owner', () => {
  it('saves a new name and numbers, accepting a decimal comma', async () => {
    vi.mocked(updateClubSettings).mockResolvedValue();
    const user = userEvent.setup();
    setup();
    const name = await screen.findByLabelText('Club name');
    await user.clear(name);
    await user.type(name, '  FK Sunce Mladi ');
    await user.type(screen.getByLabelText('Grid carbon intensity (kg CO₂ per kWh)'), '0,5706');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => {
      expect(updateClubSettings).toHaveBeenCalledWith('club-1', {
        name: 'FK Sunce Mladi',
        floodlight_kw: 4.5,
        tariff_per_kwh: 0.302,
        grid_kg_co2_per_kwh: 0.5706,
      });
    });
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    // The name is shown across the app, so it is reloaded from where it came from.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stores an emptied field as "not set"', async () => {
    vi.mocked(updateClubSettings).mockResolvedValue();
    const user = userEvent.setup();
    setup();
    await user.clear(await screen.findByLabelText('Floodlight power (kW)'));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => {
      expect(updateClubSettings).toHaveBeenCalledWith(
        'club-1',
        expect.objectContaining({ floodlight_kw: null }),
      );
    });
  });

  it('fills in the Bosnia and Herzegovina reference values, but not the lights', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByLabelText('Club name');
    await user.clear(screen.getByLabelText('Electricity price (KM per kWh)'));
    await user.click(
      screen.getByRole('button', { name: 'Use Bosnia and Herzegovina reference values' }),
    );
    expect(screen.getByLabelText('Electricity price (KM per kWh)')).toHaveValue('0.3020');
    expect(screen.getByLabelText('Grid carbon intensity (kg CO₂ per kWh)')).toHaveValue('0.5706');
    expect(screen.getByLabelText('Floodlight power (kW)')).toHaveValue('4.5');
    expect(screen.getByText(/Floodlight power depends on your lights/)).toBeInTheDocument();
  });

  it('writes the reference values with a comma in Bosnian and clears their errors', async () => {
    await i18n.changeLanguage('bs');
    const user = userEvent.setup();
    setup();
    const tariff = await screen.findByLabelText('Cijena struje (KM po kWh)');
    await user.clear(tariff);
    await user.type(tariff, 'abc');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj postavke' }));
    expect(await screen.findByText(/Unesite broj 0 ili veći, na primjer 0,30/)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Koristi referentne vrijednosti za Bosnu i Hercegovinu' }),
    );
    expect(tariff).toHaveValue('0,3020');
    expect(screen.getByLabelText('Ugljična intenzivnost mreže (kg CO₂ po kWh)')).toHaveValue(
      '0,5706',
    );
    expect(screen.queryByText(/Unesite broj 0 ili veći/)).not.toBeInTheDocument();
  });

  it('refuses a name that is too short or too long', async () => {
    const user = userEvent.setup();
    setup();
    const name = await screen.findByLabelText('Club name');
    await user.clear(name);
    await user.type(name, 'A');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Use between 2 and 80 characters.')).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'x'.repeat(81));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Use between 2 and 80 characters.')).toBeInTheDocument();
    expect(updateClubSettings).not.toHaveBeenCalled();
  });

  it('refuses numbers that are invalid, too large or too precise, each at its field', async () => {
    const user = userEvent.setup();
    setup();
    const kw = await screen.findByLabelText('Floodlight power (kW)');
    const price = screen.getByLabelText('Electricity price (KM per kWh)');
    const carbon = screen.getByLabelText('Grid carbon intensity (kg CO₂ per kWh)');
    await user.clear(kw);
    await user.type(kw, '-3');
    await user.clear(price);
    await user.type(price, '0.30201');
    await user.type(carbon, '250');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(screen.getByText('Enter a number of 0 or more, for example 0.30.')).toBeInTheDocument();
    expect(screen.getByText('Use at most 4 decimal places.')).toBeInTheDocument();
    expect(screen.getByText('Use a value of 99.9999 or less.')).toBeInTheDocument();
    expect(kw).toHaveAttribute('aria-invalid', 'true');
    expect(updateClubSettings).not.toHaveBeenCalled();
  });

  it('shows a failed save as a toast and leaves the form as typed', async () => {
    vi.mocked(updateClubSettings).mockRejectedValue({ code: '42501' });
    const user = userEvent.setup();
    setup();
    const name = await screen.findByLabelText('Club name');
    await user.type(name, '!');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText('You do not have permission to do that.')).toBeInTheDocument();
    expect(name).toHaveValue('FK Sunce!');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('settings for everyone but the owner', () => {
  it.each(['coach', 'assistant', 'viewer'] as const)('is read-only for a %s', async (role) => {
    setup(role);
    const name = await screen.findByLabelText('Club name');
    expect(screen.getByText(/Only the club's owner can change these settings/)).toBeInTheDocument();
    expect(name).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Floodlight power (kW)')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Use Bosnia and Herzegovina reference values' }),
    ).not.toBeInTheDocument();
  });
});
