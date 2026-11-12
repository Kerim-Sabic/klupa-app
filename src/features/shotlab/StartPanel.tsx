import { Camera, Film, Lock, PlayCircle, ScanLine, Video } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '../../ui';
import { canUseCamera } from './useLiveCamera';

export interface StartPanelProps {
  readonly onFile: (file: File) => void;
  readonly onExample: () => void;
  readonly onLive: () => void;
}

const STEPS = ['film', 'device', 'talk'] as const;

/** The ways in: film now, pick a clip, use the camera live, or explore the example. */
export function StartPanel({ onFile, onExample, onLive }: StartPanelProps) {
  const { t } = useTranslation();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  const take = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    // Clear the input so choosing the same clip again still fires a change.
    event.currentTarget.value = '';
    if (file !== undefined) onFile(file);
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
      <Card as="section" aria-labelledby="shotlab-start-title" className="flex flex-col gap-4">
        <h2 id="shotlab-start-title" className="text-[17px] font-semibold text-ink">
          {t('shotlab.start.title')}
        </h2>
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth icon={<Camera />} onClick={() => camera.current?.click()}>
            {t('shotlab.start.film')}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            fullWidth
            icon={<Film />}
            onClick={() => library.current?.click()}
          >
            {t('shotlab.start.choose')}
          </Button>
          {canUseCamera() && (
            <>
              <Button size="lg" variant="secondary" fullWidth icon={<ScanLine />} onClick={onLive}>
                {t('shotlab.start.live')}
              </Button>
              <p className="px-1 text-[13px] text-ink-soft">{t('shotlab.start.liveNote')}</p>
            </>
          )}
          <Button size="lg" variant="ghost" fullWidth icon={<PlayCircle />} onClick={onExample}>
            {t('shotlab.start.example')}
          </Button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="video/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('shotlab.start.film')}
          data-testid="shotlab-camera-input"
          onChange={take}
        />
        <input
          ref={library}
          type="file"
          accept="video/*"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('shotlab.start.choose')}
          data-testid="shotlab-file-input"
          onChange={take}
        />
        <p className="flex gap-2 text-[15px] text-ink">
          <Video aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-pitch" />
          {t('shotlab.start.tips')}
        </p>
        <p className="flex gap-2 text-[15px] text-ink-soft">
          <Lock aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-pitch" />
          {t('shotlab.start.privacy')}
        </p>
      </Card>
      <section aria-labelledby="shotlab-how-title" className="flex flex-col gap-3">
        <h2 id="shotlab-how-title" className="text-[17px] font-semibold text-ink">
          {t('shotlab.how.title')}
        </h2>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span
                aria-hidden="true"
                className="font-display grid size-8 shrink-0 place-items-center rounded-full bg-pitch-soft text-[17px] text-pitch"
              >
                {i + 1}
              </span>
              <div>
                <p className="font-semibold text-ink">{t(`shotlab.how.${step}.title`)}</p>
                <p className="text-[15px] text-ink-soft">{t(`shotlab.how.${step}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
