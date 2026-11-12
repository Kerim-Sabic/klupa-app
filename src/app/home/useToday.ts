import { useQuery } from '@tanstack/react-query';
import {
  fetchClubFactors,
  fetchTeamAttendance,
  fetchTeamObservations,
  fetchTeamStints,
} from '../../features/insights/api';
import { fetchReviewEvents } from '../../features/momentum/api';
import { useActiveClub } from '../../lib/club';
import { queryKeys, useMatches, usePlayers, useSessions } from '../../lib/data';
import type { ReviewEvent } from './matchModel';
import type { TodayInput } from './model';

/** What the screen needs to pick a state: still loading, failed (with a retry), or ready. */
export type Source<Data> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly retry: () => void }
  | { readonly status: 'ready'; readonly data: Data };

interface Pending {
  readonly isError: boolean;
  readonly refetch: () => unknown;
}

/** One retry that re-asks only the reads that failed. */
function retryFailed(queries: readonly Pending[]): () => void {
  return () => {
    for (const query of queries) if (query.isError) void query.refetch();
  };
}

/*
 * The keys are the Fairness and review screens' own keys, on purpose: the reads are identical,
 * so opening Today warms those screens and a write that invalidates the shared team key
 * refreshes all of them at once.
 */
function useTeamReads() {
  const { clubId, teamId } = useActiveClub();
  const stints = useQuery({
    queryKey: [...queryKeys.teamStints(teamId), 'insights'] as const,
    queryFn: () => fetchTeamStints(clubId, teamId),
  });
  const attendance = useQuery({
    queryKey: [...queryKeys.attendance(teamId), 'insights'] as const,
    queryFn: () => fetchTeamAttendance(clubId, teamId),
  });
  const observations = useQuery({
    queryKey: [...queryKeys.observations(teamId), 'insights'] as const,
    queryFn: () => fetchTeamObservations(clubId, teamId),
  });
  const factors = useQuery({
    queryKey: ['club-factors', clubId] as const,
    queryFn: () => fetchClubFactors(clubId),
  });
  return { stints, attendance, observations, factors };
}

/** Everything the Today screen reads for the season, as one source. */
export function useTodaySource(today: string): Source<TodayInput> {
  const players = usePlayers();
  const matches = useMatches();
  const sessions = useSessions();
  const { stints, attendance, observations, factors } = useTeamReads();
  const all = [players, matches, sessions, stints, attendance, observations, factors];
  if (all.some((query) => query.isError)) return { status: 'error', retry: retryFailed(all) };
  if (
    players.data === undefined ||
    matches.data === undefined ||
    sessions.data === undefined ||
    stints.data === undefined ||
    attendance.data === undefined ||
    observations.data === undefined ||
    factors.data === undefined
  ) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    data: {
      players: players.data,
      matches: matches.data,
      sessions: sessions.data,
      stints: stints.data,
      attendance: attendance.data,
      observations: observations.data,
      factors: factors.data,
      today,
    },
  };
}

/** The tagged events of one match, read only when there is a match to read. */
export function useMatchEvents(matchId: string | null): Source<readonly ReviewEvent[]> {
  const { clubId } = useActiveClub();
  const id = matchId ?? '';
  const events = useQuery({
    queryKey: [...queryKeys.matchEvents(id), 'review'] as const,
    queryFn: () => fetchReviewEvents(clubId, id),
    enabled: matchId !== null,
  });
  if (events.isError) return { status: 'error', retry: retryFailed([events]) };
  if (events.data === undefined) return { status: 'loading' };
  return { status: 'ready', data: events.data };
}
