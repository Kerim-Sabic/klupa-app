import {
  ArrowDownToLine,
  ArrowUpToLine,
  CircleSlash,
  Crosshair,
  Flag,
  Goal,
  HandGrab,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { XG_UNITS_PER_GOAL } from '../../engine';
import { formatDate } from '../../lib/dates';
import type { EventKind } from './weights';

/**
 * Locales to try for formatting. Not every browser ships Bosnian locale data; Croatian uses the
 * same conventions, so it is the fallback before the browser default.
 */
export function localesFor(language: string): string[] {
  return language === 'bs' ? ['bs-BA', 'hr-BA', 'hr'] : [language];
}

/** Chance quality (1/10,000 goal units) as a whole percent, e.g. "12%" or "12 %". */
export function formatChance(units: number, language: string): string {
  return new Intl.NumberFormat(localesFor(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(units / XG_UNITS_PER_GOAL);
}

/** A stored yyyy-mm-dd as a short date with weekday; an unreadable value is shown as it is. */
export function formatMatchDate(isoDate: string, language: string): string {
  return formatDate(isoDate, language, 'weekday') || isoDate;
}

/** One distinct icon per event kind; the label always goes with it. */
export const KIND_ICON: Readonly<Record<EventKind, LucideIcon>> = {
  goal: Goal,
  shot_on_target: Crosshair,
  shot_off_target: CircleSlash,
  big_chance: Sparkles,
  box_entry: ArrowUpToLine,
  corner: Flag,
  high_recovery: HandGrab,
  lost_ball_own_half: ArrowDownToLine,
};
