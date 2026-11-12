import { useQuery } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/dates';
import { Card, ErrorNotice, LargeTitle, Pill, Skeleton, type PillTone } from '../../ui';
import { PublicLayout } from '../PublicLayout';
import {
  SPEED_MEASURES,
  fetchStatus,
  rate,
  speedOf,
  type FieldNumbers,
  type Rating,
  type ServiceCheck,
  type SpeedMeasure,
  type StatusReport,
} from './statusModel';

const REFRESH_MS = 30_000;
const RATING_TONE: Record<Rating, PillTone> = { good: 'pitch', fair: 'amber', poor: 'clay' };

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-headline font-semibold text-ink">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-hairline pt-3 first:border-t-0 first:pt-0">
      <dt className="text-ink">{label}</dt>
      <dd className="flex items-center gap-2 text-right tabular-nums">{children}</dd>
    </div>
  );
}

function Service({ label, check }: { readonly label: string; readonly check: ServiceCheck }) {
  const { t } = useTranslation();
  return (
    <Row label={label}>
      <span className="text-footnote text-ink-soft">
        {check.ok
          ? t('status.services.up', { ms: check.ms })
          : t('status.services.down', {
              reason: t(`status.services.reason.${check.failure ?? 'unreachable'}`),
            })}
      </span>
      <Pill tone={check.ok ? 'pitch' : 'clay'}>
        {t(check.ok ? 'status.services.ok' : 'status.services.notOk')}
      </Pill>
    </Row>
  );
}

function formatSpeed(measure: SpeedMeasure, value: number, language: string): string {
  if (measure === 'cls') {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  }
  if (measure === 'lcp') {
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value / 1000)} s`;
  }
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value)} ms`;
}

function Field({ field }: { readonly field: FieldNumbers }) {
  const { t, i18n } = useTranslation();
  const count = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const speed = speedOf(field.pages7d);
  return (
    <>
      <Section title={t('status.errors.title')}>
        <dl className="flex flex-col gap-3">
          <Row label={t('status.errors.hour')}>
            <span className="font-display text-[22px] text-ink">{count(field.errors1h)}</span>
          </Row>
          <Row label={t('status.errors.day')}>
            <span className="text-footnote text-ink-soft">
              {t('status.errors.kinds', { kinds: count(field.errorKinds24h) })}
            </span>
            <span className="font-display text-[22px] text-ink">{count(field.errors24h)}</span>
          </Row>
        </dl>
        <p className="text-footnote text-ink-soft">{t('status.errors.note')}</p>
      </Section>

      <Section title={t('status.speed.title')}>
        {field.pages7d.samples === 0 ? (
          <p className="text-ink-soft">{t('status.speed.none')}</p>
        ) : (
          <>
            <dl className="flex flex-col gap-3">
              {SPEED_MEASURES.map((measure) => {
                const value = speed[measure];
                return (
                  <Row key={measure} label={t(`status.speed.${measure}`)}>
                    {value === null ? (
                      <span className="text-footnote text-ink-soft">
                        {t('status.speed.unmeasured')}
                      </span>
                    ) : (
                      <>
                        <span className="font-display text-[22px] text-ink">
                          {formatSpeed(measure, value, i18n.language)}
                        </span>
                        <Pill tone={RATING_TONE[rate(measure, value)]}>
                          {t(`status.speed.rating.${rate(measure, value)}`)}
                        </Pill>
                      </>
                    )}
                  </Row>
                );
              })}
            </dl>
            <p className="text-footnote text-ink-soft">
              {t('status.speed.note', { samples: count(field.pages7d.samples) })}
            </p>
          </>
        )}
      </Section>
    </>
  );
}

function Body({ report }: { readonly report: StatusReport }) {
  const { t, i18n } = useTranslation();
  const ok = report.status === 'ok';
  // Not `Intl` directly: some browsers accept the Bosnian locale and print "2026 M11 12".
  const checked = formatDate(report.checkedAt, i18n.language, 'dateTime');
  return (
    <div className="flex flex-col gap-4">
      <p
        role="status"
        className={`flex items-center gap-3 rounded-card px-4 py-3 font-semibold text-ink ${ok ? 'bg-pitch-soft' : 'bg-clay-soft'}`}
      >
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-full ${ok ? 'bg-pitch' : 'bg-clay'}`}
        />
        {t(`status.overall.${report.status}`)}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('status.services.title')}>
          <dl className="flex flex-col gap-3">
            <Service label={t('status.services.database')} check={report.checks.database} />
            <Service label={t('status.services.auth')} check={report.checks.auth} />
          </dl>
        </Section>
        {report.field === undefined || report.field === null ? (
          <Section title={t('status.errors.title')}>
            <p className="text-ink-soft">{t('status.noPulse')}</p>
          </Section>
        ) : (
          <Field field={report.field} />
        )}
      </div>
      <p className="text-footnote text-ink-soft">
        {t('status.footer', {
          commit: report.commit === null ? t('status.unknownRelease') : report.commit.slice(0, 7),
          time: checked,
        })}
      </p>
    </div>
  );
}

/**
 * Public page: how the live service is doing right now, measured by the service itself. It
 * reads the same endpoint the monitor reads, so what a coach sees here is what would raise
 * the alarm.
 */
export function StatusPage() {
  const { t } = useTranslation();
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => fetchStatus(),
    refetchInterval: REFRESH_MS,
  });
  return (
    <PublicLayout>
      <div className="flex flex-col gap-6">
        <LargeTitle title={t('status.title')} subtitle={t('status.subtitle')} />
        {status.isPending && (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{t('status.loading')}</span>
            <Skeleton className="h-12 w-full rounded-card" />
            <Skeleton className="h-40 w-full rounded-card" />
          </div>
        )}
        {status.isError && status.data === undefined && (
          <ErrorNotice
            title={t('status.failed.title')}
            body={t('status.failed.body')}
            onRetry={() => {
              void status.refetch();
            }}
          />
        )}
        {status.data !== undefined && <Body report={status.data} />}
      </div>
    </PublicLayout>
  );
}
