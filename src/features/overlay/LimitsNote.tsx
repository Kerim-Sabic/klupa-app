import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardTitle } from '../../ui';

const LIMITS = ['position', 'small', 'numbers', 'crowd', 'kits', 'tested'] as const;

/** What a picture without a calibrated pitch can and cannot tell. Always on the page. */
export function LimitsNote() {
  const { t } = useTranslation();
  return (
    <Card
      as="section"
      aria-labelledby="overlay-limits-title"
      className="flex flex-col gap-2 bg-mute-soft"
    >
      <div className="flex items-center gap-2">
        <Info aria-hidden="true" size={18} className="text-ink-soft" />
        <CardTitle as="h2">
          <span id="overlay-limits-title">{t('overlay.limits.title')}</span>
        </CardTitle>
      </div>
      <ul className="list-disc pl-5 text-[15px] text-ink-soft">
        {LIMITS.map((key) => (
          <li key={key}>{t(`overlay.limits.${key}`)}</li>
        ))}
      </ul>
    </Card>
  );
}
