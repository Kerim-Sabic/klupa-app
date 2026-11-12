import { useInfiniteQuery, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useActiveClub } from './club';
import { PAGE_SIZE, olderThan, splitPage, type Page, type PageCursor } from './paging';
import { supabase, type Row } from './supabase';

/**
 * Shared read models. Every list names its columns and has a limit, so no
 * screen can accidentally pull a whole table. Features add their own writes
 * and invalidate these keys.
 */
export const queryKeys = {
  players: (teamId: string) => ['players', teamId] as const,
  matches: (teamId: string) => ['matches', teamId] as const,
  match: (matchId: string) => ['match', matchId] as const,
  matchEvents: (matchId: string) => ['match-events', matchId] as const,
  stints: (matchId: string) => ['stints', matchId] as const,
  teamStints: (teamId: string) => ['team-stints', teamId] as const,
  sessions: (teamId: string) => ['sessions', teamId] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
  attendance: (teamId: string) => ['attendance', teamId] as const,
  observations: (teamId: string) => ['observations', teamId] as const,
};

const PLAYER_COLUMNS = 'id, label, shirt_number, consent, birth_quarter, archived_at';
const MATCH_COLUMNS = 'id, opponent, played_on, status, period_count, period_minutes';
const SESSION_COLUMNS =
  'id, held_on, status, focus, duration_minutes, area, expected_players, floodlit, source_match_id';

export type Player = Pick<
  Row<'players'>,
  'id' | 'label' | 'shirt_number' | 'consent' | 'birth_quarter' | 'archived_at'
>;
export type MatchSummary = Pick<
  Row<'matches'>,
  'id' | 'opponent' | 'played_on' | 'status' | 'period_count' | 'period_minutes'
>;
export type SessionSummary = Pick<
  Row<'sessions'>,
  | 'id'
  | 'held_on'
  | 'status'
  | 'focus'
  | 'duration_minutes'
  | 'area'
  | 'expected_players'
  | 'floodlit'
  | 'source_match_id'
>;

/** The active squad, by shirt number. Archived players are left out. */
export async function fetchPlayers(clubId: string, teamId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select(PLAYER_COLUMNS)
    .eq('club_id', clubId)
    .eq('team_id', teamId)
    .is('archived_at', null)
    .order('shirt_number', { ascending: true })
    .limit(100);
  if (error !== null) throw error;
  return data;
}

export function usePlayers(): UseQueryResult<Player[]> {
  const { clubId, teamId } = useActiveClub();
  return useQuery({
    queryKey: queryKeys.players(teamId),
    queryFn: () => fetchPlayers(clubId, teamId),
  });
}

/** The team's matches, newest first. */
export async function fetchMatches(clubId: string, teamId: string): Promise<MatchSummary[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('club_id', clubId)
    .eq('team_id', teamId)
    .order('played_on', { ascending: false })
    .limit(50);
  if (error !== null) throw error;
  return data;
}

export function useMatches(): UseQueryResult<MatchSummary[]> {
  const { clubId, teamId } = useActiveClub();
  return useQuery({
    queryKey: queryKeys.matches(teamId),
    queryFn: () => fetchMatches(clubId, teamId),
  });
}

/** The team's training sessions, newest first. */
export async function fetchSessions(clubId: string, teamId: string): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('club_id', clubId)
    .eq('team_id', teamId)
    .order('held_on', { ascending: false })
    .limit(50);
  if (error !== null) throw error;
  return data;
}

export function useSessions(): UseQueryResult<SessionSummary[]> {
  const { clubId, teamId } = useActiveClub();
  return useQuery({
    queryKey: queryKeys.sessions(teamId),
    queryFn: () => fetchSessions(clubId, teamId),
  });
}

/* ------------------------------------------------------------ paged lists */

interface PagesExtra {
  readonly refetch: () => void;
  /** True when older rows exist that have not been loaded yet. */
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly loadingMore: boolean;
}

/** A list read a page at a time; `data` is every row loaded so far, newest first. */
export type ListPages<T> = PagesExtra &
  (
    | {
        readonly isPending: true;
        readonly isError: false;
        readonly isSuccess: false;
        readonly data: undefined;
      }
    | {
        readonly isPending: false;
        readonly isError: true;
        readonly isSuccess: false;
        readonly data: undefined;
      }
    | {
        readonly isPending: false;
        readonly isError: false;
        readonly isSuccess: true;
        readonly data: T[];
      }
  );

function usePages<T>(
  key: readonly unknown[],
  fetchPage: (after: PageCursor | null) => Promise<Page<T>>,
): ListPages<T> {
  const query = useInfiniteQuery({
    queryKey: [...key, 'pages'],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (last) => last.next,
  });
  const extra: PagesExtra = {
    refetch: () => {
      void query.refetch();
    },
    hasMore: query.hasNextPage,
    loadMore: () => {
      void query.fetchNextPage();
    },
    loadingMore: query.isFetchingNextPage,
  };
  if (query.isPending) {
    return { ...extra, isPending: true, isError: false, isSuccess: false, data: undefined };
  }
  if (query.isError) {
    return { ...extra, isPending: false, isError: true, isSuccess: false, data: undefined };
  }
  const rows = query.data.pages.flatMap((page) => page.rows);
  return { ...extra, isPending: false, isError: false, isSuccess: true, data: rows };
}

/** One page of the team's matches, newest first, strictly older than `after` when given. */
export async function fetchMatchPage(
  clubId: string,
  teamId: string,
  after: PageCursor | null,
): Promise<Page<MatchSummary>> {
  const base = supabase
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('club_id', clubId)
    .eq('team_id', teamId);
  const { data, error } = await (after === null ? base : base.or(olderThan('played_on', after)))
    .order('played_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error !== null) throw error;
  return splitPage(data, (row) => row.played_on);
}

/** One page of the team's training sessions, newest first. */
export async function fetchSessionPage(
  clubId: string,
  teamId: string,
  after: PageCursor | null,
): Promise<Page<SessionSummary>> {
  const base = supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('club_id', clubId)
    .eq('team_id', teamId);
  const { data, error } = await (after === null ? base : base.or(olderThan('held_on', after)))
    .order('held_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error !== null) throw error;
  return splitPage(data, (row) => row.held_on);
}

/** The team's matches a page at a time, for the list a coach scrolls. */
export function useMatchPages(): ListPages<MatchSummary> {
  const { clubId, teamId } = useActiveClub();
  return usePages(queryKeys.matches(teamId), (after) => fetchMatchPage(clubId, teamId, after));
}

/** The team's training sessions a page at a time. */
export function useSessionPages(): ListPages<SessionSummary> {
  const { clubId, teamId } = useActiveClub();
  return usePages(queryKeys.sessions(teamId), (after) => fetchSessionPage(clubId, teamId, after));
}
