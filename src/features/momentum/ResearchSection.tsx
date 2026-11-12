import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardTitle, Stat } from '../../ui';
import { formatCount, formatDecimal, formatPercent } from './chartModel';
import { CompetitionChart } from './CompetitionChart';
import {
  REJECTED_FORECASTER,
  competitionBars,
  headline,
  pilotContext,
  reliabilityBins,
  xgMetrics,
  xgTrainingFacts,
} from './researchModel';
import { ReliabilityChart } from './ReliabilityChart';

const SOURCES = [
  { key: 'dfl', href: 'https://doi.org/10.6084/m9.figshare.28196177.v1' },
  { key: 'wyscout', href: 'https://doi.org/10.6084/m9.figshare.c.4415000.v5' },
] as const;

/** The study behind the lab, every number read from the research result files. */
export function ResearchSection() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const top = headline();
  const pilot = pilotContext();
  const facts = xgTrainingFacts();
  const percent = (share: number) => formatPercent(share, language, 1);
  const count = (value: number) => formatCount(value, language);

  return (
    <section aria-labelledby="research-title" className="flex flex-col gap-4">
      <div>
        <h2 id="research-title" className="font-display text-[30px] text-ink">
          {t('lab.research.title')}
        </h2>
        <p className="mt-1.5 max-w-prose text-ink-soft">{t('lab.research.intro')}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        <Card as="li">
          <Stat
            label={t('lab.research.matchesLabel')}
            value={top.matches}
            format={count}
            hint={t('lab.research.matchesHint', {
              moments: count(top.gridPoints),
              step: top.gridStepSeconds,
            })}
          />
        </Card>
        <Card as="li">
          <Stat
            label={t('lab.research.opposedLabel')}
            value={top.opposedShare}
            format={percent}
            tone="clay"
            hint={t('lab.research.opposedHint', { moments: count(top.bothNonZero) })}
          />
        </Card>
        <Card as="li">
          <Stat
            label={t('lab.research.robustLabel')}
            value={top.robustShare}
            format={percent}
            tone="pitch"
            hint={t('lab.research.robustHint', { agreed: percent(top.agreementShare) })}
          />
        </Card>
      </ul>

      <Card as="section">
        <CardTitle as="h3">{t('lab.research.byCompetitionTitle')}</CardTitle>
        <p className="mt-1 text-[13px] text-ink-soft">{t('lab.research.byCompetitionNote')}</p>
        <div className="mt-3">
          <CompetitionChart
            bars={competitionBars()}
            pooled={top.opposedShare}
            pilot={pilot.share}
            label={t('lab.research.byCompetitionLabel', {
              pooled: percent(top.opposedShare),
              pilot: percent(pilot.share),
            })}
          />
        </div>
        <p className="mt-3 max-w-prose text-[15px] text-ink-soft">
          {t('lab.research.pilotNote', {
            pilot: percent(pilot.share),
            matches: pilot.matches,
            pooled: percent(top.opposedShare),
            draws: count(pilot.draws),
            low: percent(pilot.low),
            high: percent(pilot.high),
            tail: percent(pilot.tail),
          })}
        </p>
      </Card>

      <Card as="section">
        <CardTitle as="h3">{t('lab.research.xgTitle')}</CardTitle>
        <p className="mt-1 max-w-prose text-[15px] text-ink-soft">
          {t('lab.research.xgIntro', {
            shots: count(facts.shots),
            goals: count(facts.goals),
            matches: count(facts.matches),
            folds: facts.folds,
          })}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full max-w-md text-left text-[15px] tabular-nums">
            <caption className="sr-only">{t('lab.research.metricsCaption')}</caption>
            <thead className="text-[13px] text-ink-soft">
              <tr className="border-b border-line">
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only">{t('lab.research.modelHeader')}</span>
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  {t('lab.research.logLoss')}
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  {t('lab.research.brier')}
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  {t('lab.research.auc')}
                </th>
              </tr>
            </thead>
            <tbody>
              {xgMetrics().map((row) => (
                <tr key={row.key} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 font-semibold text-ink">
                    {t(`lab.research.${row.key}`)}
                  </th>
                  <td className="py-2 text-right">{formatDecimal(row.logLoss, 4, language)}</td>
                  <td className="py-2 text-right">{formatDecimal(row.brier, 4, language)}</td>
                  <td className="py-2 text-right">{formatDecimal(row.auc, 3, language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[13px] text-ink-soft">{t('lab.research.metricsNote')}</p>
        </div>
        <h4 className="mt-5 text-[15px] font-semibold text-ink">
          {t('lab.research.reliabilityTitle')}
        </h4>
        <div className="mt-2">
          <ReliabilityChart
            bins={reliabilityBins()}
            label={t('lab.research.reliabilityLabel', {
              bins: reliabilityBins().length,
              ece: formatDecimal(facts.ece, 4, language),
            })}
          />
        </div>
        <p className="mt-3 max-w-prose text-[15px] text-ink-soft">{t('lab.research.limits')}</p>
      </Card>

      <Card as="section">
        <CardTitle as="h3">{t('lab.research.rejectedTitle')}</CardTitle>
        <p className="mt-1 max-w-prose text-[15px] text-ink-soft">
          {t('lab.research.rejected', {
            recency: formatDecimal(REJECTED_FORECASTER.recencyLogLoss, 4, language),
            withLeader: formatDecimal(REJECTED_FORECASTER.withXgLeaderLogLoss, 4, language),
          })}
        </p>
      </Card>

      <Card as="section">
        <CardTitle as="h3">{t('lab.research.sourcesTitle')}</CardTitle>
        <ul className="mt-2 flex flex-col gap-2 text-[15px]">
          {SOURCES.map((source) => (
            <li key={source.key}>
              <a
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
              >
                {t(`lab.research.source.${source.key}`)}
                <ExternalLink aria-hidden="true" size={14} />
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
