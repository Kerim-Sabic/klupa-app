import { Pause, Play, RotateCcw } from 'lucide-react';
import { useReducedMotionConfig } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GoalSequence, Pair } from '../../engine/pro';
import { hasWebGL } from '../movement/webgl';
import { Card, Segmented } from '../../ui';
import { ballPath, replaySeconds, surname } from './replayModel';
import { ReplayView } from './ReplayView';
import { goalLine } from './Scoreboard';

/** Progress of a replay as a pure function of time, driven by animation frames while playing. */
function useReplay(seconds: number) {
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  // Bumped to restart a run that is already playing.
  const [run, setRun] = useState(0);
  const position = useRef(1);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let origin: number | null = null;
    const from = position.current;
    const loop = (now: number) => {
      origin ??= now;
      const next = Math.min(from + (now - origin) / (seconds * 1000), 1);
      position.current = next;
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(loop);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [playing, seconds, run]);
  const restart = () => {
    position.current = 0;
    setProgress(0);
    setRun((n) => n + 1);
    setPlaying(true);
  };
  return {
    progress,
    playing,
    play: () => {
      if (position.current >= 1) restart();
      else setPlaying(true);
    },
    pause: () => {
      setPlaying(false);
    },
    replay: restart,
  };
}

/** One goal: the minute and scorer, and the build-up as the ball's route on the pitch. */
export function GoalReplay({
  sequence,
  names,
}: {
  readonly sequence: GoalSequence;
  readonly names: Pair<string>;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotionConfig() === true;
  const points = ballPath(sequence.steps);
  const replay = useReplay(replaySeconds(sequence.steps));
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const [webgl] = useState(hasWebGL);
  const team = sequence.goal.team;
  const passers = sequence.steps
    .map((step) => step.player)
    .filter((name): name is string => name !== null);
  const chain = [...new Set(passers.map(surname))].join(' → ');

  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-headline font-semibold text-ink">{goalLine(t, sequence.goal)}</h3>
          <p className={`text-footnote font-semibold ${team === 0 ? 'text-home' : 'text-away'}`}>
            {names[team]}
          </p>
        </div>
        {!reduced && points.length > 1 && (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              aria-label={t(replay.playing ? 'pro.replay.pause' : 'pro.replay.play', {
                minute: sequence.goal.minute.label,
              })}
              onClick={replay.playing ? replay.pause : replay.play}
              className="grid size-11 place-items-center rounded-full bg-ink text-on-ink transition-transform duration-120 active:scale-[0.94]"
            >
              {replay.playing ? (
                <Pause aria-hidden="true" size={18} />
              ) : (
                <Play aria-hidden="true" size={18} />
              )}
            </button>
            <button
              type="button"
              aria-label={t('pro.replay.again', { minute: sequence.goal.minute.label })}
              onClick={replay.replay}
              className="grid size-11 place-items-center rounded-full text-ink hover:bg-mute-soft"
            >
              <RotateCcw aria-hidden="true" size={18} />
            </button>
          </span>
        )}
      </div>
      <ReplayView
        sequence={sequence}
        progress={reduced ? 1 : replay.progress}
        label={t('pro.replay.label', { steps: sequence.steps.length, chain })}
        mode={mode}
        reduced={reduced}
      />
      {webgl && points.length > 1 && (
        <Segmented
          label={t('pro.replay.view')}
          value={mode}
          onChange={setMode}
          options={[
            { value: '2d', label: t('pro.replay.flat') },
            { value: '3d', label: t('pro.replay.threeD') },
          ]}
        />
      )}
      <p className="text-footnote text-ink-soft">
        {chain === '' ? t('pro.replay.noChain') : chain}
      </p>
    </Card>
  );
}
