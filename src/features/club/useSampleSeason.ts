import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useActiveClub } from '../../lib/club';
import { queryKeys } from '../../lib/data';
import { useToast } from '../../ui';
import * as api from './api';
import { ROSTER_DEPENDENT_KEYS, todayIso } from './model';
import { generateSeason } from './seed';
import { writeSeason } from './writeSeason';

/** One fixed seed: every demo club gets the same invented season, so the demo is repeatable. */
const SAMPLE_SEED = 20_261_112;

/**
 * Fills an empty club with an invented season, stored in one go or not at all, then refreshes
 * every screen that reads the squad. Shared by the Club screen's card and Today's empty state.
 */
export function useSampleSeason() {
  const { t } = useTranslation();
  const { clubId, teamId } = useActiveClub();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Checked again here: the squad may have been filled in another tab since the offer showed.
      if ((await api.countActivePlayers(clubId, teamId)) > 0) return null;
      const data = generateSeason({ seed: SAMPLE_SEED, today: todayIso(new Date()) });
      return writeSeason(data, { clubId, teamId }, api);
    },
    onSuccess: async (summary) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.players(teamId) }),
        ...ROSTER_DEPENDENT_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      ]);
      toast(
        summary === null
          ? { tone: 'info', message: t('club.sample.notEmpty') }
          : {
              tone: 'success',
              message: t('club.sample.done', {
                players: summary.players,
                matches: summary.matches,
                sessions: summary.sessions,
              }),
            },
      );
    },
  });
}
