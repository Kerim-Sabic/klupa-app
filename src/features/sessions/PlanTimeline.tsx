import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BlockReason, SessionBlock } from '../../engine';
import { Pill, Sheet, type PillTone } from '../../ui';
import { DrillDetails } from './DrillDetails';
import { blockRanges, findDrill, formatEstimate, localized } from './format';

const REASON_TONE: Record<BlockReason, PillTone> = {
  MATCHES_FOCUS: 'pitch',
  OTHER_FOCUS: 'amber',
  FITS_PLAYERS: 'mute',
  FITS_SPACE: 'mute',
  MOST_REPS: 'mute',
};

export interface PlanTimelineProps {
  readonly blocks: readonly SessionBlock[];
}

/** The session as a vertical timeline. Each block opens the drill's full description. */
export function PlanTimeline({ blocks }: PlanTimelineProps) {
  const { t, i18n } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const ranges = blockRanges(blocks.map((block) => block.minutes));
  const openBlock = openIndex === null ? undefined : blocks[openIndex];
  const openDrill = openBlock === undefined ? undefined : findDrill(openBlock.drillKey);

  return (
    <>
      <ol className="flex flex-col">
        {blocks.map((block, index) => {
          const drill = findDrill(block.drillKey);
          const range = ranges[index];
          if (drill === undefined || range === undefined) return null;
          const name = localized(drill.name, i18n.language);
          const phase = t(`sessions.phase.${block.phase}`);
          const last = index === blocks.length - 1;
          return (
            <li key={`${String(index)}-${block.drillKey}`} className="flex gap-3">
              <div aria-hidden="true" className="flex flex-col items-center pt-5">
                <span className="size-3 shrink-0 rounded-full border-2 border-pitch bg-raised" />
                {!last && <span className="mt-1 w-px flex-1 bg-line" />}
              </div>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={t('sessions.planner.openBlock', {
                  phase,
                  name,
                  minutes: block.minutes,
                })}
                onClick={() => {
                  setOpenIndex(index);
                }}
                className="group mb-3 flex min-h-11 w-full min-w-0 flex-1 items-start gap-3 rounded-card border border-line bg-raised p-4 text-left transition-[transform,border-color] duration-120 ease-touch hover:border-mute active:scale-[0.99]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-[13px] font-semibold text-ink-soft">{phase}</span>
                    <span className="text-[13px] font-semibold text-ink-soft tabular-nums">
                      {t('sessions.planner.range', { from: range.from, to: range.to })}
                    </span>
                  </span>
                  <span className="text-[17px] leading-snug font-semibold text-ink">{name}</span>
                  <span className="text-[15px] text-ink-soft tabular-nums">
                    {t('sessions.planner.attempts', {
                      reps: formatEstimate(block.expectedRepsPerPlayer),
                    })}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {block.reasons.map((reason) => (
                      <Pill key={reason} tone={REASON_TONE[reason]}>
                        {t(`sessions.reason.${reason}`)}
                      </Pill>
                    ))}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  size={20}
                  className="mt-0.5 shrink-0 text-mute transition-transform duration-120 ease-touch group-hover:translate-x-0.5"
                />
              </button>
            </li>
          );
        })}
      </ol>
      <Sheet
        open={openBlock !== undefined && openDrill !== undefined}
        onClose={() => {
          setOpenIndex(null);
        }}
        title={openDrill === undefined ? '' : localized(openDrill.name, i18n.language)}
      >
        {openDrill !== undefined && <DrillDetails drill={openDrill} />}
      </Sheet>
    </>
  );
}
