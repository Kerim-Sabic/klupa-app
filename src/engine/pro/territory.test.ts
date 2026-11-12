import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FINAL_2018, loadMatch } from '../../test/proFixtures';
import { decodeEvent } from './schema';
import { GRID_COLUMNS, GRID_ROWS, territory } from './territory';

describe('territory', () => {
  const match = loadMatch(FINAL_2018);
  const result = territory(match);

  it('puts every placed event in exactly one cell', () => {
    expect(result.cells).toHaveLength(GRID_COLUMNS * GRID_ROWS);
    const placed = [0, 1].map(
      (team) => match.events.filter((e) => e.team === team && e.at !== null).length,
    );
    const counted = [0, 1].map((team) =>
      result.cells.reduce((sum, cell) => sum + cell.touches[team as 0 | 1], 0),
    );
    expect(counted).toEqual(placed);
    expect(result.peak).toBe(Math.max(...result.cells.flatMap((cell) => cell.touches)));
  });

  it('has thirds that add up to one and an honest final-third share', () => {
    for (const thirds of result.thirds) {
      expect(thirds.defensive + thirds.middle + thirds.attacking).toBeCloseTo(1, 12);
    }
    const [home, away] = result.finalThirdPasses;
    expect(result.finalThirdShareHome).toBeCloseTo(home / (home + away), 12);
  });

  it('draws both teams on one pitch: an away touch near its own goal lands on the right', () => {
    const awayDeep = territory({ events: [decodeEvent([1, 0, 1, -1, 4, 2, 10, -1, -1, 0], 0)] });
    const cell = awayDeep.cells.find((c) => c.touches[1] === 1);
    expect(cell).toMatchObject({ column: GRID_COLUMNS - 1, row: GRID_ROWS - 1 });
    const homeDeep = territory({ events: [decodeEvent([1, 0, 0, -1, 4, 2, 10, -1, -1, 0], 0)] });
    expect(homeDeep.cells.find((c) => c.touches[0] === 1)).toMatchObject({ column: 0, row: 0 });
  });

  it('mirrors: swapping the teams of every event mirrors the grid', () => {
    // Positions on a cell boundary (x = 50; y = 25, 50, 75) belong to the cell above them, so
    // they are not symmetric by construction and are left out.
    const x = fc.integer({ min: 1, max: 99 }).filter((v) => v !== 50);
    const y = fc.integer({ min: 1, max: 99 }).filter((v) => v % 25 !== 0);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom<0 | 1>(0, 1), x, y), { maxLength: 40 }),
        (list) => {
          const make = (swap: boolean) =>
            territory({
              events: list.map(([team, x, y], i) =>
                decodeEvent([1, i, swap ? (team === 0 ? 1 : 0) : team, -1, 4, x, y, -1, -1, 0], i),
              ),
            });
          const a = make(false);
          const b = make(true);
          for (const cell of a.cells) {
            const twin = b.cells.find(
              (c) =>
                c.column === GRID_COLUMNS - 1 - cell.column && c.row === GRID_ROWS - 1 - cell.row,
            );
            expect(twin?.touches).toEqual([cell.touches[1], cell.touches[0]]);
          }
        },
      ),
    );
  });

  it('is neutral when nothing happened', () => {
    const empty = territory({ events: [] });
    expect(empty.peak).toBe(0);
    expect(empty.finalThirdShareHome).toBe(0.5);
    expect(empty.thirds[0]).toEqual({ defensive: 0, middle: 0, attacking: 0 });
  });
});
