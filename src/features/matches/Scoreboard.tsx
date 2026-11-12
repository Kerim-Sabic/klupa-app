import { CircleCheck, CloudOff, CloudUpload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Pill } from '../../ui';
import { formatClock, type ClockPhase } from './clock';
import type { Score } from './score';

export interface ScoreboardProps {
  readonly opponent: string;
  readonly score: Score;
  readonly period: number;
  readonly periodCount: number;
  readonly phase: ClockPhase;
  readonly seconds: number;
  readonly waiting: number;
  readonly online: boolean;
}

/** A score digit that rises in when it changes. */
function Tick({ value }: { value: number }) {
  return (
    <span className="relative inline-grid overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={{ y: '-60%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '60%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** On a phone the chip is its colour, its icon and a count; the words stay for screen readers. */
const CHIP_TEXT = 'max-md:sr-only';

function ChipCount({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="tabular-nums md:hidden">
      {n}
    </span>
  );
}

export function SyncChip({ waiting, online }: { waiting: number; online: boolean }) {
  const { t } = useTranslation();
  if (!online) {
    return (
      <Pill tone="clay">
        <CloudOff aria-hidden="true" size={14} />
        <span className={CHIP_TEXT}>
          {waiting > 0
            ? t('matches.sync.offlineWaiting', { n: waiting })
            : t('matches.sync.offline')}
        </span>
        {waiting > 0 && <ChipCount n={waiting} />}
      </Pill>
    );
  }
  if (waiting > 0) {
    return (
      <Pill tone="amber">
        <CloudUpload aria-hidden="true" size={14} />
        <span className={CHIP_TEXT}>{t('matches.sync.waiting', { n: waiting })}</span>
        <ChipCount n={waiting} />
      </Pill>
    );
  }
  return (
    <Pill tone="pitch">
      <CircleCheck aria-hidden="true" size={14} />
      <span className={CHIP_TEXT}>{t('matches.sync.saved')}</span>
    </Pill>
  );
}

/** Score, period and clock in scoreboard type, plus whether everything has reached the server. */
export function Scoreboard(props: ScoreboardProps) {
  const { opponent, score, period, periodCount, phase, seconds, waiting, online } = props;
  const { t } = useTranslation();
  const periodText =
    phase === 'before'
      ? t('matches.tagger.beforeKickOff')
      : t(periodCount === 2 ? 'matches.tagger.periodHalf' : 'matches.tagger.periodPart', {
          number: period,
        });

  return (
    <section aria-label={t('matches.tagger.score')} className="flex items-center gap-3 md:gap-4">
      <div className="min-w-0 flex-1">
        <p className="sr-only" aria-live="polite">
          {t('matches.tagger.scoreValue', { home: score.home, away: score.away, opponent })}
        </p>
        <div aria-hidden="true" className="flex items-end gap-3">
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-ink-soft">
              {t('matches.tagger.us')}
            </span>
            <span className="font-score text-[42px] md:text-[60px]">
              <Tick value={score.home} />
            </span>
          </div>
          <span className="pb-0.5 font-display text-[26px] leading-none text-ink-soft md:pb-1 md:text-[30px]">
            –
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-ink-soft">{opponent}</span>
            <span className="font-score text-[42px] md:text-[60px]">
              <Tick value={score.away} />
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 md:gap-1.5">
        {/* Phone: period and sync share a line above the clock. Wider: three stacked lines. */}
        <div className="flex items-center gap-2 md:contents">
          <span className="text-[13px] font-semibold text-ink-soft">{periodText}</span>
          <span className="inline-flex md:order-last">
            <SyncChip waiting={waiting} online={online} />
          </span>
        </div>
        <span
          role="timer"
          aria-label={t('matches.tagger.clockLabel')}
          className="font-score text-[34px] tabular-nums md:text-[44px]"
        >
          {formatClock(seconds)}
        </span>
      </div>
    </section>
  );
}
