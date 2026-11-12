import { buildMatches } from './seedMatches';
import { at, daysSinceMonday, mulberry32, shiftDate, shuffle, type Rng } from './seedRandom';
import { buildSessions } from './seedSessions';
import type { BirthQuarter, SeasonData, SeedParams, SeedPlayer } from './seedTypes';

export type * from './seedTypes';
export { mulberry32 } from './seedRandom';

/** Invented nicknames. Nothing here names a real child. */
const NICKNAMES = [
  'Soko',
  'Vjetar',
  'Munja',
  'Iskra',
  'Ris',
  'Vuk',
  'Orao',
  'Delfin',
  'Jelen',
  'Bura',
  'Zmaj',
  'Tigar',
  'Lav',
  'Val',
] as const;

/*
 * Six of fourteen were born in Q1 and only one in Q4, the skew the relative-age check looks for.
 * The three youngest-born players are also the three who barely get a game.
 */
const REGULAR_QUARTERS: readonly BirthQuarter[] = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3];
const BENCH_QUARTERS: readonly BirthQuarter[] = [3, 3, 4];

function buildPlayers(rng: Rng): SeedPlayer[] {
  const quarters = [...shuffle(rng, REGULAR_QUARTERS), ...BENCH_QUARTERS];
  return NICKNAMES.map((label, index) => ({
    label,
    shirtNumber: index + 1,
    birthQuarter: at(quarters, index),
  }));
}

/**
 * One invented under-13 season, as plain data: 14 players, 3 finished matches and 5 completed
 * sessions, built to leave a finding on every screen. Pure: the same seed and date always give
 * the same season, and nothing reads a clock or `Math.random`.
 */
export function generateSeason({ seed, today }: SeedParams): SeasonData {
  const rng = mulberry32(seed);
  const monday = shiftDate(today, -daysSinceMonday(today));
  const players = buildPlayers(rng);
  const matches = buildMatches(rng, monday);
  const sessions = buildSessions(rng, monday, today);
  return { players, matches, sessions };
}
