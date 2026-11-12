import { animate, useMotionValue, useMotionValueEvent, useReducedMotionConfig } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DURATION, EASE, cx } from './internal';

export type StatTone = 'ink' | 'pitch' | 'amber' | 'clay';

export interface StatProps {
  label: string;
  value: number;
  format?: (value: number) => string;
  hint?: string;
  tone?: StatTone;
}

const TONE: Record<StatTone, string> = {
  ink: 'text-ink',
  pitch: 'text-pitch',
  amber: 'text-amber',
  clay: 'text-clay',
};

/** As many decimals as the target has (at most two), so an integer never counts through 7.43. */
function decimalsOf(value: number): number {
  if (Number.isInteger(value)) return 0;
  const fraction = String(value).split('.')[1] ?? '';
  return Math.min(fraction.length, 2);
}

function defaultFormat(language: string, target: number): (value: number) => string {
  const digits = decimalsOf(target);
  const formatter = new Intl.NumberFormat(language, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return (value) => formatter.format(value);
}

/**
 * One number and what it means. It counts from its previous value to the new one over the
 * `slow` duration; the final value is in the DOM at once for assistive tech.
 */
export function Stat({ label, value, format, hint, tone = 'ink' }: StatProps) {
  const { i18n } = useTranslation();
  const reduced = useReducedMotionConfig() === true;
  const toText = format ?? defaultFormat(i18n.language, value);
  const shown = useMotionValue(reduced ? value : 0);
  const visible = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // A hidden page gets no animation frames, which would strand the counter on a wrong
    // in-between number. Show the true value at once there, and in every other case make
    // sure the count has settled on it shortly after it should have finished.
    if (reduced || document.visibilityState !== 'visible') {
      shown.set(value);
      return undefined;
    }
    const controls = animate(shown, value, { duration: DURATION.slow, ease: EASE });
    const settle = window.setTimeout(
      () => {
        controls.stop();
        shown.set(value);
      },
      DURATION.slow * 1000 + 250,
    );
    return () => {
      window.clearTimeout(settle);
      controls.stop();
    };
  }, [reduced, shown, value]);

  useMotionValueEvent(shown, 'change', (latest) => {
    if (visible.current !== null) visible.current.textContent = toText(latest);
  });

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
      <span className={cx('font-display text-[30px]', TONE[tone])}>
        <span ref={visible} aria-hidden="true">
          {toText(shown.get())}
        </span>
        <span className="sr-only">{toText(value)}</span>
      </span>
      {hint !== undefined && <span className="text-[13px] text-ink-soft">{hint}</span>}
    </div>
  );
}
