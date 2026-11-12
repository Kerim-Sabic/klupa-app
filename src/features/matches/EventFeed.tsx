import { CloudUpload, TriangleAlert, Undo2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../lib/errors';
import { Button, Card, CardTitle } from '../../ui';
import { formatClock } from './clock';
import type { FeedEvent } from './feed';
import { formatChance, KIND_ICON } from './format';
import type { FailedItem } from './outbox';
import { isShotKind } from './weights';

export interface EventFeedProps {
  /** Newest first. */
  readonly events: readonly FeedEvent[];
  readonly canUndo: boolean;
  readonly onUndo: (event: FeedEvent) => void;
}

const SIDE_DOT = { home: 'bg-home', away: 'bg-away' } as const;

function EventLine({
  event,
  newest,
  canUndo,
  onUndo,
}: {
  event: FeedEvent;
  newest: boolean;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { t, i18n } = useTranslation();
  const Icon = KIND_ICON[event.kind];
  const kind = t(`matches.kinds.${event.kind}`);
  const clock = formatClock(event.clock_seconds);
  let quality: string | null = null;
  if (isShotKind(event.kind)) {
    quality =
      event.x === null
        ? t('matches.feed.noLocation')
        : t('matches.feed.chance', { value: formatChance(event.weight, i18n.language) });
  }
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex min-h-12 items-center gap-3 py-1.5"
    >
      <span className="w-12 shrink-0 text-right">
        <span className="block font-semibold tabular-nums">{clock}</span>
        <span className="block text-[13px] text-ink-soft">
          {t('matches.feed.period', { number: event.period })}
        </span>
      </span>
      <Icon aria-hidden="true" size={20} className="shrink-0 text-ink-soft" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{kind}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className={`size-2 rounded-full ${SIDE_DOT[event.side]}`} />
            {t(`matches.side.${event.side}`)}
          </span>
          {quality !== null && <span>{quality}</span>}
          {event.sync === 'pending' && (
            <span className="inline-flex items-center gap-1">
              <CloudUpload aria-hidden="true" size={14} />
              {t('matches.feed.pending')}
            </span>
          )}
          {event.sync === 'failed' && (
            <span className="inline-flex items-center gap-1 font-semibold text-clay">
              <TriangleAlert aria-hidden="true" size={14} />
              {t('matches.feed.failed')}
            </span>
          )}
        </span>
      </span>
      {newest && canUndo && (
        <Button
          variant="secondary"
          icon={<Undo2 />}
          aria-label={t('matches.feed.undoLabel', { kind, clock })}
          onClick={onUndo}
        >
          {t('matches.feed.undo')}
        </Button>
      )}
    </motion.li>
  );
}

/** The last five events, newest on top, with an undo for the newest. */
export function EventFeed({ events, canUndo, onUndo }: EventFeedProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="matches-feed-title">
      <h2 id="matches-feed-title" className="text-[13px] font-semibold text-ink-soft">
        {t('matches.feed.title')}
      </h2>
      {events.length === 0 ? (
        <p className="py-3 text-[15px] text-ink-soft">{t('matches.feed.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          <AnimatePresence initial={false}>
            {events.map((event, index) => (
              <EventLine
                key={event.client_id}
                event={event}
                newest={index === 0}
                canUndo={canUndo}
                onUndo={() => {
                  onUndo(event);
                }}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function failedText(item: FailedItem, t: (key: string) => string): string {
  if (item.op.kind === 'event') return t(`matches.kinds.${item.op.row.kind}`);
  return t(item.op.kind === 'status' ? 'matches.failed.status' : 'matches.failed.undo');
}

/** Operations the server refused for good. Visible until the coach retries or removes them. */
export function FailedList({
  items,
  onRetry,
  onDismiss,
}: {
  items: readonly FailedItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <Card as="section" aria-label={t('matches.failed.title')}>
      <CardTitle className="flex items-center gap-2">
        <TriangleAlert aria-hidden="true" size={18} className="text-clay" />
        {t('matches.failed.title')}
      </CardTitle>
      <p className="mt-1 text-[13px] text-ink-soft">{t('matches.failed.body')}</p>
      <ul className="mt-2 divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {failedText(item, t)}
                {item.op.kind === 'event' && ` · ${formatClock(item.op.row.clock_seconds)}`}
              </span>
              <span className="block text-[13px] text-ink-soft">
                {t(errorKey({ code: item.reason }))}
              </span>
            </span>
            <Button
              variant="secondary"
              onClick={() => {
                onRetry(item.id);
              }}
            >
              {t('matches.failed.retry')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onDismiss(item.id);
              }}
            >
              {t('matches.failed.dismiss')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
