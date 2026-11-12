import { Pause, Play, Radio, SkipForward } from 'lucide-react';
import { useId, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClockMoment, MatchClock, Pair } from '../../engine/pro';
import { Button } from '../../ui';
import { keyAction, type PlaybackAction, type PlaybackState } from './playback';

interface LiveBarProps {
  readonly state: PlaybackState;
  readonly dispatch: (action: PlaybackAction) => void;
  readonly clock: MatchClock;
  readonly moment: ClockMoment;
  readonly score: Pair<number>;
  /** Goal moments on the playhead axis, with the scoring team, for the ticks. */
  readonly goals: readonly { readonly playhead: number; readonly team: 0 | 1 }[];
  /** No playing on its own when the reader asked for less motion: scrubbing only. */
  readonly reduced: boolean;
  /** The latest goal announcement, read out politely. */
  readonly announcement: string;
}

const ICON_BUTTON =
  'grid size-11 shrink-0 place-items-center rounded-full bg-ink text-on-ink transition-transform duration-120 ease-touch active:scale-[0.94] focus-visible:outline-offset-3';

/** The transport for watching a match as live: state, clock, play, speed and the scrubber. */
export function LiveBar(props: LiveBarProps) {
  const { state, dispatch, clock, moment, score, goals, reduced } = props;
  const { t } = useTranslation();
  const id = useId();
  const fullTime = state.playhead >= state.total;
  const status = state.playing ? 'live' : fullTime ? 'fullTime' : 'paused';
  const percent = (value: number) =>
    `${String(clock.total === 0 ? 0 : (value / clock.total) * 100)}%`;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = keyAction(event.key, event.shiftKey);
    if (action === null || (reduced && action.type === 'toggle')) return;
    event.preventDefault();
    dispatch(action);
  };

  return (
    <section
      aria-label={t('pro.live.label')}
      className="material-chrome -mx-4 border-y border-hairline px-4 py-2.5 sm:mx-0 sm:rounded-card sm:border"
    >
      {/* The controls drop to a second line when a long label ("Gledaj kao uživo") will not fit. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          // On a phone the row has room for the dot only; the words stay for screen readers.
          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold max-sm:px-2 ${
            status === 'live' ? 'bg-clay-soft text-ink' : 'bg-mute-soft text-ink'
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${status === 'live' ? 'bg-clay motion-safe:animate-pulse' : 'bg-mute'}`}
          />
          <span className="max-sm:sr-only">{t(`pro.live.status.${status}`)}</span>
        </span>
        <span className="font-display text-[24px] leading-none text-ink tabular-nums">
          {`${moment.minute.label}'`}
        </span>
        <span
          aria-hidden="true"
          className="font-display text-[24px] leading-none whitespace-nowrap tabular-nums"
        >
          <span className="text-home">{score[0]}</span>
          <span className="px-0.5 text-ink-soft">–</span>
          <span className="text-away">{score[1]}</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!reduced && (
            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'nextSpeed' });
              }}
              aria-label={t('pro.live.speed', { speed: state.speed })}
              className="min-h-11 min-w-11 rounded-control px-2 text-[15px] font-semibold text-ink tabular-nums hover:bg-mute-soft"
            >
              {`${String(state.speed)}×`}
            </button>
          )}
          {!reduced && !fullTime && (
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t(state.playing ? 'pro.live.pause' : 'pro.live.play')}
              onClick={() => {
                dispatch({ type: 'toggle' });
              }}
            >
              {state.playing ? (
                <Pause aria-hidden="true" size={20} />
              ) : (
                <Play aria-hidden="true" size={20} />
              )}
            </button>
          )}
          {fullTime ? (
            <Button
              variant="primary"
              icon={<Radio />}
              className="whitespace-nowrap max-sm:px-3"
              onClick={() => {
                dispatch({ type: 'watchLive', autoplay: !reduced });
              }}
            >
              {t(reduced ? 'pro.live.fromKickOff' : 'pro.live.watch')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={<SkipForward />}
              className="whitespace-nowrap max-sm:min-w-11 max-sm:px-3"
              onClick={() => {
                dispatch({ type: 'fullMatch' });
              }}
            >
              <span className="max-sm:sr-only">{t('pro.live.full')}</span>
            </Button>
          )}
        </span>
      </div>
      <div className="mt-2">
        {/* Goals and period breaks on a strip above the track; inset by half a thumb so a mark
            sits where the thumb will be at that moment. */}
        <div aria-hidden="true" className="pointer-events-none relative mx-2 h-3">
          {clock.spans.slice(1).map((span) => (
            <span
              key={span.period}
              className="absolute top-0 h-3 w-px bg-mute"
              style={{ left: percent(span.from) }}
            />
          ))}
          {goals.map((goal) => (
            <span
              key={`${String(goal.playhead)}-${String(goal.team)}`}
              className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-raised ${
                goal.team === 0 ? 'bg-home' : 'bg-away'
              }`}
              style={{ left: percent(goal.playhead) }}
            />
          ))}
        </div>
        <label htmlFor={`${id}-scrub`} className="sr-only">
          {t('pro.live.scrub')}
        </label>
        <input
          id={`${id}-scrub`}
          type="range"
          min={0}
          max={clock.total}
          step={1}
          value={Math.round(state.playhead)}
          aria-valuetext={t('pro.live.at', { minute: moment.minute.label })}
          aria-keyshortcuts="Space ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
          onKeyDown={onKeyDown}
          onChange={(event) => {
            dispatch({ type: 'seek', playhead: Number(event.target.value) });
          }}
          className="-mt-1 block min-h-11 w-full accent-ink"
        />
      </div>
      <p aria-live="polite" className="sr-only">
        {props.announcement}
      </p>
    </section>
  );
}
