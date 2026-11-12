import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from './auth';
import { ClubProvider, fetchActiveClub, useActiveClub, useClub } from './club';

interface Result {
  readonly data: unknown;
  readonly error: unknown;
}

const db = vi.hoisted(() => {
  const state: { results: Result[]; tables: string[]; auth: AuthState } = {
    results: [],
    tables: [],
    auth: { status: 'signed-out' },
  };
  return state;
});

vi.mock('./supabase', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'order']) chain[method] = () => chain;
    chain.limit = () => Promise.resolve(db.results.shift() ?? { data: [], error: null });
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        db.tables.push(table);
        return builder();
      },
    },
  };
});

vi.mock('./auth', () => ({ useAuth: () => ({ state: db.auth }) }));

const membership = { role: 'coach', clubs: { id: 'club-1', name: 'FK Primjer', is_demo: true } };
const team = { id: 'team-1', name: 'U13', age_group: 'u13' };

function Probe() {
  const { state, refresh } = useClub();
  return (
    <button
      type="button"
      onClick={() => {
        void refresh();
      }}
    >
      {state.status === 'ready' ? `ready:${state.club.teamName}` : state.status}
    </button>
  );
}

function renderProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClubProvider>
        <Probe />
      </ClubProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.results = [];
  db.tables = [];
  db.auth = { status: 'signed-in', user: { id: 'user-1' } } as AuthState;
});

describe('fetchActiveClub', () => {
  it('returns null before onboarding', async () => {
    db.results = [{ data: [], error: null }];
    await expect(fetchActiveClub('user-1')).resolves.toBeNull();
    expect(db.tables).toEqual(['club_members']);
  });

  it('returns null when the club has no team yet', async () => {
    db.results = [
      { data: [membership], error: null },
      { data: [], error: null },
    ];
    await expect(fetchActiveClub('user-1')).resolves.toBeNull();
  });

  it('combines the membership and the first active team', async () => {
    db.results = [
      { data: [membership], error: null },
      { data: [team], error: null },
    ];
    await expect(fetchActiveClub('user-1')).resolves.toEqual({
      clubId: 'club-1',
      clubName: 'FK Primjer',
      isDemo: true,
      role: 'coach',
      teamId: 'team-1',
      teamName: 'U13',
      ageGroup: 'u13',
    });
    expect(db.tables).toEqual(['club_members', 'teams']);
  });

  it('throws database errors instead of hiding them', async () => {
    const failure = { code: '42501' };
    db.results = [{ data: null, error: failure }];
    await expect(fetchActiveClub('user-1')).rejects.toBe(failure);
    db.results = [
      { data: [membership], error: null },
      { data: null, error: failure },
    ];
    await expect(fetchActiveClub('user-1')).rejects.toBe(failure);
  });
});

describe('ClubProvider', () => {
  it('stays loading while nobody is signed in', () => {
    db.auth = { status: 'signed-out' };
    renderProvider();
    expect(screen.getByRole('button')).toHaveTextContent('loading');
    expect(db.tables).toEqual([]);
  });

  it('reports no club, then picks up a new one after refresh', async () => {
    db.results = [{ data: [], error: null }];
    renderProvider();
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('none');
    });
    db.results = [
      { data: [membership], error: null },
      { data: [team], error: null },
    ];
    act(() => {
      screen.getByRole('button').click();
    });
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('ready:U13');
    });
  });

  it('reports a load failure as an error state', async () => {
    db.results = [{ data: null, error: { code: 'XX000' } }];
    renderProvider();
    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('error');
    });
  });

  it('refuses to be used outside its provider or before a club exists', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/inside <ClubProvider>/);
    function NeedsClub() {
      return <p>{useActiveClub().clubName}</p>;
    }
    db.results = [{ data: [], error: null }];
    const client = new QueryClient();
    expect(() =>
      render(
        <QueryClientProvider client={client}>
          <ClubProvider>
            <NeedsClub />
          </ClubProvider>
        </QueryClientProvider>,
      ),
    ).toThrow(/needs an active club/);
    quiet.mockRestore();
  });
});
