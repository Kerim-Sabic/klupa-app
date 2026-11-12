import { Eye, Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Measurement } from '../../engine/pose';
import { Button, Card, Pill, RevealList } from '../../ui';
import { formatMeasurement } from './format';
import type { CoachingPrompt } from './prompts';

export interface MeasurementListProps {
  readonly measurements: readonly Measurement[];
  readonly prompts: readonly CoachingPrompt[];
  readonly onShowFrame: (frame: number) => void;
}

/**
 * One card per measurement: the number with its unit, what it is, and, when it stands
 * out, a prompt phrased as something to look at. The number is always shown, so a coach
 * who sees it differently on the video can disagree.
 */
export function MeasurementList({ measurements, prompts, onShowFrame }: MeasurementListProps) {
  const { t, i18n } = useTranslation();
  return (
    <RevealList as="ul" className="grid gap-3 sm:grid-cols-2">
      {measurements.map((m) => {
        const raised = prompts.filter((p) => p.measurement === m.id);
        const frame = m.frames[m.frames.length - 1] ?? 0;
        return (
          <Card as="li" key={m.id} className="flex h-full flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-ink">{t(`shotlab.m.${m.id}.title`)}</h3>
              {m.reliesOnDepth && <Pill tone="mute">{t('shotlab.m.depth')}</Pill>}
            </div>
            <p className="font-display text-[30px] text-ink">
              {formatMeasurement(m, i18n.language)}
              <span
                className={
                  m.unit === 'deg' ? 'text-[17px] text-ink-soft' : 'ml-1 text-[17px] text-ink-soft'
                }
              >
                {t(`shotlab.unit.${m.unit}`)}
              </span>
            </p>
            <p className="text-[15px] text-ink-soft">{t(`shotlab.m.${m.id}.what`)}</p>
            {raised.map((p) => (
              <p
                key={p.id}
                className="flex gap-2 rounded-control bg-amber-soft p-3 text-[15px] text-ink"
              >
                <Lightbulb aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-amber" />
                <span>
                  <span className="font-semibold">{t('shotlab.m.lookAt')} </span>
                  {t(`shotlab.prompt.${p.id}`)}
                </span>
              </p>
            ))}
            <div className="mt-auto pt-1">
              <Button
                variant="ghost"
                icon={<Eye />}
                onClick={() => {
                  onShowFrame(frame);
                }}
                aria-label={t('shotlab.m.showFrameLabel', {
                  name: t(`shotlab.m.${m.id}.title`),
                  frame: frame + 1,
                })}
              >
                {t('shotlab.m.showFrame', { frame: frame + 1 })}
              </Button>
            </div>
          </Card>
        );
      })}
    </RevealList>
  );
}
