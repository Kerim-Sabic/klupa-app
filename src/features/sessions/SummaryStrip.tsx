import { useTranslation } from 'react-i18next';
import { Card, Stat } from '../../ui';
import { formatOneDecimal } from './format';
import type { SessionSummaryNumbers } from './summary';

/** Four numbers a coach can take in at a glance, including who has not been watched yet. */
export function SummaryStrip({ summary }: { readonly summary: SessionSummaryNumbers }) {
  const { t, i18n } = useTranslation();
  return (
    <Card as="section" aria-label={t('sessions.summary.title')}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <Stat
          label={t('sessions.summary.present')}
          value={summary.present}
          hint={t('sessions.summary.ofExpected', { expected: summary.expected })}
        />
        <Stat
          label={t('sessions.summary.effort')}
          value={summary.averageEffort ?? 0}
          format={(value) =>
            summary.averageEffort === null ? '–' : formatOneDecimal(value, i18n.language)
          }
          hint={t('sessions.summary.rated', { rated: summary.ratedCount })}
        />
        <Stat label={t('sessions.summary.attempts')} value={summary.totalAttempts} />
        <Stat
          label={t('sessions.summary.notObserved')}
          value={summary.notObserved}
          hint={t('sessions.summary.notObservedHint')}
        />
      </div>
    </Card>
  );
}
