import { formatDate } from '../../lib/dates';
import { z } from 'zod';
import type { Side } from '../../engine/types';

/**
 * The seven tracked matches (`public/data/tracking/index.json`). `home` and `away` are the
 * data file's side labels, not who hosted the match (in four of the seven the "home" label
 * is the guest), so the screen shows club names and never says who played at home.
 */
export const DEFAULT_MATCH_ID = 'J03WN1';

const BASE = import.meta.env.BASE_URL;
export const INDEX_URL = `${BASE}data/tracking/index.json`;
export const metaUrl = (id: string) => `${BASE}data/tracking/${id}.json`;
export const binUrl = (id: string) => `${BASE}data/tracking/${id}.bin`;
export const physicalUrl = (id: string) => `${BASE}data/tracking/${id}.physical.json`;

const matchSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]{6}$/),
  date: z.iso.date(),
  competition: z.string().min(1),
  home: z.string().min(1),
  away: z.string().min(1),
  score: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  periods: z.tuple([z.number().positive(), z.number().positive()]),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export type MatchEntry = z.infer<typeof matchSchema>;

const indexSchema = z.array(matchSchema).min(1);

/** Validate the fetched index; throws a ZodError on any other shape. */
export function parseMatchIndex(value: unknown): readonly MatchEntry[] {
  return indexSchema.parse(value);
}

export type Clubs = Readonly<Record<Side, string>>;

export function clubsOf(match: MatchEntry): Clubs {
  return { home: match.home, away: match.away };
}

/** "Bundesliga 2022/2023" becomes "Bundesliga": the date already says which season. */
export function shortCompetition(competition: string): string {
  return competition.replace(/\s+\d{4}\/\d{4}$/, '');
}

/**
 * "27 May 2023" / "27. maj 2023.", read as a calendar date (no time zone can shift it). Through
 * the app's own date helper: some in-app browsers accept the Bosnian locale without having
 * data for it and print "2023 M05 27".
 */
export function formatMatchDate(date: string, language: string): string {
  return formatDate(date, language, 'long');
}

/** What a club's full name is dropped to in a tight place: numbers and legal forms. */
const CLUB_FORM = /^(\d+\.?|(?:[A-Z]\.?){2,3}|VfL|VfB|SpVgg)$/;

/**
 * "1. FC Köln" becomes "Köln", "Bayer 04 Leverkusen" becomes "Bayer Leverkusen": the name
 * without its founding year, its number and its legal form, for the one line of the picker.
 * A name made of nothing else is left as it is.
 */
export function shortClub(name: string): string {
  const kept = name.split(/\s+/).filter((word) => !CLUB_FORM.test(word));
  return kept.length > 0 ? kept.join(' ') : name;
}

/**
 * The one-line label of the picker, with short club names: a phone shows about thirty-five
 * characters of it, and the full names are in the heading right above.
 */
export function matchLabel(match: MatchEntry, language: string): string {
  return [
    `${shortClub(match.home)} ${String(match.score[0])}–${String(match.score[1])} ${shortClub(match.away)}`,
    formatMatchDate(match.date, language),
    shortCompetition(match.competition),
  ].join(' · ');
}
