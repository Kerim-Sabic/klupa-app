import { ChevronsLeft, ChevronsRight, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Segmented, SelectField } from '../../ui';
import { useClubName } from './clubs';
import { formatNumber } from './format';
import {
  adjacentChance,
  chanceStart,
  matchClock,
  PLAYBACK_SPEEDS,
  STEP_SECONDS,
  type ShotMark,
} from './model';
import type { Playback } from './usePlayback';

export interface TransportProps {
  readonly playback: Playback;
  readonly marks: readonly ShotMark[];
  readonly periods: number;
}

/** Play, scrub, step, change half and speed, and jump to the build-up of any shot. */
export function Transport({ playback, marks, periods }: TransportProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const { time, duration, playing } = playback;
  const half = t(`movement.transport.period${String(time.period)}`);
  const at = (share: number) => `${(Math.min(1, Math.max(0, share)) * 100).toFixed(2)}%`;
  const previous = adjacentChance(marks, time.seconds, -1);
  const next = adjacentChance(marks, time.seconds, 1);
  const sideName = useClubName();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-0 h-full">
          {marks.map((mark) => (
            <span
              key={mark.id}
              data-testid="shot-mark"
              className={
                mark.side === 'home'
                  ? 'absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[8px] border-x-transparent border-t-home'
                  : 'absolute bottom-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[8px] border-x-transparent border-b-away'
              }
              style={{ left: at(mark.position) }}
            />
          ))}
        </div>
        <label htmlFor={id} className="sr-only">
          {t('movement.transport.scrubLabel')}
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={duration}
          step={0.25}
          value={time.seconds}
          aria-valuetext={t('movement.transport.scrubValue', {
            clock: matchClock(time.period, time.seconds),
            half,
          })}
          onChange={(event) => {
            playback.seek(Number(event.currentTarget.value));
          }}
          className="relative my-2 h-11 w-full cursor-pointer accent-pitch"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            aria-label={t('movement.transport.back')}
            icon={<ChevronsLeft />}
            onClick={() => {
              playback.step(-STEP_SECONDS);
            }}
          />
          <Button
            variant="primary"
            aria-pressed={playing}
            icon={playing ? <Pause /> : <Play />}
            onClick={playback.toggle}
            className="min-w-28"
          >
            {t(playing ? 'movement.transport.pause' : 'movement.transport.play')}
          </Button>
          <Button
            variant="secondary"
            aria-label={t('movement.transport.forward')}
            icon={<ChevronsRight />}
            onClick={() => {
              playback.step(STEP_SECONDS);
            }}
          />
        </div>
        <p className="font-display text-[28px] leading-none tabular-nums" aria-hidden="true">
          {matchClock(time.period, time.seconds)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented
          label={t('movement.transport.periodLabel')}
          options={Array.from({ length: periods }, (_, i) => ({
            value: String(i + 1),
            label: t(`movement.transport.period${String(i + 1)}`),
          }))}
          value={String(time.period)}
          onChange={(value) => {
            playback.setPeriod(Number(value));
          }}
        />
        <Segmented
          label={t('movement.transport.speedLabel')}
          options={PLAYBACK_SPEEDS.map((speed) => ({
            value: speed,
            label: t('movement.transport.speed', { speed }),
          }))}
          value={playback.speed}
          onChange={playback.setSpeed}
        />
      </div>
      <div className="flex flex-col gap-2">
        <SelectField
          label={t('movement.transport.chanceLabel')}
          value=""
          options={[
            { value: '', label: t('movement.transport.chancePick', { count: marks.length }) },
            ...marks.map((mark) => ({
              value: mark.id,
              label: t('movement.transport.chanceOption', {
                clock: matchClock(time.period, mark.seconds),
                side: sideName(mark.side),
                xg: formatNumber(mark.xg, 2, i18n.language),
              }),
            })),
          ]}
          onChange={(value) => {
            const mark = marks.find((m) => m.id === value);
            if (mark !== undefined) playback.seek(chanceStart(mark));
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            icon={<SkipBack />}
            aria-label={t('movement.transport.previousChance')}
            disabled={previous === null}
            onClick={() => {
              if (previous !== null) playback.seek(chanceStart(previous));
            }}
          >
            {t('movement.transport.previousShort')}
          </Button>
          <Button
            variant="ghost"
            icon={<SkipForward />}
            aria-label={t('movement.transport.nextChance')}
            disabled={next === null}
            onClick={() => {
              if (next !== null) playback.seek(chanceStart(next));
            }}
          >
            {t('movement.transport.nextShort')}
          </Button>
        </div>
      </div>
      <p className="text-[13px] text-ink-soft">
        {t('movement.transport.marksLegend', { home: sideName('home'), away: sideName('away') })}{' '}
        {t('movement.transport.keys')}
      </p>
    </div>
  );
}
