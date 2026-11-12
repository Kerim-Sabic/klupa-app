import type { UseQueryResult } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useActiveClub } from '../../lib/club';
import { usePlayers, type Player } from '../../lib/data';
import { ClubPage } from './ClubPage';
import { CLUB, makePlayer, queryResult, renderScreen } from './test-utils';

vi.mock('../../lib/auth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/club', () => ({ useActiveClub: vi.fn(), useClub: vi.fn() }));
vi.mock('../../lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/data')>()),
  usePlayers: vi.fn(),
}));
vi.mock('./SampleSeasonCard', () => ({
  SampleSeasonCard: () => <p>Sample season card</p>,
}));

const signOut = vi.fn();

function setup(
  club: Partial<typeof CLUB> = {},
  roster: UseQueryResult<Player[]> = queryResult({ kind: 'success', data: [makePlayer()] }),
) {
  vi.mocked(useActiveClub).mockReturnValue({ ...CLUB, ...club });
  vi.mocked(usePlayers).mockReturnValue(roster);
  vi.mocked(useAuth).mockReturnValue({
    state: { status: 'loading' },
    requestCode: vi.fn(),
    verifyCode: vi.fn(),
    startDemo: vi.fn(),
    signOut,
  });
  return renderScreen(<ClubPage />, '/club');
}

beforeEach(async () => {
  vi.resetAllMocks();
  await i18n.changeLanguage('en');
});

describe('ClubPage', () => {
  it('names the club, the team and the coach role', () => {
    setup({ role: 'coach' });
    expect(screen.getByRole('heading', { level: 1, name: 'Club' })).toBeInTheDocument();
    expect(screen.getByText('Under-13s · FK Sunce')).toBeInTheDocument();
    expect(screen.getByText('Your role: Coach')).toBeInTheDocument();
  });

  it('links to every page of the club, and to the evidence', () => {
    setup();
    const destinations: [string, string][] = [
      ['Squad', '/club/squad'],
      ['Club settings', '/club/settings'],
      ['Privacy and data', '/club/privacy'],
      ['Activity log', '/club/activity'],
      ['The evidence', '/evidence'],
    ];
    for (const [name, href] of destinations) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('has the language switch', async () => {
    const user = userEvent.setup();
    setup();
    const group = screen.getByRole('group', { name: 'Language' });
    await user.click(within(group).getByRole('button', { name: 'Bosanski' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Klub' })).toBeInTheDocument();
    expect(screen.getByText('Vaša uloga: Vlasnik')).toBeInTheDocument();
  });

  it('signs out', async () => {
    signOut.mockResolvedValue(undefined);
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a failed sign-out as a toast', async () => {
    signOut.mockRejectedValue(new TypeError('offline'));
    setup();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/No connection/)).toBeInTheDocument();
  });

  it('warns a demo account that signing out is final', () => {
    setup({ isDemo: true }, queryResult({ kind: 'success', data: [makePlayer()] }));
    expect(screen.getByText(/cannot come back to this demo club/)).toBeInTheDocument();
  });

  it('does not say that to a real account', () => {
    setup();
    expect(screen.queryByText(/cannot come back to this demo club/)).not.toBeInTheDocument();
  });
});

describe('the sample season offer', () => {
  it('shows for a demo club with an empty squad', () => {
    setup({ isDemo: true }, queryResult({ kind: 'success', data: [] }));
    expect(screen.getByText('Sample season card')).toBeInTheDocument();
  });

  it('is hidden once the squad has players', () => {
    setup({ isDemo: true });
    expect(screen.queryByText('Sample season card')).not.toBeInTheDocument();
  });

  it('is hidden for a real club', () => {
    setup({ isDemo: false }, queryResult({ kind: 'success', data: [] }));
    expect(screen.queryByText('Sample season card')).not.toBeInTheDocument();
  });

  it('is hidden while the squad is still loading, or if it failed to load', () => {
    setup({ isDemo: true }, queryResult({ kind: 'pending' }));
    expect(screen.queryByText('Sample season card')).not.toBeInTheDocument();
  });

  it.each(['assistant', 'viewer'] as const)('is hidden from a %s, who cannot write', (role) => {
    setup({ isDemo: true, role }, queryResult({ kind: 'success', data: [] }));
    expect(screen.queryByText('Sample season card')).not.toBeInTheDocument();
  });
});
