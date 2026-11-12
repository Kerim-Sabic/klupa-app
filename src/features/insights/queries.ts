import { useQuery } from '@tanstack/react-query';
import { useActiveClub } from '../../lib/club';
import { queryKeys, usePlayers, useSessions } from '../../lib/data';
import {
  fetchClubFactors,
  fetchTeamAttendance,
  fetchTeamObservations,
  fetchTeamStints,
} from './api';
import type { FairShareInput, LoadInput, PitchInput } from './models';

/** What a view needs to know to pick a state: still loading, failed (with a retry), or ready. */
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

// Keys extend the shared ones with 'insights': another feature's list under the same team key can
// then never be mistaken for these joined rows, while invalidating the shared key still refreshes both.
function useStints() {
  const { clubId, teamId } = useActiveClub();
  return useQuery({
    queryKey: [...queryKeys.teamStints(teamId), 'insights'] as const,
    queryFn: () => fetchTeamStints(clubId, teamId),
  });
}

function useAttendance() {
  const { clubId, teamId } = useActiveClub();
  return useQuery({
    queryKey: [...queryKeys.attendance(teamId), 'insights'] as const,
    queryFn: () => fetchTeamAttendance(clubId, teamId),
  });
}

function useObservations() {
  const { clubId, teamId } = useActiveClub();
  return useQuery({
    queryKey: [...queryKeys.observations(teamId), 'insights'] as const,
    queryFn: () => fetchTeamObservations(clubId, teamId),
  });
}

function useClubFactors() {
  const { clubId } = useActiveClub();
  return useQuery({
    queryKey: ['club-factors', clubId] as const,
    queryFn: () => fetchClubFactors(clubId),
  });
}

export function useFairShareSource(): Source<FairShareInput> {
  const players = usePlayers();
  const stints = useStints();
  const attendance = useAttendance();
  const observations = useObservations();
  const all = [players, stints, attendance, observations];
  if (all.some((query) => query.isError)) return { status: 'error', retry: retryFailed(all) };
  if (
    players.data === undefined ||
    stints.data === undefined ||
    attendance.data === undefined ||
    observations.data === undefined
  ) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    data: {
      players: players.data,
      stints: stints.data,
      attendance: attendance.data,
      observations: observations.data,
    },
  };
}

export function useLoadSource(today: string): Source<LoadInput> {
  const players = usePlayers();
  const stints = useStints();
  const attendance = useAttendance();
  const all = [players, stints, attendance];
  if (all.some((query) => query.isError)) return { status: 'error', retry: retryFailed(all) };
  if (players.data === undefined || stints.data === undefined || attendance.data === undefined) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    data: { players: players.data, stints: stints.data, attendance: attendance.data, today },
  };
}

export function usePitchSource(): Source<PitchInput> {
  const sessions = useSessions();
  const attendance = useAttendance();
  const factors = useClubFactors();
  const all = [sessions, attendance, factors];
  if (all.some((query) => query.isError)) return { status: 'error', retry: retryFailed(all) };
  if (sessions.data === undefined || attendance.data === undefined || factors.data === undefined) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    data: { sessions: sessions.data, attendance: attendance.data, factors: factors.data },
  };
}
