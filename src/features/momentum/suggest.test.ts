import { describe, expect, it } from 'vitest';
import type { Side } from '../../engine';
import {
  MAX_SUGGESTIONS,
  MIN_EVENTS,
  THRESHOLDS,
  suggestFocus,
  type SuggestEvent,
  type SuggestResult,
} from './suggest';

type Kind = SuggestEvent['kind'];

function many(count: number, side: Side, kind: Kind, weight = 0): SuggestEvent[] {
  return Array.from({ length: count }, () => ({ side, kind, weight }));
}

/** Neutral events that trigger no rule, to reach the minimum without changing the counts. */
function padding(count: number): SuggestEvent[] {
  return many(count, 'home', 'corner');
}

function padded(events: SuggestEvent[]): SuggestEvent[] {
  return [...events, ...padding(Math.max(0, MIN_EVENTS - events.length))];
}

function focuses(result: SuggestResult): string[] {
  if (result.status !== 'ok') throw new Error('expected suggestions');
  return result.suggestions.map((suggestion) => suggestion.focus);
}

describe('suggestFocus: evidence threshold', () => {
  it('says there is not enough evidence below the minimum', () => {
    expect(suggestFocus([])).toEqual({ status: 'insufficient', events: 0, minimum: MIN_EVENTS });
    const almost = many(MIN_EVENTS - 1, 'home', 'lost_ball_own_half');
    expect(suggestFocus(almost)).toEqual({
      status: 'insufficient',
      events: MIN_EVENTS - 1,
      minimum: MIN_EVENTS,
    });
  });

  it('suggests nothing when no count stands out', () => {
    expect(suggestFocus(padding(MIN_EVENTS))).toEqual({ status: 'ok', suggestions: [] });
  });
});

describe('suggestFocus: one rule at a time', () => {
  it('build-up: our own-half losses at the threshold, not below, and never the opponent', () => {
    const at = suggestFocus(padded(many(THRESHOLDS.lostOwnHalf, 'home', 'lost_ball_own_half')));
    expect(at).toEqual({
      status: 'ok',
      suggestions: [
        {
          focus: 'build_up',
          reasons: [{ code: 'lostOwnHalf', values: { lost: THRESHOLDS.lostOwnHalf } }],
          strength: 1,
        },
      ],
    });
    expect(focuses(suggestFocus(padded(many(5, 'home', 'lost_ball_own_half'))))).toEqual([]);
    expect(focuses(suggestFocus(padded(many(9, 'away', 'lost_ball_own_half'))))).toEqual([]);
  });

  it('finishing: many box entries with few shots', () => {
    const entries = many(11, 'home', 'box_entry');
    const result = suggestFocus(padded([...entries, ...many(2, 'home', 'shot_off_target')]));
    expect(result).toMatchObject({
      suggestions: [
        {
          focus: 'finishing',
          reasons: [{ code: 'entriesWithoutShots', values: { entries: 11, shots: 2 } }],
        },
      ],
    });
    // Goals and shots on target count as shots too.
    const shots = [...many(1, 'home', 'goal'), ...many(1, 'home', 'shot_on_target')];
    expect(focuses(suggestFocus(padded([...many(8, 'home', 'box_entry'), ...shots])))).toEqual([
      'finishing',
    ]);
    const tooManyShots = [...shots, ...many(1, 'home', 'shot_off_target')];
    expect(
      focuses(suggestFocus(padded([...many(8, 'home', 'box_entry'), ...tooManyShots]))),
    ).toEqual([]);
    expect(focuses(suggestFocus(padded(many(7, 'home', 'box_entry'))))).toEqual([]);
    expect(focuses(suggestFocus(padded(many(12, 'away', 'box_entry'))))).toEqual([]);
  });

  it('receiving under pressure: the opponent won the ball high up often', () => {
    // Two of our own keep the pressing rule out of this case.
    const ours = many(2, 'home', 'high_recovery');
    const result = suggestFocus(padded([...many(7, 'away', 'high_recovery'), ...ours]));
    expect(result).toMatchObject({
      suggestions: [
        {
          focus: 'receiving_under_pressure',
          reasons: [{ code: 'opponentHighRecoveries', values: { recoveries: 7 } }],
        },
      ],
    });
    expect(focuses(suggestFocus(padded([...many(5, 'away', 'high_recovery'), ...ours])))).toEqual(
      [],
    );
  });

  it('pressing: we rarely won the ball high, and recoveries were being tagged', () => {
    const tagged = [...many(1, 'home', 'high_recovery'), ...many(3, 'away', 'high_recovery')];
    expect(suggestFocus(padded(tagged))).toMatchObject({
      suggestions: [
        {
          focus: 'pressing',
          reasons: [{ code: 'fewHighRecoveries', values: { ours: 1, theirs: 3 } }],
        },
      ],
    });
    // Too few recoveries tagged at all: the coach may simply not have tagged them.
    const untagged = [...many(1, 'home', 'high_recovery'), ...many(2, 'away', 'high_recovery')];
    expect(focuses(suggestFocus(padded(untagged)))).toEqual([]);
    const enough = [...many(2, 'home', 'high_recovery'), ...many(4, 'away', 'high_recovery')];
    expect(focuses(suggestFocus(padded(enough)))).toEqual([]);
  });

  it('one-v-one defending: opponent chance quality much higher than ours', () => {
    const theirs = [...many(1, 'away', 'goal', 4000), ...many(1, 'away', 'shot_on_target', 2000)];
    const ours = many(1, 'home', 'shot_off_target', 1000);
    expect(suggestFocus(padded([...theirs, ...ours]))).toMatchObject({
      suggestions: [
        {
          focus: 'one_v_one_defending',
          reasons: [{ code: 'chanceQualityGap', values: { ours: 1000, theirs: 6000 } }],
        },
      ],
    });
    // Double but under half a goal apart: not enough.
    const small = [...many(1, 'away', 'shot_on_target', 900), ...many(1, 'home', 'goal', 400)];
    expect(focuses(suggestFocus(padded(small)))).toEqual([]);
    // Far apart but not double: not enough either.
    const close = [...many(2, 'away', 'goal', 9000), ...many(1, 'home', 'goal', 10_000)];
    expect(focuses(suggestFocus(padded(close)))).toEqual([]);
    // Territory tags never count as chance quality.
    const territory = [...many(1, 'away', 'big_chance', 9000), ...many(1, 'away', 'corner', 9000)];
    expect(focuses(suggestFocus(padded(territory)))).toEqual([]);
  });
});

describe('suggestFocus: choosing between rules', () => {
  it('returns at most two, strongest first', () => {
    const events = [
      ...many(6, 'home', 'lost_ball_own_half'),
      ...many(15, 'away', 'high_recovery'),
      ...many(2, 'home', 'high_recovery'),
      ...many(16, 'home', 'box_entry'),
    ];
    const result = suggestFocus(events);
    expect(focuses(result)).toEqual(['receiving_under_pressure', 'finishing']);
    expect(focuses(result)).toHaveLength(MAX_SUGGESTIONS);
  });

  it('keeps rule order when strengths tie', () => {
    const events = [...many(6, 'home', 'lost_ball_own_half'), ...many(8, 'home', 'box_entry')];
    expect(focuses(suggestFocus(events))).toEqual(['build_up', 'finishing']);
  });
});
