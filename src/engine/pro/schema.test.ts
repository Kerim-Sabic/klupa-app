import { describe, expect, it } from 'vitest';
import { loadIndex, rawMatch } from '../../test/proFixtures';
import {
  FLAG_BITS,
  ProDataError,
  decodeEvent,
  otherTeam,
  parseProIndex,
  parseProMatch,
} from './schema';

const final = rawMatch(2058017) as { events: number[][]; players: unknown[] };

describe('parseProIndex', () => {
  it('reads the shipped list of 115 matches', () => {
    const index = loadIndex();
    expect(index.matches).toHaveLength(115);
    expect(index.competitions.map((c) => c.id)).toEqual(['wc2018', 'euro2016']);
    expect(index.source.licence).toBe('CC BY 4.0');
  });

  it('refuses a malformed list and names what is wrong', () => {
    expect(() => parseProIndex({ v: 2 })).toThrow(ProDataError);
    expect(() => parseProIndex({ v: 1, source: {}, competitions: [], matches: [] })).toThrow(
      /source\.name/,
    );
    expect(() => parseProIndex(null)).toThrow(/expected format/);
  });
});

describe('parseProMatch', () => {
  it('decodes the 2018 final with names as real characters', () => {
    const match = parseProMatch(final);
    expect(match.teams.map((team) => team.name)).toEqual(['France', 'Croatia']);
    expect(match.events).toHaveLength(1457);
    expect(match.players.some((player) => player.name === 'K. Mbappé')).toBe(true);
    expect(Object.isFrozen(match.events[0])).toBe(true);
  });

  it('refuses a tuple of the wrong shape, a kind out of range and a stranger player', () => {
    const withEvent = (event: unknown) => ({ ...final, events: [event] });
    expect(() => parseProMatch(withEvent([1, 3, 0]))).toThrow(/events\.0/);
    expect(() => parseProMatch(withEvent([1, 3, 0, 1, 9, 50, 50, -1, -1, 0]))).toThrow(
      /events\.0\.4/,
    );
    expect(() => parseProMatch(withEvent([1, 3, 0, 999, 0, 50, 50, -1, -1, 0]))).toThrow(
      /does not belong/,
    );
    const awayPlayer = (final.players as { team: number }[]).findIndex((p) => p.team === 1);
    expect(() => parseProMatch(withEvent([1, 3, 0, awayPlayer, 0, 50, 50, -1, -1, 0]))).toThrow(
      /does not belong/,
    );
    expect(() => parseProMatch('nope')).toThrow(ProDataError);
  });
});

describe('decodeEvent', () => {
  it('names every flag bit and turns -1 positions into null', () => {
    const all = Object.values(FLAG_BITS).reduce((sum, bit) => sum + bit, 0);
    const event = decodeEvent([2, 61, 1, 4, 1, 88, 40, -1, -1, all], 7);
    expect(event).toMatchObject({ index: 7, period: 2, t: 61, team: 1, player: 4, kind: 'shot' });
    expect(event.at).toEqual({ x: 88, y: 40 });
    expect(event.end).toBeNull();
    for (const name of Object.keys(FLAG_BITS))
      expect(event[name as keyof typeof FLAG_BITS]).toBe(true);
    const plain = decodeEvent([1, 0, 0, -1, 7, -1, -1, 10, 20, 0], 0);
    expect(plain.kind).toBe('offside');
    expect(plain.at).toBeNull();
    expect(plain.end).toEqual({ x: 10, y: 20 });
    expect(plain.goal).toBe(false);
  });

  it('pairs the two teams', () => {
    expect(otherTeam(0)).toBe(1);
    expect(otherTeam(1)).toBe(0);
  });
});
