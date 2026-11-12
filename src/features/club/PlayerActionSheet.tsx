import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../lib/errors';
import { useActiveClub } from '../../lib/club';
import { queryKeys, type Player } from '../../lib/data';
import { Button, Sheet, useToast } from '../../ui';
import { erasePlayer, updatePlayer } from './api';
import { ROSTER_DEPENDENT_KEYS } from './model';

export type PlayerAction = 'archive' | 'erase';

export interface PlayerActionSheetProps {
  open: boolean;
  action: PlayerAction;
  player: Player;
  onClose: () => void;
}

const REMOVED = ['identity', 'minutes', 'attendance', 'observations'] as const;

/**
 * Archiving hides a player and keeps their history. Erasing removes them for good, and says
 * exactly what goes and what stays before the coach confirms.
 */
export function PlayerActionSheet({ open, action, player, onClose }: PlayerActionSheetProps) {
  const { t } = useTranslation();
  const { clubId, teamId } = useActiveClub();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const label = player.label;

  const run = useMutation({
    mutationFn: async () => {
      if (action === 'archive') {
        await updatePlayer(clubId, player.id, { archived_at: new Date().toISOString() });
      } else {
        await erasePlayer(clubId, player.id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.players(teamId) });
      if (action === 'erase') {
        await Promise.all(
          ROSTER_DEPENDENT_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        );
      }
      toast({
        tone: 'success',
        message: t(`club.squad.toast.${action === 'archive' ? 'archived' : 'erased'}`, { label }),
      });
      onClose();
    },
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });

  const erase = action === 'erase';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(`club.squad.${action}.title`, { label })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('club.squad.form.cancel')}
          </Button>
          <Button
            variant={erase ? 'danger' : 'primary'}
            loading={run.isPending}
            onClick={() => {
              run.mutate();
            }}
          >
            {t(`club.squad.${action}.confirm`)}
          </Button>
        </>
      }
    >
      {erase ? (
        <div className="flex flex-col gap-4">
          <p>{t('club.squad.erase.intro', { label })}</p>
          <section aria-labelledby="erase-removed">
            <h3 id="erase-removed" className="font-semibold">
              {t('club.squad.erase.removedTitle')}
            </h3>
            <ul className="mt-1 list-disc pl-5 text-ink-soft">
              {REMOVED.map((item) => (
                <li key={item}>{t(`club.squad.erase.removed.${item}`)}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="erase-kept">
            <h3 id="erase-kept" className="font-semibold">
              {t('club.squad.erase.keptTitle')}
            </h3>
            <p className="mt-1 text-ink-soft">{t('club.squad.erase.kept')}</p>
          </section>
          <p className="font-semibold text-clay">{t('club.squad.erase.final')}</p>
        </div>
      ) : (
        <p>{t('club.squad.archive.body', { label, number: player.shirt_number })}</p>
      )}
    </Sheet>
  );
}
