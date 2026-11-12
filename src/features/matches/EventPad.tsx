import { Check } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Side } from '../../engine';
import { Segmented } from '../../ui';
import type { FeedEvent } from './feed';
import { KIND_ICON } from './format';
import { LastEventStrip } from './LastEventStrip';
import { EVENT_KINDS, type EventKind } from './weights';

/**
 * A tag tile: 56 px tall on a phone (so all eight fit under the score without scrolling) and
 * 64 px from a tablet up, icon and label side by side, pressing to 0.98. The kit's Button is
 * a single-line action; tiles wrap long Bosnian labels over two lines instead.
 */
const TILE = [
  'flex min-h-14 items-center gap-2.5 rounded-control border border-line bg-raised px-3 py-1.5 md:min-h-16 md:py-2',
  'text-left text-[15px] leading-tight font-semibold text-ink select-none touch-manipulation',
  'transition-[transform,border-color,background-color] duration-120 ease-touch',
  'hover:border-mute active:scale-[0.98] data-confirmed:border-pitch data-confirmed:bg-pitch-soft',
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100',
].join(' ');

export type DisabledReason = 'before' | 'break' | 'over' | 'finished';

export interface EventPadProps {
  readonly side: Side;
  readonly onSide: (side: Side) => void;
  readonly onTap: (kind: EventKind) => void;
  /** Null when events can be recorded. */
  readonly disabled: DisabledReason | null;
  /** The kind that was just saved, for a brief tick on its button. */
  readonly confirmed: EventKind | null;
  /** Announced to screen readers after each save. */
  readonly announcement: string;
  /** The newest event, shown above the buttons with its undo. */
  readonly last: FeedEvent | undefined;
  readonly onUndo: (event: FeedEvent) => void;
}

/**
 * The thumb zone: the last event and its undo, who did it, then eight large buttons. Non-shot
 * kinds save on one tap. When recording is not possible the reason takes the last event's
 * place, so the pad keeps one height through the whole match.
 */
export function EventPad({
  side,
  onSide,
  onTap,
  disabled,
  confirmed,
  announcement,
  last,
  onUndo,
}: EventPadProps) {
  const { t } = useTranslation();
  const reasonId = useId();
  return (
    <section aria-label={t('matches.pad.label')} className="flex flex-col gap-2.5">
      {disabled === null ? (
        <LastEventStrip event={last} canUndo onUndo={onUndo} />
      ) : (
        <p
          id={reasonId}
          className="flex min-h-12 items-center rounded-control bg-mute-soft px-3 text-sm font-semibold text-ink-soft"
        >
          {t(`matches.pad.disabled.${disabled}`)}
        </p>
      )}
      <Segmented<Side>
        hideLabel
        label={t('matches.side.label')}
        value={side}
        onChange={onSide}
        options={[
          { value: 'home', label: t('matches.side.home') },
          { value: 'away', label: t('matches.side.away') },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        {EVENT_KINDS.map((kind) => {
          const Icon = confirmed === kind ? Check : KIND_ICON[kind];
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled !== null}
              aria-describedby={disabled === null ? undefined : reasonId}
              data-confirmed={confirmed === kind || undefined}
              onClick={() => {
                onTap(kind);
              }}
              className={TILE}
            >
              <Icon aria-hidden="true" size={22} strokeWidth={2.25} className="shrink-0" />
              <span className="min-w-0">{t(`matches.kinds.${kind}`)}</span>
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
