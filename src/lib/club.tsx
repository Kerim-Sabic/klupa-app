import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from './auth';
import { supabase, type Enums } from './supabase';

export interface ActiveClub {
  readonly clubId: string;
  readonly clubName: string;
  readonly isDemo: boolean;
  readonly role: Enums['member_role'];
  /** The team being coached. A club always has one after onboarding. */
  readonly teamId: string;
  readonly teamName: string;
  readonly ageGroup: Enums['age_group'];
}

export type ClubState =
  | { readonly status: 'loading' }
  | { readonly status: 'none' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly club: ActiveClub };

interface ClubContextValue {
  readonly state: ClubState;
  readonly refresh: () => Promise<void>;
}

const ClubContext = createContext<ClubContextValue | null>(null);

/** The signed-in user's first club and its first active team, or null before onboarding. */
export async function fetchActiveClub(userId: string): Promise<ActiveClub | null> {
  const memberships = await supabase
    .from('club_members')
    .select('role, clubs ( id, name, is_demo )')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (memberships.error !== null) throw memberships.error;
  const membership = memberships.data[0];
  if (membership === undefined) return null;

  const teams = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', membership.clubs.id)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
  if (teams.error !== null) throw teams.error;
  const team = teams.data[0];
  if (team === undefined) return null;

  return {
    clubId: membership.clubs.id,
    clubName: membership.clubs.name,
    isDemo: membership.clubs.is_demo,
    role: membership.role,
    teamId: team.id,
    teamName: team.name,
    ageGroup: team.age_group,
  };
}

export function ClubProvider({ children }: { readonly children: ReactNode }) {
  const { state: auth } = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.status === 'signed-in' ? auth.user.id : null;

  const query = useQuery({
    queryKey: ['active-club', userId],
    queryFn: () => (userId === null ? Promise.resolve(null) : fetchActiveClub(userId)),
    enabled: userId !== null,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['active-club'] });
  }, [queryClient]);

  const value = useMemo<ClubContextValue>(() => {
    let state: ClubState = { status: 'loading' };
    if (query.isError) state = { status: 'error' };
    else if (query.data === null) state = { status: 'none' };
    else if (query.data !== undefined) state = { status: 'ready', club: query.data };
    return { state, refresh };
  }, [query.data, query.isError, refresh]);

  return <ClubContext value={value}>{children}</ClubContext>;
}

export function useClub(): ClubContextValue {
  const value = useContext(ClubContext);
  if (value === null) throw new Error('useClub must be used inside <ClubProvider>.');
  return value;
}

/** For screens that are only reachable once a club exists. */
export function useActiveClub(): ActiveClub {
  const { state } = useClub();
  if (state.status !== 'ready') throw new Error('This screen needs an active club.');
  return state.club;
}
