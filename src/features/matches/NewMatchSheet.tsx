import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useActiveClub } from '../../lib/club';
import { queryKeys } from '../../lib/data';
import { errorKey } from '../../lib/errors';
import { Button, SelectField, Sheet, TextField, useToast } from '../../ui';
import { createMatch } from './api';
import {
  initialValues,
  OPPONENT_MAX,
  PERIODS_MAX,
  PERIODS_MIN,
  validateMatch,
  type MatchValues,
  type MatchFormErrors,
  type NewMatch,
} from './matchForm';

export interface NewMatchSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const PERIOD_CHOICES = Array.from(
  { length: PERIODS_MAX - PERIODS_MIN + 1 },
  (_, index) => PERIODS_MIN + index,
);

export function NewMatchSheet({ open, onClose }: NewMatchSheetProps) {
  const { t } = useTranslation();
  const { clubId, teamId, ageGroup } = useActiveClub();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const formId = useId();
  const [values, setValues] = useState<MatchValues>(() => initialValues(ageGroup));
  const [errors, setErrors] = useState<MatchFormErrors>({});

  const create = useMutation({
    mutationFn: (value: NewMatch) => createMatch({ clubId, teamId, ...value }),
    onSuccess: async (matchId) => {
      await client.invalidateQueries({ queryKey: queryKeys.matches(teamId) });
      toast({ tone: 'success', message: t('matches.form.created') });
      reset();
      onClose();
      void navigate(`/matches/${matchId}/live`);
    },
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });

  function reset() {
    setValues(initialValues(ageGroup));
    setErrors({});
  }

  function edit(field: keyof MatchValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // The reason goes away as soon as the coach starts fixing that field.
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateMatch(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    create.mutate(result.value);
  }

  function errorText(field: keyof MatchValues): { error: string } | Record<string, never> {
    const code = errors[field];
    return code === undefined ? {} : { error: t(`matches.form.errors.${code}`) };
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('matches.form.title')}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('matches.form.cancel')}
          </Button>
          <Button type="submit" form={formId} loading={create.isPending}>
            {t('matches.form.create')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label={t('matches.form.opponent')}
          hint={t('matches.form.opponentHint')}
          value={values.opponent}
          maxLength={OPPONENT_MAX + 20}
          autoComplete="off"
          onChange={(event) => {
            edit('opponent', event.target.value);
          }}
          {...errorText('opponent')}
        />
        <TextField
          label={t('matches.form.date')}
          type="date"
          value={values.playedOn}
          onChange={(event) => {
            edit('playedOn', event.target.value);
          }}
          {...errorText('playedOn')}
        />
        <SelectField
          label={t('matches.form.periods')}
          value={values.periodCount}
          options={PERIOD_CHOICES.map((number) => ({
            value: String(number),
            label:
              number === 1
                ? t('matches.form.periodsOptionOne')
                : t('matches.form.periodsOption', { number }),
          }))}
          onChange={(value) => {
            edit('periodCount', value);
          }}
          {...errorText('periodCount')}
        />
        <TextField
          label={t('matches.form.minutes')}
          hint={t('matches.form.minutesHint')}
          type="number"
          inputMode="numeric"
          min={5}
          max={60}
          value={values.periodMinutes}
          onChange={(event) => {
            edit('periodMinutes', event.target.value);
          }}
          {...errorText('periodMinutes')}
        />
      </form>
    </Sheet>
  );
}
