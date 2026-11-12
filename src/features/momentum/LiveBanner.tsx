import { useTranslation } from 'react-i18next';
import type { FeedState } from './api';

/**
 * Says, in words and with a dot, that this page follows a match being recorded right now.
 * The dot pulses only while changes are arriving and never for people who asked for less motion.
 */
export function LiveBanner({ state }: { readonly state: FeedState }) {
  const { t } = useTranslation();
  const live = state === 'live';
  return (
    <p
      role="status"
      className="mb-4 flex items-center gap-2.5 rounded-control bg-mute-soft px-3 py-2 text-footnote text-ink-soft"
    >
      <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
        {live && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-pitch opacity-60 motion-reduce:animate-none" />
        )}
        <span
          className={`relative inline-flex size-2.5 rounded-full ${live ? 'bg-pitch' : 'border border-ink-soft'}`}
        />
      </span>
      <span>
        <strong className="font-semibold text-ink">{t(`review.live.${state}.label`)}</strong>{' '}
        {t(`review.live.${state}.body`)}
      </span>
    </p>
  );
}
