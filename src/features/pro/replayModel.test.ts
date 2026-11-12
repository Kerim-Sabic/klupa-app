import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { goalSequences } from '../../engine/pro';
import { FINAL_2018, loadMatch } from '../../test/proFixtures';
import { ballPath, cumulative, labelSides, pathAt, replaySeconds, surname } from './replayModel';
import { cellLead } from './view';

const sequences = goalSequences(loadMatch(FINAL_2018));
const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];

describe('ballPath', () => {
  it('joins each action start and end, dropping repeats, and ends in the goal', () => {
    const mbappe = sequences.find((s) => s.goal.scorer === 'K. Mbappé');
    const path = ballPath(mbappe?.steps ?? []);
    expect(path.at(-1)).toEqual({ x: 100, y: 50 });
    path.slice(1).forEach((point, i) => {
      expect(point).not.toEqual(path[i]);
    });
    expect(ballPath([])).toEqual([]);
  });
});

describe('pathAt', () => {
  it('walks the route by distance', () => {
    expect(cumulative(square)).toEqual([0, 10, 20]);
    expect(pathAt(square, 0)).toEqual({
      ball: { x: 0, y: 0 },
      drawn: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    });
    expect(pathAt(square, 0.25).ball).toEqual({ x: 5, y: 0 });
    expect(pathAt(square, 0.75)).toEqual({
      ball: { x: 10, y: 5 },
      drawn: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ],
    });
    expect(pathAt(square, 1).drawn).toEqual(square);
    expect(pathAt(square, Number.NaN).drawn).toEqual(square);
    expect(pathAt([], 0.5)).toEqual({ ball: null, drawn: [] });
    expect(
      pathAt(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        0.5,
      ).ball,
    ).toEqual({ x: 1, y: 1 });
  });

  it('only ever draws more of the path as time goes on', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [early, late] = a <= b ? [a, b] : [b, a];
          expect(pathAt(square, early).drawn.length).toBeLessThanOrEqual(
            pathAt(square, late).drawn.length,
          );
        },
      ),
    );
  });
});

describe('labelSides', () => {
  it('puts a crowded name above its node, and keeps lone names below', () => {
    expect(
      labelSides([
        { x: 50, y: 50 },
        { x: 52, y: 52 },
        { x: 90, y: 10 },
      ]),
    ).toEqual(['below', 'above', 'below']);
    // With both spots taken, the name stays below rather than jumping elsewhere.
    expect(
      labelSides([
        { x: 50, y: 50 },
        { x: 50, y: 34 },
        { x: 50, y: 46 },
      ]),
    ).toEqual(['below', 'below', 'below']);
  });
});

describe('labels and timing', () => {
  it('shortens names and times replays', () => {
    expect(surname('K. Mbappé')).toBe('Mbappé');
    expect(surname('N. Kanté')).toBe('Kanté');
    expect(surname('Pepe')).toBe('Pepe');
    expect(surname('J. M. Giménez')).toBe('Giménez');
    expect(replaySeconds([])).toBe(2);
    expect(replaySeconds(sequences[0]?.steps ?? [])).toBeGreaterThanOrEqual(2);
  });

  it('names the leading team in a territory cell', () => {
    expect(cellLead([0, 0])).toBeNull();
    expect(cellLead([3, 1])).toEqual({ team: 0, value: 0.75 });
    expect(cellLead([1, 3])).toEqual({ team: 1, value: 0.75 });
    expect(cellLead([2, 2])).toEqual({ team: 0, value: 0.5 });
  });
});
