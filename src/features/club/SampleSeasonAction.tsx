import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorKey } from '../../lib/errors';
import { Button, ErrorNotice, type ButtonSize } from '../../ui';
import type { useSampleSeason } from './useSampleSeason';

/**
 * The one control that loads the sample season: a button, the line that replaces it while the
 * season is being written, and what went wrong with a way to try again. Used by the Club
 * screen's card and by Today's empty demo state, so the two can never tell different stories.
 */
export function SampleSeasonAction({
  load,
  size = 'md',
}: {
  readonly load: ReturnType<typeof useSampleSeason>;
  readonly size?: ButtonSize;
}) {
  const { t } = useTranslation();
  const { mutate } = load;
  return (
    <>
      {load.isError && (
        <ErrorNotice
          title={t('club.sample.failed')}
          body={t(errorKey(load.error))}
          onRetry={() => {
            mutate();
          }}
        />
      )}
      {load.isPending ? (
        <p role="status" className="flex min-h-11 items-center gap-2 text-ink-soft">
          <LoaderCircle
            aria-hidden="true"
            size={18}
            className="shrink-0 animate-spin text-ink motion-reduce:animate-none"
          />
          {t('club.sample.writing')}
        </p>
      ) : (
        <div>
          <Button
            size={size}
            onClick={() => {
              mutate();
            }}
          >
            {t('club.sample.button')}
          </Button>
        </div>
      )}
    </>
  );
}
