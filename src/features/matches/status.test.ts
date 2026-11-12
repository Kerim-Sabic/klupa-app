import { describe, expect, it } from 'vitest';
import type { MatchStatus } from './model';
import { MATCH_TRANSITIONS, canTransition, statusAfter } from './status';

const STATES: readonly MatchStatus[] = ['scheduled', 'live', 'finished'];

describe('match status transitions', () => {
  it('allows exactly the three moves the database allows', () => {
    const allowed = STATES.flatMap((from) =>
      STATES.filter((to) => canTransition(from, to)).map((to) => `${from} -> ${to}`),
    );
    expect(allowed).toEqual(['scheduled -> live', 'live -> finished', 'finished -> live']);
  });

  it('treats every other move as an invalid status change', () => {
    expect(canTransition('scheduled', 'finished')).toBe(false);
    expect(canTransition('live', 'scheduled')).toBe(false);
    expect(canTransition('finished', 'scheduled')).toBe(false);
    for (const state of STATES) expect(canTransition(state, state)).toBe(false);
  });

  it('names a next state for every state, so no match can get stuck', () => {
    for (const state of STATES) expect(MATCH_TRANSITIONS[state].length).toBeGreaterThan(0);
  });
});

describe('statusAfter', () => {
  it('is the stored state when nothing is waiting', () => {
    expect(statusAfter('scheduled', [])).toBe('scheduled');
  });

  it('follows queued moves in order, as an offline kick-off and final whistle arrive', () => {
    expect(statusAfter('scheduled', ['live'])).toBe('live');
    expect(statusAfter('scheduled', ['live', 'finished'])).toBe('finished');
    expect(statusAfter('finished', ['live'])).toBe('live');
  });

  it('ignores a queued move the database would refuse', () => {
    expect(statusAfter('scheduled', ['finished'])).toBe('scheduled');
    expect(statusAfter('live', ['live', 'finished'])).toBe('finished');
  });
});
