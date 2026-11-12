import { useTranslation } from 'react-i18next';
import type { ProIndex } from '../../engine/pro';
import { Card } from '../../ui';

/** Where the numbers come from, under what licence, and what they cannot say. */
export function SourceCard({ source }: { readonly source: ProIndex['source'] }) {
  const { t } = useTranslation();
  const doi = `https://doi.org/${source.doi}`;
  return (
    <Card className="flex flex-col gap-3 text-[15px] text-ink-soft">
      <p>
        {t('pro.source.data', { name: source.name, licence: source.licence })}{' '}
        <a
          href={doi}
          className="font-semibold break-all text-pitch underline-offset-2 hover:underline"
        >
          {`doi:${source.doi}`}
        </a>
      </p>
      <p>{t('pro.source.changes')}</p>
      <p>{t('pro.source.limitPositions')}</p>
      <p>{t('pro.source.limitModel')}</p>
    </Card>
  );
}
