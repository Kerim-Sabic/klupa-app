import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../lib/data';
import { useActiveClub } from '../../lib/club';
import { errorKey } from '../../lib/errors';
import type { Enums } from '../../lib/supabase';
import { useToast } from '../../ui';
import {
  fetchAttendance,
  fetchObservations,
  fetchSession,
  insertSession,
  updateSessionStatus,
  upsertAttendance,
  upsertObservation,
  type AttendanceRow,
  type ObservationRow,
  type SessionDetail,
} from './api';
import { dropRow, putRow } from './cache';
import type { SessionValues } from './values';
import type { AttendanceValue, Tally } from './tally';

/** Children of `queryKeys.session(id)`, so invalidating the session refreshes them too. */
export const sessionKeys = {
  attendance: (sessionId: string) => [...queryKeys.session(sessionId), 'attendance'] as const,
  observations: (sessionId: string) => [...queryKeys.session(sessionId), 'observations'] as const,
};

/** Every write that edits a session's counters shares this prefix; see `settle`. */
const writeKey = (sessionId: string) => ['session-write', sessionId] as const;

export function useSessionDetail(sessionId: string): UseQueryResult<SessionDetail | null> {
  const { clubId } = useActiveClub();
  return useQuery({
    queryKey: queryKeys.session(sessionId),
    queryFn: () => fetchSession(clubId, sessionId),
  });
}

export function useSessionAttendance(sessionId: string): UseQueryResult<AttendanceRow[]> {
  const { clubId } = useActiveClub();
  return useQuery({
    queryKey: sessionKeys.attendance(sessionId),
    queryFn: () => fetchAttendance(clubId, sessionId),
  });
}

export function useSessionObservations(
  sessionId: string,
  skill: string,
): UseQueryResult<ObservationRow[]> {
  const { clubId } = useActiveClub();
  return useQuery({
    queryKey: [...sessionKeys.observations(sessionId), skill],
    queryFn: () => fetchObservations(clubId, sessionId, skill),
  });
}

function refresh(queryClient: QueryClient, teamId: string, sessionId: string): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions(teamId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.session(sessionId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.attendance(teamId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.observations(teamId) }),
  ]).then(() => undefined);
}

/** Plan and store a session; the caller decides where to go next. */
export function useCreateSession(): UseMutationResult<string, Error, SessionValues> {
  const { clubId, teamId } = useActiveClub();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (values: SessionValues) => insertSession({ clubId, teamId }, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions(teamId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.attendance(teamId) }),
      ]);
    },
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });
}

export function useSetSessionStatus(
  sessionId: string,
): UseMutationResult<void, Error, 'completed' | 'cancelled'> {
  const { clubId, teamId } = useActiveClub();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (status: Extract<Enums['session_status'], 'completed' | 'cancelled'>) =>
      updateSessionStatus(clubId, sessionId, status),
    onSuccess: async (_data, status) => {
      toast({ tone: 'success', message: t(`sessions.status.saved.${status}`) });
      await refresh(queryClient, teamId, sessionId);
    },
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });
}

/**
 * Refetch only when this was the last write still in flight for the session. Otherwise the
 * refetch would return a state older than the taps the coach has made since, and put it back.
 */
function settle(queryClient: QueryClient, teamId: string, sessionId: string): void {
  if (queryClient.isMutating({ mutationKey: writeKey(sessionId) }) <= 1) {
    void refresh(queryClient, teamId, sessionId);
  }
}

/**
 * Save one player's attendance the moment it changes. The screen updates first; a failed
 * save puts that player's row back and says so. Writes for one player run one after the
 * other, so fast taps cannot land out of order.
 */
export function useSaveAttendance(sessionId: string, playerId: string) {
  const { clubId, teamId } = useActiveClub();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const key = sessionKeys.attendance(sessionId);
  return useMutation({
    mutationKey: [...writeKey(sessionId), 'attendance'],
    scope: { id: `attendance:${sessionId}:${playerId}` },
    mutationFn: (value: AttendanceValue) => upsertAttendance(clubId, sessionId, playerId, value),
    onMutate: async (value) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient.getQueryData<AttendanceRow[]>(key)?.find((row) => row.player_id === playerId) ??
        null;
      queryClient.setQueryData<AttendanceRow[]>(key, (rows = []) =>
        putRow(rows, { player_id: playerId, ...value }),
      );
      return { previous };
    },
    onError: (error, _value, context) => {
      queryClient.setQueryData<AttendanceRow[]>(key, (rows = []) =>
        context?.previous == null ? dropRow(rows, playerId) : putRow(rows, context.previous),
      );
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
    onSettled: () => {
      settle(queryClient, teamId, sessionId);
    },
  });
}

/** Same behaviour as `useSaveAttendance`, for a player's attempts and successes at the focus skill. */
export function useSaveObservation(sessionId: string, skill: string, playerId: string) {
  const { clubId, teamId } = useActiveClub();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const key = [...sessionKeys.observations(sessionId), skill];
  return useMutation({
    mutationKey: [...writeKey(sessionId), 'observation'],
    scope: { id: `observation:${sessionId}:${playerId}:${skill}` },
    mutationFn: (tally: Tally) => upsertObservation(clubId, sessionId, playerId, skill, tally),
    onMutate: async (tally) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous =
        queryClient
          .getQueryData<ObservationRow[]>(key)
          ?.find((row) => row.player_id === playerId) ?? null;
      queryClient.setQueryData<ObservationRow[]>(key, (rows = []) =>
        putRow(rows, { player_id: playerId, ...tally }),
      );
      return { previous };
    },
    onError: (error, _tally, context) => {
      queryClient.setQueryData<ObservationRow[]>(key, (rows = []) =>
        context?.previous == null ? dropRow(rows, playerId) : putRow(rows, context.previous),
      );
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
    onSettled: () => {
      settle(queryClient, teamId, sessionId);
    },
  });
}
