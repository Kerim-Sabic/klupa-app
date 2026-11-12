import type { User } from '@supabase/supabase-js';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import type { AuthState } from '../lib/auth';
import type { ActiveClub, ClubState } from '../lib/club';
import { ToastProvider } from '../ui';
import { routes } from './router';

const mocks = vi.hoisted(() => {
  const state: { auth: AuthState; club: ClubState } = {
    auth: { status: 'signed-out' },
    club: { status: 'none' },
  };
  return {
    state,
    requestCode: vi.fn(),
    verifyCode: vi.fn(),
    startDemo: vi.fn(),
    refresh: vi.fn(),
    createClubWithTeam: vi.fn(),
  };
});

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    state: mocks.state.auth,
    requestCode: mocks.requestCode,
    verifyCode: mocks.verifyCode,
    startDemo: mocks.startDemo,
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/club', () => ({
  ClubProvider: ({ children }: { readonly children: ReactNode }) => children,
  useClub: () => ({ state: mocks.state.club, refresh: mocks.refresh }),
  useActiveClub: () => {
    if (mocks.state.club.status !== 'ready') throw new Error('No active club in this test.');
    return mocks.state.club.club;
  },
}));

vi.mock('./onboarding', () => ({ createClubWithTeam: mocks.createClubWithTeam }));

// The Today screen's reads are covered in home/HomePage.test.tsx; here a club with no records.
vi.mock('./home/useToday', () => ({
  useTodaySource: (today: string) => ({
    status: 'ready',
    data: {
      players: [],
      matches: [],
      sessions: [],
      stints: [],
      attendance: [],
      observations: [],
      factors: { floodlight_kw: null, tariff_per_kwh: null, grid_kg_co2_per_kwh: null },
      today,
    },
  }),
  useMatchEvents: () => ({ status: 'loading' }),
}));

const club: ActiveClub = {
  clubId: 'club-1',
  clubName: 'FK Primjer',
  isDemo: false,
  role: 'owner',
  teamId: 'team-1',
  teamName: 'U13',
  ageGroup: 'u13',
};

// A lazily loaded section is a dynamic import; in a busy test run it can take over a second.
const LAZY = { timeout: 10_000 };

function signIn(anonymous = false): void {
  mocks.state.auth = {
    status: 'signed-in',
    user: { id: 'user-1', is_anonymous: anonymous } as User,
  };
}

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <MotionConfig reducedMotion="always">
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </MotionConfig>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.state.auth = { status: 'signed-out' };
  mocks.state.club = { status: 'none' };
  for (const call of [mocks.requestCode, mocks.verifyCode, mocks.startDemo, mocks.refresh]) {
    call.mockResolvedValue(undefined);
  }
  mocks.createClubWithTeam.mockResolvedValue('club-1');
  await i18n.changeLanguage('en');
});

