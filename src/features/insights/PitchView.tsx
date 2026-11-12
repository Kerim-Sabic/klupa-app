import { CalendarX2, CircleCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PitchArea, RightSizedSession } from '../../engine';
import {
  Card,
  CardTitle,
  DataTable,
  EmptyState,
  LinkButton,
  Pill,
  Reveal,
  Stat,
  type Column,
} from '../../ui';
import { useFormatter, type Formatter } from './format';
import { buildPitchModel, type PitchInput, type PitchModel } from './models';
import { usePitchSource } from './queries';
import { SourceView } from './SourceView';

function UseStats({ model, format }: { readonly model: PitchModel; readonly format: Formatter }) {
  const { t } = useTranslation();
  const { summary } = model;
  const perHour = summary.playersPerPitchHour;
  return (
    <Card className="grid gap-5 sm:grid-cols-3">
      <Stat
        label={t('insights.pitch.booked.label')}
        value={summary.pitchHours}
        format={(value) => format.number(value, 1)}
        hint={t('insights.pitch.booked.hint', { count: model.sessionCount })}
      />
      <Stat
        label={t('insights.pitch.perHour.label')}
        value={perHour ?? 0}
        format={(value) => (perHour === null ? t('insights.load.none') : format.number(value, 1))}
        hint={t('insights.pitch.perHour.hint')}
      />
      <Stat
        label={t('insights.pitch.floodlit.label')}
        value={summary.floodlitHours}
        format={(value) => format.number(value, 1)}
        hint={t('insights.pitch.floodlit.hint')}
      />
    </Card>
  );
}

/** Each estimate appears only when every number it needs was typed in, and always says estimate. */
function Estimates({ model, format }: { readonly model: PitchModel; readonly format: Formatter }) {
  const { t } = useTranslation();
  const { estimatedKwh, estimatedCost, estimatedKgCo2 } = model.summary;
  const shown = [
    { key: 'energy', value: estimatedKwh },
    { key: 'cost', value: estimatedCost },
    { key: 'emissions', value: estimatedKgCo2 },
  ].flatMap((item) => (item.value === null ? [] : [{ key: item.key, value: item.value }]));
  const missing = shown.length < 3;
  return (
    <section aria-labelledby="estimates-title" className="flex flex-col gap-3">
      <h2 id="estimates-title" className="text-[22px] font-semibold text-ink">
        {t('insights.pitch.estimates.title')}
      </h2>
      {shown.length > 0 && (
        <Card className="grid gap-5 sm:grid-cols-3">
          {shown.map((item) => (
            <div key={item.key} className="flex flex-col gap-1">
              <Stat
                label={t(`insights.pitch.estimates.${item.key}.label`)}
                value={item.value}
                format={(value) =>
                  t(`insights.pitch.estimates.${item.key}.value`, {
                    value: format.number(value, 1),
                  })
                }
                hint={t(`insights.pitch.estimates.${item.key}.hint`)}
              />
              <div>
                <Pill tone="mute">{t('insights.pitch.estimates.badge')}</Pill>
              </div>
            </div>
          ))}
        </Card>
      )}
      {missing && (
        <Card className="flex flex-col items-start gap-3">
          <p className="max-w-prose text-[15px] text-ink">{t('insights.pitch.estimates.prompt')}</p>
          <LinkButton to="/club/settings" variant="secondary">
            {t('insights.pitch.estimates.action')}
          </LinkButton>
        </Card>
      )}
      <p className="max-w-prose text-[13px] text-ink-soft">{t('insights.pitch.estimates.note')}</p>
    </section>
  );
}

function RightSizing({
  model,
  format,
}: {
  readonly model: PitchModel;
  readonly format: Formatter;
}) {
  const { t } = useTranslation();
  const { sessions, pitchHoursFreed } = model.summary.rightSizing;
  const area = (value: PitchArea): string => t(`insights.pitch.area.${value}`);
  const columns: Column<RightSizedSession>[] = [
    {
      id: 'date',
      header: t('insights.pitch.right.col.date'),
      cell: (row) => format.shortDate(row.date),
      sortValue: (row) => row.date,
    },
    {
      id: 'booked',
      header: t('insights.pitch.right.col.booked'),
      cell: (row) => area(row.booked),
    },
    {
      id: 'fits',
      header: t('insights.pitch.right.col.fits'),
      cell: (row) => area(row.wouldFit),
    },
    {
      id: 'attended',
      header: t('insights.pitch.right.col.attended'),
      cell: (row) => format.number(row.attended),
      sortValue: (row) => row.attended,
      align: 'right',
    },
    {
      id: 'freed',
      header: t('insights.pitch.right.col.freed'),
      cell: (row) => format.number(row.pitchHoursFreed, 2),
      sortValue: (row) => row.pitchHoursFreed,
      align: 'right',
    },
  ];
  return (
    <section aria-labelledby="right-title" className="flex flex-col gap-3">
      <h2 id="right-title" className="text-[22px] font-semibold text-ink">
        {t('insights.pitch.right.title')}
      </h2>
      <p className="max-w-prose text-[15px] text-ink">{t('insights.pitch.right.intro')}</p>
      {sessions.length === 0 ? (
        <EmptyState
          icon={<CircleCheck />}
          title={t('insights.pitch.right.none.title')}
          body={t('insights.pitch.right.none.body')}
        />
      ) : (
        <>
          <DataTable
            caption={t('insights.pitch.right.caption')}
            columns={columns}
            rows={sessions}
            getRowId={(row) => row.sessionId}
            initialSort={{ columnId: 'date', direction: 'desc' }}
          />
          <CardTitle as="h3">
            {t('insights.pitch.right.total', { hours: format.number(pitchHoursFreed, 2) })}
          </CardTitle>
        </>
      )}
    </section>
  );
}

function PitchBody({ input }: { readonly input: PitchInput }) {
  const { t } = useTranslation();
  const format = useFormatter();
  const { sessions, attendance, factors } = input;
  const model = useMemo(
    () => buildPitchModel({ sessions, attendance, factors }),
    [sessions, attendance, factors],
  );
  if (model.sessionCount === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={<CalendarX2 />}
          title={t('insights.pitch.empty.title')}
          body={t('insights.pitch.empty.body')}
          action={<LinkButton to="/training">{t('insights.pitch.empty.action')}</LinkButton>}
        />
        {model.withoutAttendance > 0 && (
          <p className="text-[13px] text-ink-soft">
            {t('insights.pitch.withoutAttendance', { count: model.withoutAttendance })}
          </p>
        )}
      </div>
    );
  }
  return (
    <Reveal>
      <div className="flex flex-col gap-8">
        <UseStats model={model} format={format} />
        <Estimates model={model} format={format} />
        <RightSizing model={model} format={format} />
        {model.withoutAttendance > 0 && (
          <p className="text-[13px] text-ink-soft">
            {t('insights.pitch.withoutAttendance', { count: model.withoutAttendance })}
          </p>
        )}
      </div>
    </Reveal>
  );
}

/** Pitch use: how much pitch was booked, how it was filled, and what the lights roughly cost. */
export function PitchView() {
  const source = usePitchSource();
  return <SourceView source={source}>{(input) => <PitchBody input={input} />}</SourceView>;
}
