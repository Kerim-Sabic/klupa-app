import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryKeys } from '../../lib/data';
import { watchMatch, type FeedState } from './api';

/**
 * Keeps a match on screen current while it is being recorded on another phone: every change
 * the database reports marks the match and its events stale, and the queries read them again.
 * The feed only says "something changed"; what is shown always comes from an ordinary read,
 * so row-level security decides what this person sees exactly as it does everywhere else.
 *
 * Returns the state of the feed, or null when the match is not being followed.
 */
export function useLiveMatch(matchId: string, enabled: boolean): FeedState | null {
  const client = useQueryClient();
  const [state, setState] = useState<FeedState>('connecting');

  useEffect(() => {
    if (!enabled) return undefined;
    return watchMatch(
      matchId,
      () => {
        void client.invalidateQueries({ queryKey: queryKeys.matchEvents(matchId) });
        void client.invalidateQueries({ queryKey: queryKeys.match(matchId) });
      },
      setState,
    );
  }, [client, enabled, matchId]);

  return enabled ? state : null;
}
