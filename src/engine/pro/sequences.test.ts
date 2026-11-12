import { describe, expect, it } from 'vitest';
import { FINAL_2018, loadIndex, loadMatch } from '../../test/proFixtures';
import { decodeEvent, otherTeam } from './schema';
import { SEQUENCE_MAX_EVENTS, SEQUENCE_MAX_SECONDS, goalSequences } from './sequences';

describe('goalSequences', () => {
  const match = loadMatch(FINAL_2018);
  const sequences = goalSequences(match);

  it('has one chain per goal, ending with the finish', () => {
    expect(sequences).toHaveLength(6);
    for (const sequence of sequences) {
      expect(sequence.steps.at(-1)?.index).toBe(sequence.goal.index);
      expect(sequence.steps.length).toBeLessThanOrEqual(SEQUENCE_MAX_EVENTS);
    }
  });

  it('stays with the scoring team, inside forty seconds, in time order', () => {
    for (const summary of loadIndex().matches.slice(0, 30)) {
      const m = loadMatch(summary.id);
      for (const sequence of goalSequences(m)) {
        const times = sequence.steps.map((step) => step.t);
        expect(times).toEqual([...times].sort((a, b) => a - b));
        expect((times.at(-1) ?? 0) - (times[0] ?? 0)).toBeLessThanOrEqual(SEQUENCE_MAX_SECONDS);
        for (const step of sequence.steps) {
          const event = m.events[step.index];
          const team = event?.ownGoal === true ? otherTeam(event.team) : event?.team;
          expect(team).toBe(sequence.goal.team);
        }
      }
    }
  });

  it('draws in the common frame: France attacks right, Croatia left, a goal ends in the net', () => {
    const mbappe = sequences.find((s) => s.goal.scorer === 'K. Mbappé');
    expect(mbappe?.steps.at(-1)?.to).toEqual({ x: 100, y: 50 });
    const perisic = sequences.find((s) => s.goal.scorer === 'I. Perišić');
    expect(perisic?.steps.at(-1)?.to).toEqual({ x: 0, y: 50 });
    expect(perisic?.steps.map((s) => s.player)).toContain('D. Vida');
    const own = sequences.find((s) => s.goal.ownGoal);
    // Mandžukić (away) put it into his own goal, which is on the right of the common pitch.
    expect(own?.steps.at(-1)?.to).toEqual({ x: 100, y: 50 });
  });

  it('stops at the other team touching the ball, at a foul and at a new period', () => {
    const e = (tuple: number[], i: number) =>
      decodeEvent(tuple as Parameters<typeof decodeEvent>[0], i);
    const events = [
      e([1, 0, 0, 1, 0, 40, 50, 60, 50, 1], 0),
      e([1, 2, 1, 2, 4, 40, 50, -1, -1, 0], 1),
      e([1, 4, 0, 1, 2, 60, 50, -1, -1, 1], 2),
      e([1, 5, 1, 2, 2, 40, 50, -1, -1, 0], 3),
      e([1, 6, 0, 1, 2, 62, 50, -1, -1, 0], 4),
      e([1, 7, 0, 1, 0, 62, 50, 85, 50, 1], 5),
      e([1, 9, 0, 1, 1, 88, 50, -1, -1, 3], 6),
    ];
    const players = [
      { name: 'A', team: 0, role: 'FW', starter: true, from: 0, to: 90 },
      { name: 'B', team: 0, role: 'FW', starter: true, from: 0, to: 90 },
      { name: 'C', team: 1, role: 'DF', starter: true, from: 0, to: 90 },
    ] as const;
    const [sequence] = goalSequences({ players: [...players], events });
    // The won duel (2) is taken, the lost one (4) skipped, the other team's duel (3) stepped
    // over, and the other team's recovery (1) ends the chain.
    expect(sequence?.steps.map((step) => step.index)).toEqual([2, 5, 6]);
    const fouled = goalSequences({
      players: [...players],
      events: [
        e([1, 0, 0, 1, 0, 40, 50, 60, 50, 1], 0),
        e([1, 1, 0, 1, 5, 40, 50, -1, -1, 0], 1),
        e([1, 9, 0, 1, 1, 88, 50, -1, -1, 3], 2),
      ],
    });
    expect(fouled[0]?.steps.map((step) => step.index)).toEqual([2]);
    const newHalf = goalSequences({
      players: [...players],
      events: [
        e([1, 2700, 0, 1, 0, 40, 50, 60, 50, 1], 0),
        e([2, 5, 0, 1, 1, 88, 50, -1, -1, 3], 1),
      ],
    });
    expect(newHalf[0]?.steps.map((step) => step.index)).toEqual([1]);
    const unplaced = goalSequences({
      players: [...players],
      events: [e([1, 3, 0, 1, 1, -1, -1, -1, -1, 2], 0)],
    });
    expect(unplaced[0]?.steps).toEqual([]);
  });
});
