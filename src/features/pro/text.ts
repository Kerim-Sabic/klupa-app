import type { TFunction } from 'i18next';
import type { ProMatchSummary } from '../../engine/pro';
import { resultNote, stageKey } from './listModel';

/** A stage in the reader's language ("Final", "Grupa C"). */
export function stageLabel(t: TFunction, stage: string): string {
  const key = stageKey(stage);
  if (key.key === 'group') return t('pro.stage.group', { letter: key.letter });
  if (key.key === 'other') return key.name;
  return t(`pro.stage.${key.key}`);
}

/** A competition by id in the reader's language, or as the file names it. */
export function competitionLabel(t: TFunction, id: string, fallback: string): string {
  return t(`pro.competition.${id}`, { defaultValue: fallback });
}

/** A national team in the reader's language ("Francuska"), or as the data names it. */
export function teamLabel(t: TFunction, name: string): string {
  return t(`pro.team.${name}`, { defaultValue: name });
}

/** "France 4–2 Croatia", with the teams named in the reader's language. */
export function scoreLine(
  t: TFunction,
  match: Pick<ProMatchSummary, 'home' | 'away' | 'score'>,
): string {
  return `${teamLabel(t, match.home)} ${String(match.score[0])}–${String(match.score[1])} ${teamLabel(t, match.away)}`;
}

/** "5–3 on penalties", "After extra time", or null for a match settled in ninety minutes. */
export function noteText(
  t: TFunction,
  match: Pick<ProMatchSummary, 'extraTime' | 'shootout'>,
): string | null {
  const note = resultNote(match);
  if (note === null) return null;
  if (note.kind === 'penalties') {
    return t('pro.result.penalties', { home: note.home, away: note.away });
  }
  return t('pro.result.extraTime');
}
