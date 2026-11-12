import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardTitle } from '../../ui';

const LIMITS = ['camera', 'depth', 'speed', 'ball', 'verdict'] as const;

/** What one phone camera can and cannot tell. Always shown with a result. */
export function LimitsNote() {
  const { t } = useTranslation();
  return (
    <Card
      as="section"
      aria-labelledby="shotlab-limits-title"
      className="flex flex-col gap-2 bg-mute-soft"
    >
      <div className="flex items-center gap-2">
        <Info aria-hidden="true" size={18} className="text-ink-soft" />
        <CardTitle as="h2">
          <span id="shotlab-limits-title">{t('shotlab.limits.title')}</span>
        </CardTitle>
      </div>
      <ul className="list-disc pl-5 text-[15px] text-ink-soft">
        {LIMITS.map((key) => (
          <li key={key}>{t(`shotlab.limits.${key}`)}</li>
        ))}
      </ul>
    </Card>
  );
}