describe('routing and guards', () => {
  it('sends a signed-out visitor to sign-in', () => {
    renderAt('/');
    expect(
      screen.getByRole('heading', { level: 1, name: 'The match, read honestly.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sign in to Klupa' })).toBeInTheDocument();
  });

  it('shows the evidence page to anyone, loading it on demand', async () => {
    renderAt('/evidence');
    expect(await screen.findByRole('heading', { level: 1 }, LAZY)).toHaveTextContent(
      'Who is on top',
    );
  });

  it('loads a section only when it is opened', async () => {
    signIn();
    mocks.state.club = { status: 'ready', club };
    renderAt('/matches/not/a/real/page');
    expect(await screen.findByText('Page not found', {}, LAZY)).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('waits while the session or the club is loading', () => {
    mocks.state.auth = { status: 'loading' };
    const first = renderAt('/');
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    first.unmount();
    signIn();
    mocks.state.club = { status: 'loading' };
    renderAt('/');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('sends a coach without a club to set one up', () => {
    signIn();
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Set up your club' })).toBeInTheDocument();
  });

  it('offers a retry when the club cannot be loaded', async () => {
    signIn();
    mocks.state.club = { status: 'error' };
    renderAt('/');
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('shows Today and five destinations once a club exists', () => {
    signIn();
    mocks.state.club = { status: 'ready', club };
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('U13 · FK Primjer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /The evidence/ })).toHaveAttribute('href', '/evidence');
    expect(screen.getByRole('link', { name: /Match replay/ })).toHaveAttribute('href', '/movement');
    expect(screen.getByRole('link', { name: /Shot lab/ })).toHaveAttribute('href', '/shot');
    expect(screen.getByRole('link', { name: /Pro matches/ })).toHaveAttribute('href', '/pro');
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getAllByRole('link')).toHaveLength(5);
    expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('skips sign-in and onboarding for a coach who is already set up', () => {
    signIn();
    mocks.state.club = { status: 'ready', club };
    renderAt('/sign-in');
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('has a page for addresses that lead nowhere', () => {
    renderAt('/nowhere');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });
});

describe('sign-in', () => {
  it('rejects a malformed email before calling the server', async () => {
    renderAt('/sign-in');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(mocks.requestCode).not.toHaveBeenCalled();
  });

  it('emails a code, then verifies it', async () => {
    renderAt('/sign-in');
    await userEvent.type(screen.getByLabelText('Email'), 'coach@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(mocks.requestCode).toHaveBeenCalledWith('coach@example.com');

    const code = await screen.findByLabelText('6-digit code');
    expect(screen.getByText('Sent to coach@example.com')).toBeInTheDocument();
    await userEvent.type(code, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6 digits from the email.');
    await userEvent.type(code, '3456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.verifyCode).toHaveBeenCalledWith('coach@example.com', '123456');

    await userEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('explains a failure in plain words', async () => {
    mocks.requestCode.mockRejectedValue({ code: 'over_email_send_rate_limit' });
    renderAt('/sign-in');
    await userEvent.type(screen.getByLabelText('Email'), 'coach@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });

  it('opens the demo club without an account', async () => {
    renderAt('/sign-in');
    await userEvent.click(screen.getByRole('button', { name: 'Try the demo club' }));
    expect(mocks.startDemo).toHaveBeenCalledOnce();
  });

  it('works in Bosnian', async () => {
    renderAt('/sign-in');
    await userEvent.click(screen.getByRole('button', { name: 'Bosanski' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Utakmica, pošteno pročitana.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Prijava u Klupu' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('bs');
  });
});

describe('club setup', () => {
  it('asks for both names before creating anything', async () => {
    signIn();
    renderAt('/welcome');
    await userEvent.click(screen.getByRole('button', { name: 'Create club' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(mocks.createClubWithTeam).not.toHaveBeenCalled();
  });

  it('creates the club and its first team, then reloads the club', async () => {
    signIn();
    renderAt('/welcome');
    await userEvent.type(screen.getByLabelText('Club name'), '  FK Test ');
    await userEvent.type(screen.getByLabelText('Team name'), 'U11 A');
    await userEvent.selectOptions(screen.getByLabelText('Age group'), 'u11');
    await userEvent.click(screen.getByRole('button', { name: 'Create club' }));
    await waitFor(() => {
      expect(mocks.refresh).toHaveBeenCalledOnce();
    });
    expect(mocks.createClubWithTeam).toHaveBeenCalledWith({
      clubName: 'FK Test',
      teamName: 'U11 A',
      ageGroup: 'u11',
    });
  });

  it('fills in sample names for a demo visitor and leaves the demo decision to the database', async () => {
    signIn(true);
    renderAt('/welcome');
    expect(screen.getByLabelText('Club name')).toHaveValue('Demo club');
    await userEvent.click(screen.getByRole('button', { name: 'Create club' }));
    await waitFor(() => {
      expect(mocks.createClubWithTeam).toHaveBeenCalledWith({
        clubName: expect.any(String) as string,
        teamName: 'Under-13s',
        ageGroup: 'u13',
      });
    });
  });

  it('reports a failure and stays on the form', async () => {
    signIn();
    mocks.createClubWithTeam.mockRejectedValue({ code: '54000' });
    renderAt('/welcome');
    await userEvent.type(screen.getByLabelText('Club name'), 'FK Test');
    await userEvent.type(screen.getByLabelText('Team name'), 'U11');
    await userEvent.click(screen.getByRole('button', { name: 'Create club' }));
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
