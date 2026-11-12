import { useTranslation } from 'react-i18next';
import { RingStack, SectionHeader, Stage, type RingDatum, type RingTone } from '../../ui';
import { formatCount, formatPercent } from './format';
import { MIN_ATTEMPTS, type RingMeasure, type TodayRings } from './model';

interface RingSpec {
  readonly key: keyof TodayRings;
  readonly tone: RingTone;
  /** The screen that explains how the measure is worked out. */
  readonly to: string;
}

const SPECS: readonly RingSpec[] = [
  { key: 'fair', tone: 'fair', to: '/fairness' },
  { key: 'observed', tone: 'seen', to: '/fairness' },
  { key: 'effort', tone: 'effort', to: '/fairness/load' },
];

/** The three measures of where the team stands, as rings with a legend that carries the words. */
export function RingsSection({ rings }: { readonly rings: TodayRings }) {
  const { t, i18n } = useTranslation();
  const datum = (spec: RingSpec, measure: RingMeasure): RingDatum => ({
    id: spec.key,
    label: t(`home.rings.${spec.key}.label`),
    value: measure.value,
    valueText:
      measure.value === null ? t('home.rings.notYet') : formatPercent(measure.value, i18n.language),
    detail:
      measure.value === null
        ? t(`home.rings.${spec.key}.empty`)
        : t(`home.rings.${spec.key}.detail`, {
            part: formatCount(measure.part, i18n.language),
            of: formatCount(measure.of, i18n.language),
            min: MIN_ATTEMPTS,
          }),
    tone: spec.tone,
    to: spec.to,
  });

  return (
    <section aria-labelledby="today-rings">
      <SectionHeader
        id="today-rings"
        title={t('home.rings.title')}
        detail={t('home.rings.detail')}
      />
      <Stage className="p-5 sm:p-7">
        <RingStack
          title={t('home.rings.figure')}
          size={136}
          rings={SPECS.map((spec) => datum(spec, rings[spec.key]))}
        />
      </Stage>
    </section>
  );
}
