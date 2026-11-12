import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { demoMatches } from '../../data/dfl';
import { SelectField } from '../../ui';
import { MomentumExplorer } from './MomentumExplorer';
import { ResearchSection } from './ResearchSection';
import type { ShotMark } from './TimelineChart';

/**
 * The public evidence page: the research first, then the same explorer coaches use,
 * on professional matches with provider xG.
 */
export function MomentumLab() {
  const { t } = useTranslation();
  const [matchIndex, setMatchIndex] = useState(0);
  const [periodNumber, setPeriodNumber] = useState(1);

  const match = demoMatches[matchIndex] ?? demoMatches[0];
  const period =
    match?.periods.find((candidate) => candidate.period === periodNumber) ?? match?.periods[0];
  const marks = useMemo<ShotMark[]>(
    () =>
      (match?.events ?? [])
        .filter((event) => event.period === period?.period)
        .map((event) => ({ ...event, goal: false })),
    [match, period],
  );
  const sideNames = { home: t('side.home'), away: t('side.away') };

  return (
    <article className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-[30px] text-balance text-ink sm:text-[44px]">
          {t('lab.title')}
        </h1>
        <p className="mt-2 max-w-prose text-[17px] text-ink-soft">{t('lab.intro')}</p>
      </header>

      <ResearchSection />

      {match !== undefined && period !== undefined && (
        <section aria-labelledby="lab-explorer-title" className="flex flex-col gap-4">
          <div>
            <h2 id="lab-explorer-title" className="font-display text-[30px] text-ink">
              {t('lab.explorerTitle')}
            </h2>
            <p className="mt-1.5 max-w-prose text-ink-soft">{t('lab.explorerIntro')}</p>
          </div>
          <MomentumExplorer
            events={match.events}
            marks={marks}
            period={period.period}
            durationSeconds={period.durationSeconds}
            sideNames={sideNames}
            resetKey={`${match.id}:${String(period.period)}`}
            controls={
              <div className="grid grid-cols-2 gap-3">
                <SelectField
                  label={t('lab.match')}
                  value={String(matchIndex)}
                  onChange={(value) => {
                    setMatchIndex(Number(value));
                  }}
                  options={demoMatches.map((candidate, index) => ({
                    value: String(index),
                    label: t('lab.matchOption', { number: index + 1, id: candidate.id }),
                  }))}
                />
                <SelectField
                  label={t('lab.period')}
                  value={String(period.period)}
                  onChange={(value) => {
                    setPeriodNumber(Number(value));
                  }}
                  options={match.periods.map((candidate) => ({
                    value: String(candidate.period),
                    label: t('lab.periodOption', { number: candidate.period }),
                  }))}
                />
              </div>
            }
          />
          <p className="max-w-prose text-[13px] text-ink-soft">{t('lab.dataNote')}</p>
        </section>
      )}
    </article>
  );
}
