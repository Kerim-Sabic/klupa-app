import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { ReviewEvent, ReviewMatch } from './reviewModel';

const MATCH_COLUMNS = 'id, opponent, played_on, status, period_count, period_minutes';
const EVENT_COLUMNS = 'id, period, clock_seconds, side, kind, weight, x, y';

/** One match of the club, or null when it does not exist (or is not the club's). */
export async function fetchReviewMatch(
  clubId: string,
  matchId: string,
): Promise<ReviewMatch | null> {
  const { data, error } = await supabase
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('club_id', clubId)
    .eq('id', matchId)
    .limit(1)
    .maybeSingle();
  if (error !== null) throw error;
  return data;
}

/** The match's events that were not undone, in match order. */
export async function fetchReviewEvents(clubId: string, matchId: string): Promise<ReviewEvent[]> {
  const { data, error } = await supabase
    .from('match_events')
    .select(EVENT_COLUMNS)
    .eq('club_id', clubId)
    .eq('match_id', matchId)
    .is('deleted_at', null)
    .order('period', { ascending: true })
    .order('clock_seconds', { ascending: true })
    .limit(2000);
  if (error !== null) throw error;
  return data;
}

/** What the live feed is doing: still connecting, delivering changes, or cut off. */
export type FeedState = 'connecting' | 'live' | 'offline';

/**
 * Tells the caller whenever an event of this match is recorded or undone, or the match changes
 * state, on any device. It carries no data: the caller reads again through the ordinary
 * queries. The database delivers a change only to a signed-in member of the club (row-level
 * security is checked per subscriber). Returns the function that ends the subscription.
 */
export function watchMatch(
  matchId: string,
  onChange: () => void,
  onState: (state: FeedState) => void,
): () => void {
  const channel = supabase
    .channel(`match-${matchId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      onChange,
    )
    .subscribe((status) => {
      onState(status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED ? 'live' : 'offline');
    });
  return () => {
    void supabase.removeChannel(channel);
  };
}
