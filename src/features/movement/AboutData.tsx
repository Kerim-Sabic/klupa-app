import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardTitle } from '../../ui';

const POINTS = ['match', 'grassroots', 'space', 'sampling', 'anonymous'] as const;
const DATASET_URL = 'https://doi.org/10.6084/m9.figshare.28196177.v1';
const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** What this screen is and is not, in plain words, with the attribution CC BY 4.0 asks for. */
export function AboutData() {
  const { t } = useTranslation();
  return (
    <Card
      as="section"
      aria-labelledby="movement-about-title"
      className="flex flex-col gap-3 bg-mute-soft"
    >
      <div className="flex items-center gap-2">
        <Info aria-hidden="true" size={18} className="text-ink-soft" />
        <CardTitle as="h2">
          <span id="movement-about-title">{t('movement.about.title')}</span>
        </CardTitle>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-ink-soft">
        {POINTS.map((key) => (
          <li key={key}>{t(`movement.about.${key}`)}</li>
        ))}
      </ul>
      <h3 className="pt-1 font-semibold text-ink">{t('movement.about.sourceTitle')}</h3>
      <p className="text-[13px] text-ink-soft">{t('movement.about.citation')}</p>
      <p className="text-[13px] text-ink-soft">{t('movement.about.licence')}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
        <a
          className="text-pitch underline-offset-2 hover:underline"
          href={DATASET_URL}
          rel="noreferrer"
          target="_blank"
        >
          {t('movement.about.doiLink')}
        </a>
        <a
          className="text-pitch underline-offset-2 hover:underline"
          href={LICENCE_URL}
          rel="noreferrer"
          target="_blank"
        >
          {t('movement.about.licenceLink')}
        </a>
      </p>
    </Card>
  );
}
