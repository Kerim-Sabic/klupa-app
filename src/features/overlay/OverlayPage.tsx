import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PublicLayout } from '../../app/PublicLayout';
import { LinkButton, PageHeader } from '../../ui';
import { createDetector, type GetDetector, type PlayerDetector } from './detector';
import { LimitsNote } from './LimitsNote';
import { OverlayView, type OverlaySession } from './OverlayView';
import { createPixelReader, type ReadPixels } from './pixels';
import { StartPanel } from './StartPanel';

/**
 * Nine seconds of an amateur match between adults, from Pexels (credited on the page, in the
 * README and in research/data/MANIFEST.json). Served by this site like any other file.
 */
export const SAMPLE_URL = `${import.meta.env.BASE_URL}data/overlay/sample.mp4`;

export interface OverlayPageProps {
  /** Tests hand in a stand-in; the page itself loads the real model. */
  readonly detector?: GetDetector;
  readonly pixels?: ReadPixels;
}

/**
 * The model is loaded once per visit and shared by every start: stopping and starting again,
 * or going from a video to the camera, does not download or build it a second time.
 */
function useSharedDetector(create: GetDetector): GetDetector {
  const loaded = useRef<Promise<PlayerDetector> | null>(null);
  useEffect(
    () => () => {
      void loaded.current?.then((detector) => {
        detector.close();
      });
    },
    [],
  );
  return useCallback(
    (signal, onProgress) => {
      loaded.current ??= create(signal, onProgress).catch((error: unknown) => {
        // A failed or cancelled load is forgotten, so the next start tries afresh.
        loaded.current = null;
        throw error;
      });
      return loaded.current;
    },
    [create],
  );
}

/**
 * Player overlay: a coach's own video, or the camera, with every player found, followed and
 * marked by team, drawn over the picture as it plays. All of it runs on this device; the
 * picture is never uploaded or stored.
 */
export function OverlayPage({ detector = createDetector, pixels }: OverlayPageProps) {
  const { t } = useTranslation();
  const [session, setSession] = useState<OverlaySession | null>(null);
  const getDetector = useSharedDetector(detector);
  const [readPixels] = useState<ReadPixels>(() => pixels ?? createPixelReader());

  return (
    <PublicLayout>
      <PageHeader title={t('overlay.title')} subtitle={t('overlay.subtitle')} />
      <div className="flex flex-col gap-6">
        {session === null ? (
          <StartPanel
            onFile={(file) => {
              setSession({ source: 'file', file });
            }}
            onCamera={() => {
              setSession({ source: 'camera' });
            }}
            onSample={() => {
              setSession({ source: 'file', file: SAMPLE_URL });
            }}
          />
        ) : (
          <OverlayView
            session={session}
            getDetector={getDetector}
            readPixels={readPixels}
            onBack={() => {
              setSession(null);
            }}
          />
        )}
        <LimitsNote />
        <div>
          <LinkButton to="/movement" variant="ghost">
            {t('overlay.related')}
          </LinkButton>
        </div>
      </div>
    </PublicLayout>
  );
}
