import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardTitle } from '../../ui';
import { SampleSeasonAction } from './SampleSeasonAction';
import { useSampleSeason } from './useSampleSeason';

/** Offers to fill an empty demo club with an invented season, stored in one go or not at all. */
export function SampleSeasonCard() {
  const { t } = useTranslation();
  const load = useSampleSeason();

  return (
    <Card as="section" aria-labelledby="sample-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-pitch">
        <Sparkles aria-hidden="true" size={22} />
        <CardTitle>
          <span id="sample-title">{t('club.sample.title')}</span>
        </CardTitle>
      </div>
      <p className="text-ink-soft">{t('club.sample.body')}</p>
      <SampleSeasonAction load={load} />
    </Card>
  );
}
