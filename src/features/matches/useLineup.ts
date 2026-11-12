import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveClub } from '../../lib/club';
import { queryKeys } from '../../lib/data';
import { useToast } from '../../ui';
import { applyLineup } from './api';
import { closeAllChanges, lineupSteps, toggleChange, type StintChange } from './lineup';
import type { StintRow } from './model';

export interface LineupApi {
  /** Players whose change is on its way to the server; only their own toggle waits. */
  readonly busy: ReadonlySet<string>;
  readonly toggle: (playerId: string, period: number, seconds: number) => Promise<void>;
  readonly closeAll: (period: number, seconds: number) => Promise<void>;
  readonly reopen: (playerIds: readonly string[], period: number) => Promise<void>;
}

/**
 * Stint writes. They are not queued offline: minutes need the server's answer, so a failure is
 * said out loud with a toast and the toggle stays where it was (it is drawn from server rows).
 */
export function useLineup(matchId: string, stints: readonly StintRow[]): LineupApi {
  const { clubId, teamId } = useActiveClub();
  const client = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const apply = useCallback(
    async (changes: readonly StintChange[]) => {
      if (changes.length === 0) return;
      // One request for the whole change: the database stores every step or none of them.
      const saved = await applyLineup(clubId, matchId, lineupSteps(changes)).then(
        () => true,
        () => false,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.stints(matchId) }),
        client.invalidateQueries({ queryKey: queryKeys.teamStints(teamId) }),
      ]);
      if (!saved) {
        toast({ tone: 'error', message: t('matches.lineup.saveError') });
      }
    },
    [client, clubId, matchId, t, teamId, toast],
  );

  const toggle = useCallback(
    async (playerId: string, period: number, seconds: number) => {
      setBusy((current) => new Set(current).add(playerId));
      try {
        await apply([toggleChange(stints, playerId, period, seconds)]);
      } finally {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(playerId);
          return next;
        });
      }
    },
    [apply, stints],
  );

  const closeAll = useCallback(
    (period: number, seconds: number) => apply(closeAllChanges(stints, period, seconds)),
    [apply, stints],
  );

  const reopen = useCallback(
    (playerIds: readonly string[], period: number) =>
      apply(playerIds.map((playerId) => ({ type: 'insert', playerId, period, onSeconds: 0 }))),
    [apply],
  );

  return { busy, toggle, closeAll, reopen };
}
