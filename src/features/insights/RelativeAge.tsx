import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MIN_PLAYERS, type QuarterShares, type RelativeAgeVerdict } from '../../engine/relativeAge';
import { Card, EmptyState, LinkButton, Pill, type PillTone } from '../../ui';
import { BarChart, type Bar } from './BarChart';
import { useFormatter, type Formatter } from './format';
import type { RelativeAgeSummary } from './models';

const QUARTERS = [1, 2, 3, 4] as const;
const VERDICT_TONE: Readonly<Record<RelativeAgeVerdict, PillTone>> = {
  too_few: 'mute',
  consistent_with_even: 'mute',
  leans_older: 'amber',
  strongly_older: 'amber',
};

interface ChartProps {
  readonly title: string;
  readonly shares: QuarterShares;
  readonly expected: QuarterShares;
  readonly max: number;
  readonly format: Formatter;
}

function QuarterChart({ title, shares, expected, max, format }: ChartProps) {
  const { t } = useTranslation();
  const bars: Bar[] = QUARTERS.map((quarter, index) => ({
    key: String(quarter),
    label: t('insights.age.quarterShort', { quarter }),
    value: shares[index] ?? 0,
    valueText: format.percent(shares[index] ?? 0),
    reference: expected[index] ?? 0,
  }));
  const items = QUARTERS.map((quarter, index) =>
    t('insights.age.chartItem', {
      quarter: t('insights.age.quarterShort', { quarter }),
      share: format.percent(shares[index] ?? 0),
      expected: format.percent(expected[index] ?? 0),
    }),
  ).join('; ');
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-[15px] font-semibold text-ink">{title}</figcaption>
      <BarChart
        bars={bars}
        max={max}
        description={t('insights.age.chartLabel', { title, items })}
      />
    </figure>
  );
}

/** A p-value to three decimals; below that "<0.001", which reads the same in both languages. */
function pText(value: number, format: Formatter): string {
  return value < 0.001 ? '<0.001' : format.number(value, 3);
}

type ReadySummary = Extract<RelativeAgeSummary, { status: 'ready' }>;

function Ready({ summary }: { readonly summary: ReadySummary }) {
  const { t } = useTranslation();
  const format = useFormatter();
  const { result, minuteShares } = summary;
  const max = Math.max(...result.observedShares, ...result.expectedShares, ...(minuteShares ?? []));
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-2">
        <div>
          <Pill tone={VERDICT_TONE[result.verdict]}>
            {t(`insights.age.verdict.${result.verdict}.title`)}
          </Pill>
        </div>
        <p className="max-w-prose text-[15px] text-ink">
          {t(`insights.age.verdict.${result.verdict}.body`)}
        </p>
        <p className="max-w-prose text-[15px] text-ink-soft">{t('insights.age.caveat')}</p>
        <p className="text-[13px] text-ink-soft">
          {t('insights.age.details', {
            q1: format.percent(result.q1Share),
            expected: format.percent(result.expectedShares[0]),
            probability: format.percent(result.probabilityQ1Overrepresented),
          })}{' '}
          {result.pValue === null
            ? t('insights.age.pSkipped')
            : t('insights.age.pValue', { p: pText(result.pValue, format) })}
        </p>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <QuarterChart
          title={t('insights.age.squadChart')}
          shares={result.observedShares}
          expected={result.expectedShares}
          max={max}
          format={format}
        />
        {minuteShares === null ? (
          <p className="self-center text-[15px] text-ink-soft">{t('insights.age.noMinutes')}</p>
        ) : (
          <QuarterChart
            title={t('insights.age.minutesChart')}
            shares={minuteShares}
            expected={result.expectedShares}
            max={max}
            format={format}
          />
        )}
      </div>
      <p className="max-w-prose text-[13px] text-ink-soft">
        {t('insights.age.basis', { known: summary.known })}
        {summary.unknown > 0 && ` ${t('insights.age.unknown', { count: summary.unknown })}`}
      </p>
      <p className="max-w-prose text-[13px] text-ink-soft">{t('insights.age.legend')}</p>
    </div>
  );
}

/** Whether a squad's birth quarters lean towards the oldest children. A group, never a child. */
export function RelativeAge({ summary }: { readonly summary: RelativeAgeSummary }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="age-title" className="flex flex-col gap-3">
      <h2 id="age-title" className="text-[22px] font-semibold text-ink">
        {t('insights.age.title')}
      </h2>
      <p className="max-w-prose text-[15px] text-ink">{t('insights.age.intro')}</p>
      {summary.status === 'ready' ? (
        <Ready summary={summary} />
      ) : (
        <EmptyState
          icon={<Users />}
          title={t('insights.age.needsMore.title')}
          body={t('insights.age.needsMore.body', { needed: MIN_PLAYERS, known: summary.known })}
          action={
            <LinkButton to="/club/squad" variant="secondary">
              {t('insights.age.needsMore.action')}
            </LinkButton>
          }
        />
      )}
    </section>
  );
}
