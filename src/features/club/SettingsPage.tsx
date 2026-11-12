import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPinned } from 'lucide-react';
import { useState, type ChangeEvent, type SyntheticEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveClub, useClub } from '../../lib/club';
import { errorKey } from '../../lib/errors';
import { Button, Card, CardTitle, PageHeader, TextField, useToast } from '../../ui';
import { fetchClubSettings, updateClubSettings, type ClubSettings } from './api';
import {
  DECIMAL_SPECS,
  REFERENCE_VALUES,
  clubKeys,
  isOwner,
  toInputText,
  validateSettings,
  withError,
  type DecimalSpec,
  type SettingsFields,
  type SettingsErrors,
  type SettingsField,
  type SettingsValues,
} from './model';
import { LoadingBlock, QueryFailed, ReadOnlyNote } from './states';

interface FormProps {
  readonly initial: ClubSettings;
  readonly canWrite: boolean;
}

interface FieldProps {
  value: string;
  readOnly: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
}

function SettingsForm({ initial, canWrite }: FormProps) {
  const { t, i18n } = useTranslation();
  const { clubId } = useActiveClub();
  const { refresh } = useClub();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const language = i18n.language;
  const [fields, setFields] = useState<SettingsFields>(() => ({
    name: initial.name,
    floodlightKw: toInputText(initial.floodlight_kw, language),
    tariff: toInputText(initial.tariff_per_kwh, language),
    carbon: toInputText(initial.grid_kg_co2_per_kwh, language),
  }));
  const [errors, setErrors] = useState<SettingsErrors>({});

  const save = useMutation({
    mutationFn: async (values: SettingsValues) => {
      await updateClubSettings(clubId, {
        name: values.name,
        floodlight_kw: values.floodlightKw,
        tariff_per_kwh: values.tariff,
        grid_kg_co2_per_kwh: values.carbon,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clubKeys.settings(clubId) });
      // The club's name is shown across the app; reload it from the same place it came from.
      await refresh();
      toast({ tone: 'success', message: t('club.settings.saved') });
    },
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateSettings(fields);
    if (result.values === null) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    save.mutate(result.values);
  }

  function fillReference() {
    setFields((current) => ({
      ...current,
      tariff: toInputText(REFERENCE_VALUES.tariff, language),
      carbon: toInputText(REFERENCE_VALUES.carbon, language),
    }));
    setErrors((current) => {
      const next = { ...current };
      delete next.tariff;
      delete next.carbon;
      return next;
    });
  }

  function field(name: SettingsField, text: string): FieldProps {
    const key = errors[name];
    const spec: DecimalSpec | undefined = name === 'name' ? undefined : DECIMAL_SPECS[name];
    const message =
      key === undefined
        ? undefined
        : t(`club.settings.errors.${key}`, {
            max: toInputText(spec?.max ?? null, language),
            places: spec?.places,
          });
    return {
      value: text,
      readOnly: !canWrite,
      onChange: (event) => {
        setFields((current) => ({ ...current, [name]: event.target.value }));
      },
      ...withError(message),
    };
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {!canWrite && <ReadOnlyNote>{t('club.settings.ownerOnly')}</ReadOnlyNote>}
      <Card className="flex flex-col gap-4">
        <CardTitle>{t('club.settings.nameTitle')}</CardTitle>
        <TextField
          label={t('club.settings.name')}
          autoComplete="organization"
          {...field('name', fields.name)}
        />
      </Card>
      <Card className="flex flex-col gap-4">
        <CardTitle>{t('club.settings.facilityTitle')}</CardTitle>
        <p className="text-ink-soft">{t('club.settings.facilityIntro')}</p>
        {canWrite && (
          <div className="flex flex-col items-start gap-2">
            <Button variant="secondary" icon={<MapPinned />} onClick={fillReference}>
              {t('club.settings.useReference')}
            </Button>
            <p className="text-[13px] text-ink-soft">{t('club.settings.referenceNote')}</p>
          </div>
        )}
        <TextField
          label={t('club.settings.floodlightKw')}
          hint={t('club.settings.floodlightKwHint')}
          inputMode="decimal"
          autoComplete="off"
          {...field('floodlightKw', fields.floodlightKw)}
        />
        <TextField
          label={t('club.settings.tariff')}
          hint={t('club.settings.sourcePrice')}
          inputMode="decimal"
          autoComplete="off"
          {...field('tariff', fields.tariff)}
        />
        <TextField
          label={t('club.settings.carbon')}
          hint={t('club.settings.sourceCarbon')}
          inputMode="decimal"
          autoComplete="off"
          {...field('carbon', fields.carbon)}
        />
      </Card>
      {canWrite && (
        <div>
          <Button type="submit" size="lg" loading={save.isPending}>
            {t('club.settings.save')}
          </Button>
        </div>
      )}
    </form>
  );
}

/** Club name and the optional figures behind every facility estimate. Owners change them. */
export function SettingsPage() {
  const { t } = useTranslation();
  const { clubId, role } = useActiveClub();
  const settings = useQuery({
    queryKey: clubKeys.settings(clubId),
    queryFn: () => fetchClubSettings(clubId),
  });

  let body: ReactNode;
  if (settings.isPending) body = <LoadingBlock rows={4} />;
  else if (settings.isError) {
    body = (
      <QueryFailed
        error={settings.error}
        onRetry={() => {
          void settings.refetch();
        }}
      />
    );
  } else {
    body = <SettingsForm initial={settings.data} canWrite={isOwner(role)} />;
  }

  return (
    <>
      <PageHeader
        title={t('club.settings.title')}
        subtitle={t('club.settings.subtitle')}
        back={{ to: '/club', label: t('club.back') }}
      />
      {body}
    </>
  );
}
