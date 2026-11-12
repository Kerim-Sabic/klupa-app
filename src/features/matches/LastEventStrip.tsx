import { Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatClock } from './clock';
import type { FeedEvent } from './feed';

interface LastEventStripProps {
  readonly event: FeedEvent | undefined;
  readonly canUndo: boolean;
  readonly onUndo: (event: FeedEvent) => void;
}

/**
 * The newest event and its undo, right above the buttons: a mis-tap has to be fixable without
 * looking for it. Before the first event it holds a hint instead, at the same height, so the
 * first tag never moves the buttons under the coach's thumb.
 */
export function LastEventStrip({ event, canUndo, onUndo }: LastEventStripProps) {
  const { t } = useTranslation();
  if (event === undefined) {
    return (
      <p className="flex min-h-12 items-center rounded-control bg-mute-soft px-3 text-sm text-ink-soft">
        {t('matches.pad.ready')}
      </p>
    );
  }
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-control bg-mute-soft py-0.5 pr-0.5 pl-3 text-sm">
      <p className="min-w-0 truncate">
        <span className="font-semibold tabular-nums">{formatClock(event.clock_seconds)}</span>
        {' · '}
        {t(`matches.side.${event.side}`)}
        {' · '}
        {t(`matches.kinds.${event.kind}`)}
      </p>
      {canUndo && (
        <button
          type="button"
          aria-label={t('matches.feed.undoLast')}
          onClick={() => {
            onUndo(event);
          }}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-3 font-semibold text-clay transition-colors duration-150 ease-touch hover:bg-clay-soft active:scale-[0.98]"
        >
          <Undo2 aria-hidden="true" size={16} />
          {t('matches.feed.undo')}
        </button>
      )}
    </div>
  );
}
