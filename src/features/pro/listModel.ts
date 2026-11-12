import type { ProMatchSummary } from '../../engine/pro';

/** Knockout rounds from the last backwards; group stages follow, in letter order. */
export const KNOCKOUT_STAGES = [
  'Final',
  'Third place',
  'Semi-finals',
  'Quarter-finals',
  'Round of 16',
] as const;

export interface StageGroup {
  readonly stage: string;
  readonly matches: readonly ProMatchSummary[];
}

function stageRank(stage: string): number {
  const knockout = KNOCKOUT_STAGES.indexOf(stage as (typeof KNOCKOUT_STAGES)[number]);
  return knockout >= 0 ? knockout : KNOCKOUT_STAGES.length;
}

/** Lower case, accents removed: "Mbappé" is found by "mbappe" and "Türkiye" by "turk". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * Whether a match involves a team whose name contains the query (empty query: every match).
 * A team is found by the name in the data and by the name the reader sees (`label`), so
 * "Croatia" and "Hrvatska" both find the same matches.
 */
export function matchesTeam(
  match: ProMatchSummary,
  query: string,
  label: (team: string) => string = (team) => team,
): boolean {
  const needle = foldText(query);
  if (needle === '') return true;
  return [match.home, match.away].some(
    (team) => foldText(team).includes(needle) || foldText(label(team)).includes(needle),
  );
}

/**
 * One competition's matches grouped by stage, the final first and the group stages last, each
 * group in date order. Groups left empty by the search are dropped.
 */
export function groupByStage(
  matches: readonly ProMatchSummary[],
  competition: string,
  query = '',
  label?: (team: string) => string,
): StageGroup[] {
  const groups = new Map<string, ProMatchSummary[]>();
  for (const match of matches) {
    if (match.competition !== competition || !matchesTeam(match, query, label)) continue;
    const list = groups.get(match.stage) ?? [];
    list.push(match);
    groups.set(match.stage, list);
  }
  return [...groups.entries()]
    .map(([stage, list]) => ({
      stage,
      matches: [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id),
    }))
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || a.stage.localeCompare(b.stage));
}

/** The final of each competition, in the order the competitions are listed. */
export function finalsOf(
  matches: readonly ProMatchSummary[],
  competitions: readonly { readonly id: string }[],
): ProMatchSummary[] {
  return competitions.flatMap((competition) =>
    matches.filter((match) => match.competition === competition.id && match.stage === 'Final'),
  );
}

/** How a match was settled beyond ninety minutes, if it was. */
export type ResultNote =
  | { readonly kind: 'penalties'; readonly home: number; readonly away: number }
  | { readonly kind: 'extraTime' }
  | null;

export function resultNote(match: Pick<ProMatchSummary, 'extraTime' | 'shootout'>): ResultNote {
  if (match.shootout !== null) {
    return { kind: 'penalties', home: match.shootout[0], away: match.shootout[1] };
  }
  return match.extraTime ? { kind: 'extraTime' } : null;
}

/** Stage names as translation keys; a group carries its letter. */
export type StageKey =
  | { readonly key: 'final' | 'thirdPlace' | 'semi' | 'quarter' | 'r16' }
  | { readonly key: 'group'; readonly letter: string }
  | { readonly key: 'other'; readonly name: string };

const STAGE_KEYS: Readonly<Record<string, 'final' | 'thirdPlace' | 'semi' | 'quarter' | 'r16'>> = {
  Final: 'final',
  'Third place': 'thirdPlace',
  'Semi-finals': 'semi',
  'Quarter-finals': 'quarter',
  'Round of 16': 'r16',
};

export function stageKey(stage: string): StageKey {
  const known = STAGE_KEYS[stage];
  if (known !== undefined) return { key: known };
  const group = /^Group ([A-Z])$/.exec(stage);
  if (group?.[1] !== undefined) return { key: 'group', letter: group[1] };
  return { key: 'other', name: stage };
}
