import { Download, Film, Lock, PlayCircle, ScanLine, Video } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from '../../ui';
import { canUseCamera } from '../shotlab/useLiveCamera';

export interface StartPanelProps {
  readonly onFile: (file: File) => void;
  readonly onCamera: () => void;
  readonly onSample: () => void;
}

const STEPS = ['find', 'follow', 'teams'] as const;

/** The two ways in, what happens to the picture, and what the page does with it. */
export function StartPanel({ onFile, onCamera, onSample }: StartPanelProps) {
  const { t } = useTranslation();
  const library = useRef<HTMLInputElement>(null);

  const take = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    // Clear the input so choosing the same video again still fires a change.
    event.currentTarget.value = '';
    if (file !== undefined) onFile(file);
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start">
      <Card as="section" aria-labelledby="overlay-start-title" className="flex flex-col gap-4">
        <h2 id="overlay-start-title" className="text-[17px] font-semibold text-ink">
          {t('overlay.start.title')}
        </h2>
        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth icon={<Film />} onClick={() => library.current?.click()}>
            {t('overlay.start.choose')}
          </Button>
          {canUseCamera() && (
            <Button size="lg" variant="secondary" fullWidth icon={<ScanLine />} onClick={onCamera}>
              {t('overlay.start.camera')}
            </Button>
          )}
          <Button size="lg" variant="ghost" fullWidth icon={<PlayCircle />} onClick={onSample}>
            {t('overlay.start.sample')}
          </Button>
        </div>
        <input
          ref={library}
          type="file"
          accept="video/*"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('overlay.start.choose')}
          data-testid="overlay-file-input"
          onChange={take}
        />
        <p className="flex gap-2 text-[15px] text-ink">
          <Video aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-pitch" />
          {t('overlay.start.tips')}
        </p>
        <p className="flex gap-2 text-[15px] text-ink">
          <Lock aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-pitch" />
          {t('overlay.start.privacy')}
        </p>
        <p className="flex gap-2 text-[15px] text-ink-soft">
          <Download aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-pitch" />
          {t('overlay.start.model')}
        </p>
        <p className="text-[13px] text-ink-soft">{t('overlay.start.sampleCredit')}</p>
      </Card>
      <section aria-labelledby="overlay-how-title" className="flex flex-col gap-3">
        <h2 id="overlay-how-title" className="text-[17px] font-semibold text-ink">
          {t('overlay.how.title')}
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
                <p className="font-semibold text-ink">{t(`overlay.how.${step}.title`)}</p>
                <p className="text-[15px] text-ink-soft">{t(`overlay.how.${step}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
