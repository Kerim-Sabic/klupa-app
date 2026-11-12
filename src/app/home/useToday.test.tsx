import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { match, player, TODAY } from './testData';
import { useMatchEvents, useTodaySource } from './useToday';

const api = vi.hoisted(() => ({
  players: vi.fn(),
  matches: vi.fn(),
  sessions: vi.fn(),
  stints: vi.fn(),
  attendance: vi.fn(),
  observations: vi.fn(),
  factors: vi.fn(),
  events: vi.fn(),
}));

vi.mock('../../lib/club', () => ({
  useActiveClub: () => ({ clubId: 'club-1', teamId: 'team-1' }),
}));

vi.mock('../../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/data')>();
  return {
    queryKeys: actual.queryKeys,
    usePlayers: () => useQuery({ queryKey: ['players'], queryFn: api.players }),
    useMatches: () => useQuery({ queryKey: ['matches'], queryFn: api.matches }),
    useSessions: () => useQuery({ queryKey: ['sessions'], queryFn: api.sessions }),
  };
});

vi.mock('../../features/insights/api', () => ({
  fetchTeamStints: api.stints,
  fetchTeamAttendance: api.attendance,
  fetchTeamObservations: api.observations,
  fetchClubFactors: api.factors,
}));

vi.mock('../../features/momentum/api', () => ({ fetchReviewEvents: api.events }));

function wrapper({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const factors = { floodlight_kw: null, tariff_per_kwh: null, grid_kg_co2_per_kwh: null };

beforeEach(() => {
  vi.clearAllMocks();
  api.players.mockResolvedValue([player('p1', 1)]);
  api.matches.mockResolvedValue([match('m1', '2026-11-01')]);
  for (const read of [api.sessions, api.stints, api.attendance, api.observations, api.events]) {
    read.mockResolvedValue([]);
  }
  api.factors.mockResolvedValue(factors);
});

describe('useTodaySource', () => {
  it('is loading until every read has arrived, then hands over the season', async () => {
    const { result } = renderHook(() => useTodaySource(TODAY), { wrapper });
    expect(result.current.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current).toMatchObject({
      status: 'ready',
      data: { players: [player('p1', 1)], factors, today: TODAY },
    });
    expect(api.stints).toHaveBeenCalledWith('club-1', 'team-1');
    expect(api.factors).toHaveBeenCalledWith('club-1');
  });

  it('reports a failure and retries only the read that failed', async () => {
    api.observations.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useTodaySource(TODAY), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    const calls = api.players.mock.calls.length;
    if (result.current.status === 'error') result.current.retry();
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(api.observations).toHaveBeenCalledTimes(2);
    expect(api.players).toHaveBeenCalledTimes(calls);
  });
});

describe('useMatchEvents', () => {
  it('reads nothing without a match', () => {
    const { result } = renderHook(() => useMatchEvents(null), { wrapper });
    expect(result.current.status).toBe('loading');
    expect(api.events).not.toHaveBeenCalled();
  });

  it('reads the events of the match it is given', async () => {
    const { result } = renderHook(() => useMatchEvents('m1'), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual({ status: 'ready', data: [] });
    });
    expect(api.events).toHaveBeenCalledWith('club-1', 'm1');
  });

  it('offers a retry when the events cannot be read', async () => {
    api.events.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useMatchEvents('m1'), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    if (result.current.status === 'error') result.current.retry();
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
  });
});
