import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../lib/errors';
import { useActiveClub } from '../../lib/club';
import { queryKeys, type Player } from '../../lib/data';
import { Button, SelectField, Sheet, TextField, useToast } from '../../ui';
import { insertPlayer, updatePlayer } from './api';
import {
  CONSENT_VALUES,
  QUARTERS,
  consentStamp,
  fieldsFrom,
  emptyFields,
  validatePlayer,
  withError,
  type PlayerFields,
  type PlayerErrors,
  type PlayerValues,
} from './model';

export interface PlayerSheetProps {
  open: boolean;
  /** The player being edited, or null to add a new one. */
  player: Player | null;
  /** The current squad, for the shirt number check. */
  players: readonly Player[];
  onClose: () => void;
}

const FORM_ID = 'player-form';

/**
 * Add or edit one player. Mount it afresh each time it opens (a new `key`) so the form starts
 * from the player, not from the last thing typed.
 */
export function PlayerSheet({ open, player, players, onClose }: PlayerSheetProps) {
  const { t } = useTranslation();
  const { clubId, teamId } = useActiveClub();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<PlayerFields>(() =>
    player === null ? emptyFields() : fieldsFrom(player),
  );
  const [errors, setErrors] = useState<PlayerErrors>({});

  const save = useMutation({
    mutationFn: async (values: PlayerValues) => {
      const now = new Date();
      if (player === null) {
        await insertPlayer({
          club_id: clubId,
          team_id: teamId,
          label: values.label,
          shirt_number: values.shirtNumber,
          consent: values.consent,
          consent_recorded_at: consentStamp(values.consent, now),
          birth_quarter: values.birthQuarter,
        });
        return;
      }
      // The recorded date only moves when the status does.
      const consentChanged = player.consent !== values.consent;
      await updatePlayer(clubId, player.id, {
        label: values.label,
        shirt_number: values.shirtNumber,
        birth_quarter: values.birthQuarter,
        ...(consentChanged && {
          consent: values.consent,
          consent_recorded_at: consentStamp(values.consent, now),
        }),
      });
    },
    onSuccess: async (_result, values) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.players(teamId) });
      toast({
        tone: 'success',
        message: t(player === null ? 'club.squad.toast.added' : 'club.squad.toast.saved', {
          label: values.label,
        }),
      });
      onClose();
    },
    onError: (error) => {
      if (errorKey(error) === 'errors.duplicate') {
        setErrors({ shirt: 'shirtConflict' });
        return;
      }
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validatePlayer(fields, players, player?.id ?? null);
    if (result.values === null) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(result.values);
  }

  const change = (patch: Partial<PlayerFields>) => {
    setFields((current) => ({ ...current, ...patch }));
  };
  const labelError =
    errors.label === undefined ? undefined : t(`club.squad.errors.${errors.label}`);
  const shirtError =
    errors.shirt === undefined
      ? undefined
      : t(`club.squad.errors.${errors.shirt}`, {
          number: fields.shirt.trim(),
          label: errors.takenBy ?? '',
        });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(player === null ? 'club.squad.form.addTitle' : 'club.squad.form.editTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('club.squad.form.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={save.isPending}>
            {t(player === null ? 'club.squad.form.add' : 'club.squad.form.save')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t('club.squad.form.label')}
          hint={t('club.squad.form.labelHint')}
          value={fields.label}
          onChange={(event) => {
            change({ label: event.target.value });
          }}
          autoComplete="off"
          {...withError(labelError)}
        />
        <TextField
          label={t('club.squad.form.shirt')}
          hint={t('club.squad.form.shirtHint')}
          value={fields.shirt}
          inputMode="numeric"
          onChange={(event) => {
            change({ shirt: event.target.value });
          }}
          autoComplete="off"
          {...withError(shirtError)}
        />
        <SelectField
          label={t('club.squad.form.consent')}
          hint={t('club.squad.form.consentHint')}
          value={fields.consent}
          onChange={(value) => {
            change({
              consent: CONSENT_VALUES.find((option) => option === value) ?? 'not_recorded',
            });
          }}
          options={CONSENT_VALUES.map((value) => ({
            value,
            label: t(`club.squad.consent.${value}`),
          }))}
        />
        <SelectField
          label={t('club.squad.form.quarter')}
          hint={t('club.squad.form.quarterHint')}
          value={fields.quarter}
          onChange={(value) => {
            change({ quarter: value });
          }}
          options={[
            { value: '', label: t('club.squad.quarter.none') },
            ...QUARTERS.map((quarter) => ({
              value: String(quarter),
              label: t(`club.squad.quarter.q${String(quarter)}`),
            })),
          ]}
        />
      </form>
    </Sheet>
  );
}
