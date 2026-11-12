import { Flag, Pause, Play, SkipForward, Square, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Sheet } from '../../ui';
import type { ClockPhase } from './clock';

export interface ClockControlsProps {
  readonly phase: ClockPhase;
  readonly period: number;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onEnd: () => void;
  readonly onNext: () => void;
  readonly onFinish: () => Promise<void>;
  readonly onLineup: () => void;
}

/** On a phone a secondary action keeps its icon and its name, but only the icon is drawn. */
const ICON_ONLY = 'max-md:min-w-11 max-md:px-3';
const NAME_ONLY = 'max-md:sr-only';

/**
 * The buttons that fit the moment: one primary action, the rest secondary. On a phone they
 * share one row, so the clock, the score and the tag buttons all stay on screen together.
 */
export function ClockControls(props: ClockControlsProps) {
  const { phase, period, onStart, onPause, onResume, onEnd, onNext, onFinish, onLineup } = props;
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const playing = phase === 'running' || phase === 'paused';
  // Before kick-off, picking who starts is half the job, so the lineup keeps its name.
  const lineupNamed = phase === 'before' || phase === 'over';

  async function finish() {
    setFinishing(true);
    try {
      await onFinish();
    } finally {
      setFinishing(false);
      setConfirming(false);
    }
  }

  const askFinish = () => {
    setConfirming(true);
  };

  return (
    <div role="group" aria-label={t('matches.clock.controls')} className="flex gap-2 md:flex-wrap">
      {phase === 'before' && (
        <Button icon={<Play />} onClick={onStart} className="flex-1">
          {t('matches.clock.start')}
        </Button>
      )}
      {phase === 'running' && (
        <Button icon={<Pause />} onClick={onPause} className="flex-1 max-md:px-3">
          {t('matches.clock.pause')}
        </Button>
      )}
      {phase === 'paused' && (
        <Button icon={<Play />} onClick={onResume} className="flex-1 max-md:px-3">
          {t('matches.clock.resume')}
        </Button>
      )}
      {playing && (
        <Button
          variant="secondary"
          icon={<Square />}
          onClick={onEnd}
          className="flex-1 max-md:px-3"
        >
          {t('matches.clock.end')}
        </Button>
      )}
      {phase === 'break' && (
        <Button icon={<SkipForward />} onClick={onNext} className="flex-1">
          {t('matches.clock.next', { number: period + 1 })}
        </Button>
      )}
      {phase === 'over' && (
        <Button icon={<Flag />} onClick={askFinish} className="flex-1">
          {t('matches.clock.finish')}
        </Button>
      )}
      <Button
        variant="secondary"
        icon={<Users />}
        onClick={onLineup}
        className={lineupNamed ? 'flex-1' : `md:flex-1 ${ICON_ONLY}`}
      >
        <span className={lineupNamed ? undefined : NAME_ONLY}>{t('matches.lineup.open')}</span>
      </Button>
      {phase !== 'before' && phase !== 'over' && (
        // While the ball is rolling a phone has room for three buttons; ending the period
        // brings this one back, so finishing early is two taps there instead of one.
        <Button
          variant="secondary"
          icon={<Flag />}
          onClick={askFinish}
          className={playing ? 'max-md:hidden' : ICON_ONLY}
        >
          <span className={NAME_ONLY}>{t('matches.clock.finish')}</span>
        </Button>
      )}
      <Sheet
        open={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        title={t('matches.finish.title')}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('matches.finish.cancel')}
            </Button>
            <Button
              loading={finishing}
              onClick={() => {
                void finish();
              }}
            >
              {t('matches.finish.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-ink-soft">{t('matches.finish.body')}</p>
      </Sheet>
    </div>
  );
}
