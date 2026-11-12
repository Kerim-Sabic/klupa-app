import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextLink } from './TextLink';

/** The ground colour of the recorded replay, so the film has no visible edge in its tile. */
const GROUND = '#0f301f';

function prefersStillness(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The landing page's main picture: a few seconds of the app's own 3D replay, recorded from the
 * replay screen. It loops without sound, can be paused, and stays still for anyone who has
 * asked their device for less motion.
 */
export function ReplayTile() {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [still] = useState(prefersStillness);
  // Set by the film's own play and pause events, so the button is right even when the browser
  // refuses to start a film by itself.
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (still) video.current?.pause();
  }, [still]);

  const toggle = () => {
    const element = video.current;
    if (element === null) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  return (
    <section
      aria-labelledby="landing-replay"
      className="stage overflow-hidden rounded-stage"
      style={{ backgroundColor: GROUND }}
    >
      <div className="px-6 pt-10 text-center sm:px-10 sm:pt-16">
        <h2
          id="landing-replay"
          className="font-title text-[32px] leading-[1.06] tracking-[-0.03em] text-balance sm:text-[52px]"
        >
          {t('landing.replay.title')}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-[17px] text-pretty text-ink-soft sm:text-[20px]">
          {t('landing.replay.body')}
        </p>
        <p className="mt-3">
          <TextLink to="/movement">{t('landing.replay.link')}</TextLink>
        </p>
      </div>
      <div className="relative mt-4 sm:mt-8">
        <video
          ref={video}
          muted
          loop
          playsInline
          autoPlay={!still}
          preload="metadata"
          poster="/media/replay.jpg"
          aria-label={t('landing.replay.label')}
          onPlay={() => {
            setPlaying(true);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          className="block aspect-[1280/620] w-full"
        >
          <source src="/media/replay.mp4" type="video/mp4" />
        </video>
        <button
          type="button"
          onClick={toggle}
          aria-label={t(playing ? 'landing.replay.pause' : 'landing.replay.play')}
          className="absolute right-4 bottom-4 flex size-11 items-center justify-center rounded-full bg-mute-soft text-ink transition-transform duration-120 ease-touch active:scale-[0.94]"
        >
          {playing ? (
            <Pause aria-hidden="true" size={18} strokeWidth={2.4} />
          ) : (
            <Play aria-hidden="true" size={18} strokeWidth={2.4} />
          )}
        </button>
      </div>
    </section>
  );
}
