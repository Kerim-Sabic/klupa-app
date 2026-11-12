import { shotUnits } from './frame';
import type { ProMatch, ProPlayer, TeamIndex } from './schema';

export interface PlayerLine {
  /** Index into the match's `players`. */
  readonly player: number;
  readonly name: string;
  readonly team: TeamIndex;
  readonly role: ProPlayer['role'];
  readonly starter: boolean;
  /** Match minutes on the pitch, as the provider gives them. */
  readonly from: number;
  readonly to: number;
  readonly minutes: number;
  readonly passes: number;
  readonly accuratePasses: number;
  /** Accurate over all passes, or null with no passes. */
  readonly passAccuracy: number | null;
  readonly keyPasses: number;
  readonly assists: number;
  readonly shots: number;
  readonly goals: number;
  /** Summed chance quality of the player's shots, in 1/10,000 of a goal. */
  readonly xgUnits: number;
  readonly duelsWon: number;
  readonly duels: number;
  readonly interceptions: number;
}

type Counts = Omit<
  PlayerLine,
  'player' | 'name' | 'team' | 'role' | 'starter' | 'from' | 'to' | 'minutes' | 'passAccuracy'
>;

const zero = (): { -readonly [K in keyof Counts]: number } => ({
  passes: 0,
  accuratePasses: 0,
  keyPasses: 0,
  assists: 0,
  shots: 0,
  goals: 0,
  xgUnits: 0,
  duelsWon: 0,
  duels: 0,
  interceptions: 0,
});

/**
 * One line per player in the match file, in the file's order (home first, starters in lineup
 * order). Key passes, assists and interceptions are the provider's tags, counted on any event.
 */
export function playerLines(match: Pick<ProMatch, 'players' | 'events'>): PlayerLine[] {
  const counts = match.players.map(zero);
  for (const event of match.events) {
    const line = counts[event.player];
    if (line === undefined) continue;
    if (event.kind === 'pass') {
      line.passes += 1;
      if (event.accurate) line.accuratePasses += 1;
    }
    if (event.kind === 'shot') {
      line.shots += 1;
      if (event.goal) line.goals += 1;
      line.xgUnits += shotUnits(event);
    }
    if (event.kind === 'duel') {
      line.duels += 1;
      if (event.accurate) line.duelsWon += 1;
    }
    if (event.keyPass) line.keyPasses += 1;
    if (event.assist) line.assists += 1;
    if (event.interception) line.interceptions += 1;
  }
  return match.players.map((player, index) => {
    const line = counts[index] ?? zero();
    return {
      player: index,
      name: player.name,
      team: player.team,
      role: player.role,
      starter: player.starter,
      from: player.from,
      to: player.to,
      minutes: Math.max(player.to - player.from, 0),
      ...line,
      passAccuracy: line.passes === 0 ? null : line.accuratePasses / line.passes,
    };
  });
}
