import { useTranslation } from 'react-i18next';
import { Card } from '../../ui';
import { formatNumber } from './format';
import { fasterFoot, type LiveNumbers } from './liveModel';

export interface LiveReadoutProps {
  readonly numbers: LiveNumbers;
  readonly tracking: boolean;
}

/**
 * A few numbers that change about ten times a second. Fixed rows and fixed-width,
 * tabular values, so nothing moves while the numbers do.
 */
export function LiveReadout({ numbers, tracking }: LiveReadoutProps) {
  const { t, i18n } = useTranslation();
  const degrees = (value: number | null) =>
    value === null ? '–' : `${formatNumber(value, 0, i18n.language)}°`;
  const foot = fasterFoot(numbers);
  // Lost tracking keeps the last values, in the softer colour, instead of jumping to zero.
  const tone = tracking ? 'text-ink' : 'text-ink-soft';
  const rows = [
    { key: 'leftKnee', value: degrees(numbers.leftKnee) },
    { key: 'rightKnee', value: degrees(numbers.rightKnee) },
    { key: 'trunkLean', value: degrees(numbers.trunkLean) },
    {
      key: 'fasterFoot',
      value: t(foot === null ? 'shotlab.live.readout.neither' : `shotlab.live.readout.${foot}`),
      word: true,
    },
  ];
  return (
    <Card as="section" aria-labelledby="shotlab-live-readout" className="flex flex-col gap-3">
      <h2 id="shotlab-live-readout" className="text-[17px] font-semibold text-ink">
        {t('shotlab.live.readout.title')}
      </h2>
      <dl className="grid gap-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex min-h-8 items-baseline justify-between gap-3 border-b border-line pb-2 last:border-b-0"
          >
            <dt className="text-[15px] text-ink-soft">{t(`shotlab.live.readout.${row.key}`)}</dt>
            <dd
              className={
                row.word === true
                  ? `text-right text-[17px] font-semibold ${tone}`
                  : `font-display min-w-[6ch] text-right text-[22px] tabular-nums ${tone}`
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] text-ink-soft">{t('shotlab.live.readout.note')}</p>
    </Card>
  );
}
