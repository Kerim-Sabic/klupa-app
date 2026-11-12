import { CircleDashed, Equal, ShieldCheck, Timer, Zap, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MomentumState } from '../engine';
import { cx } from './internal';

interface StateLook {
  icon: LucideIcon;
  surface: string;
  glyph: string;
}

/**
 * Colour is a claim (DESIGN.md): each state has one colour, one icon and one label, everywhere.
 * The label stays in ink so it meets AA on every tint; the colour lives in the tint and the icon.
 */
const STATE_LOOK: Record<MomentumState, StateLook> = {
  stable: { icon: ShieldCheck, surface: 'bg-pitch-soft', glyph: 'text-pitch' },
  'event-sensitive': { icon: Zap, surface: 'bg-amber-soft', glyph: 'text-amber' },
  'window-sensitive': { icon: Timer, surface: 'bg-clay-soft', glyph: 'text-clay' },
  level: { icon: Equal, surface: 'bg-mute-soft', glyph: 'text-mute' },
  insufficient: {
    icon: CircleDashed,
    surface: 'border border-dashed border-mute bg-transparent',
    glyph: 'text-mute',
  },
};

const BADGE_SIZE = {
  sm: { box: 'h-6 gap-1 px-2 text-[13px]', icon: 14 },
  md: { box: 'h-8 gap-1.5 px-3 text-[15px]', icon: 16 },
} as const;

export interface StateBadgeProps {
  state: MomentumState;
  size?: 'sm' | 'md';
}

/** What a coach may conclude, as a compact badge: colour, icon and words together. */
export function StateBadge({ state, size = 'md' }: StateBadgeProps) {
  const { t } = useTranslation();
  const look = STATE_LOOK[state];
  const dimensions = BADGE_SIZE[size];
  const Icon = look.icon;
  return (
    <span
      data-state={state}
      className={cx(
        'inline-flex shrink-0 items-center rounded-full font-semibold whitespace-nowrap text-ink',
        dimensions.box,
        look.surface,
      )}
    >
      <Icon aria-hidden="true" size={dimensions.icon} strokeWidth={2.25} className={look.glyph} />
      {t(`state.${state}.label`)}
    </span>
  );
}

export type PillTone = 'pitch' | 'amber' | 'clay' | 'mute' | 'ink';

const PILL_TONE: Record<PillTone, { surface: string; dot: string | null }> = {
  pitch: { surface: 'bg-pitch-soft text-ink', dot: 'bg-pitch' },
  amber: { surface: 'bg-amber-soft text-ink', dot: 'bg-amber' },
  clay: { surface: 'bg-clay-soft text-ink', dot: 'bg-clay' },
  mute: { surface: 'bg-mute-soft text-ink-soft', dot: null },
  ink: { surface: 'bg-ink text-on-ink', dot: null },
};

export interface PillProps {
  tone: PillTone;
  children: ReactNode;
}

/** A short tag. The words carry the meaning; the tone only reinforces it. */
export function Pill({ tone, children }: PillProps) {
  const look = PILL_TONE[tone];
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold whitespace-nowrap',
        look.surface,
      )}
    >
      {look.dot !== null && (
        <span aria-hidden="true" className={cx('size-1.5 rounded-full', look.dot)} />
      )}
      {children}
    </span>
  );
}
