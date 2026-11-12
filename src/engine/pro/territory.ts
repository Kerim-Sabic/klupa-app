import { THIRDS, thirdOf, toCommon, type Third } from './frame';
import type { ProMatch, TeamIndex } from './schema';
import type { Pair } from './stats';

export const GRID_COLUMNS = 6;
export const GRID_ROWS = 4;

export interface TerritoryCell {
  readonly column: number;
  readonly row: number;
  /** Touches (events with a position) of each team in this cell. */
  readonly touches: Pair<number>;
}

export interface Territory {
  /** Row by row, `GRID_ROWS` x `GRID_COLUMNS`, in the common frame (home attacks left to right). */
  readonly cells: readonly TerritoryCell[];
  /** The largest single-team count in any cell, for scaling a drawing. */
  readonly peak: number;
  /** Per team: share of its own touches in its defensive, middle and attacking third. */
  readonly thirds: Pair<Readonly<Record<Third, number>>>;
  /** Per team: passes that ended in its attacking third. */
  readonly finalThirdPasses: Pair<number>;
  /** Home's share of both teams' final-third passes, 0 to 1 (0.5 when there are none). */
  readonly finalThirdShareHome: number;
}

function cellOf(value: number, cells: number): number {
  return Math.min(Math.floor((value / 100) * cells), cells - 1);
}

/**
 * Where each team had the ball. Every event with a position is a touch; the grid is drawn in the
 * common frame so both teams sit on one pitch, while thirds are read in each team's own frame.
 */
export function territory(match: Pick<ProMatch, 'events'>): Territory {
  const grid = Array.from({ length: GRID_ROWS * GRID_COLUMNS }, () => [0, 0] as [number, number]);
  const thirdCounts: [Record<Third, number>, Record<Third, number>] = [
    { defensive: 0, middle: 0, attacking: 0 },
    { defensive: 0, middle: 0, attacking: 0 },
  ];
  const finalThird: [number, number] = [0, 0];

  for (const event of match.events) {
    if (event.at === null) continue;
    const common = toCommon(event.at, event.team);
    const cell = grid[cellOf(common.y, GRID_ROWS) * GRID_COLUMNS + cellOf(common.x, GRID_COLUMNS)];
    if (cell !== undefined) cell[event.team] += 1;
    thirdCounts[event.team][thirdOf(event.at.x)] += 1;
    if (event.kind === 'pass' && event.end !== null && thirdOf(event.end.x) === 'attacking') {
      finalThird[event.team] += 1;
    }
  }

  const shares = (team: TeamIndex): Record<Third, number> => {
    const counts = thirdCounts[team];
    const total = THIRDS.reduce((sum, third) => sum + counts[third], 0);
    return {
      defensive: total === 0 ? 0 : counts.defensive / total,
      middle: total === 0 ? 0 : counts.middle / total,
      attacking: total === 0 ? 0 : counts.attacking / total,
    };
  };
  const cells = grid.map((touches, index) => ({
    column: index % GRID_COLUMNS,
    row: Math.floor(index / GRID_COLUMNS),
    touches: [touches[0], touches[1]] as const,
  }));
  const bothFinal = finalThird[0] + finalThird[1];
  return {
    cells,
    peak: Math.max(0, ...grid.flat()),
    thirds: [shares(0), shares(1)],
    finalThirdPasses: [finalThird[0], finalThird[1]],
    finalThirdShareHome: bothFinal === 0 ? 0.5 : finalThird[0] / bothFinal,
  };
}
