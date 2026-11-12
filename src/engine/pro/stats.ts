import { shotUnits } from './frame';
import { otherTeam, type ProEvent, type ProMatch } from './schema';

/** A value per team: index 0 home, 1 away. */
export type Pair<T> = readonly [T, T];

export interface TeamStats {
  readonly events: number;
  readonly passes: number;
  readonly accuratePasses: number;
  /** Accurate passes over passes, 0 to 1, or null with no passes. */
  readonly passAccuracy: number | null;
  /**
   * This team's passes over both teams' passes, 0 to 1. Not possession: the data has no ball
   * time, only events, and the label on screen says so.
   */
  readonly passShare: number;
  readonly shots: number;
  readonly shotsOnTarget: number;
  /** Goals from this team's own shots. */
  readonly goals: number;
  /** Own goals by the other team that count for this team. */
  readonly ownGoalsFor: number;
  readonly corners: number;
  /** Fouls this team committed. */
  readonly fouls: number;
  readonly offsides: number;
  /** Open-play and set-piece crosses. */
  readonly crosses: number;
  readonly duelsWon: number;
  readonly duels: number;
  /** Summed chance quality of its shots, in 1/10,000 of a goal. */
  readonly xgUnits: number;
}

interface Tally {
  events: number;
  passes: number;
  accuratePasses: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  ownGoalsFor: number;
  corners: number;
  fouls: number;
  offsides: number;
  crosses: number;
  duelsWon: number;
  duels: number;
  xgUnits: number;
}

const emptyTally = (): Tally => ({
  events: 0,
  passes: 0,
  accuratePasses: 0,
  shots: 0,
  shotsOnTarget: 0,
  goals: 0,
  ownGoalsFor: 0,
  corners: 0,
  fouls: 0,
  offsides: 0,
  crosses: 0,
  duelsWon: 0,
  duels: 0,
  xgUnits: 0,
});

function count(tally: Tally, event: ProEvent): void {
  tally.events += 1;
  switch (event.kind) {
    case 'pass':
      tally.passes += 1;
      if (event.accurate) tally.accuratePasses += 1;
      if (event.cross) tally.crosses += 1;
      break;
    case 'shot':
      tally.shots += 1;
      if (event.accurate) tally.shotsOnTarget += 1;
      if (event.goal) tally.goals += 1;
      tally.xgUnits += shotUnits(event);
      break;
    case 'setPiece':
      if (event.corner) tally.corners += 1;
      else if (event.cross) tally.crosses += 1;
      break;
    case 'duel':
      tally.duels += 1;
      if (event.accurate) tally.duelsWon += 1;
      break;
    case 'foul':
      tally.fouls += 1;
      break;
    case 'offside':
      tally.offsides += 1;
      break;
    default:
      break;
  }
}

/** Per-team totals for a match, read from its events. */
export function teamStats(match: Pick<ProMatch, 'events'>): Pair<TeamStats> {
  const tallies: [Tally, Tally] = [emptyTally(), emptyTally()];
  for (const event of match.events) {
    count(tallies[event.team], event);
    if (event.ownGoal) tallies[otherTeam(event.team)].ownGoalsFor += 1;
  }
  const totalPasses = tallies[0].passes + tallies[1].passes;
  const finish = (tally: Tally): TeamStats => ({
    ...tally,
    passAccuracy: tally.passes === 0 ? null : tally.accuratePasses / tally.passes,
    passShare: totalPasses === 0 ? 0.5 : tally.passes / totalPasses,
  });
  return [finish(tallies[0]), finish(tallies[1])];
}
