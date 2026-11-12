import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Goal, Pair, ProMatch, TeamIndex } from '../../engine/pro';
import { formatDate } from '../../lib/dates';
import { Stage } from '../../ui';
import { competitionLabel, noteText, stageLabel, teamLabel } from './text';

const TEAM_TEXT: Readonly<Record<TeamIndex, string>> = { 0: 'text-home', 1: 'text-away' };

/** "38' A. Griezmann (pen)". */
export function goalLine(t: TFunction, goal: Goal): string {
  const tag = goal.penalty ? ` ${t('pro.goal.pen')}` : goal.ownGoal ? ` ${t('pro.goal.og')}` : '';
  return `${goal.minute.label}' ${goal.scorer ?? t('pro.goal.unknown')}${tag}`;
}

/** What a screen reader hears when a goal goes in during a replay. */
export function goalAnnouncement(t: TFunction, goal: Goal, teams: Pair<string>): string {
  const detail = goal.penalty ? t('pro.goal.penalty') : goal.ownGoal ? t('pro.goal.ownGoal') : '';
  return t('pro.goal.announce', {
    minute: goal.minute.label,
    team: teams[goal.team],
    scorer: goal.scorer ?? t('pro.goal.unknown'),
    detail: detail === '' ? '' : `, ${detail}`,
  });
}

function GoalList({ goals, team }: { readonly goals: readonly Goal[]; readonly team: TeamIndex }) {
  const { t } = useTranslation();
  const mine = goals.filter((goal) => goal.team === team);
  if (mine.length === 0) return <div />;
  return (
    <ul
      className={`flex flex-col gap-0.5 text-footnote text-ink-soft ${team === 0 ? 'text-right' : 'text-left'}`}
    >
      {mine.map((goal) => (
        <li key={goal.index} className="tabular-nums">
          {goalLine(t, goal)}
        </li>
      ))}
    </ul>
  );
}

interface ScoreboardProps {
  readonly match: ProMatch;
  readonly competitionName: string;
  readonly score: Pair<number>;
  readonly goals: readonly Goal[];
  readonly fullTime: boolean;
  /** A goal that has just gone in during a replay, shown briefly over the board. */
  readonly flash: Goal | null;
}

/** Stage, date and ground; the two teams in their colours; the score so far; who scored. */
export function Scoreboard({
  match,
  competitionName,
  score,
  goals,
  fullTime,
  flash,
}: ScoreboardProps) {
  const { t, i18n } = useTranslation();
  const names: Pair<string> = [
    teamLabel(t, match.teams[0].name),
    teamLabel(t, match.teams[1].name),
  ];
  const note = fullTime
    ? noteText(t, { extraTime: match.periods.length > 2, shootout: match.shootout })
    : null;
  const meta = [
    competitionLabel(t, match.competition, competitionName),
    stageLabel(t, match.stage),
    formatDate(match.date, i18n.language, 'long'),
    match.venue,
  ].filter((part) => part !== '');

  return (
    <Stage as="section" aria-labelledby="pro-score" className="p-4 sm:p-7">
      <h2 id="pro-score" className="sr-only">
        {t('pro.score.title')}
      </h2>
      <p className="text-center text-footnote text-pretty text-ink-soft">{meta.join(' · ')}</p>
      <p className="sr-only">
        {t('pro.score.text', {
          home: names[0],
          away: names[1],
          homeGoals: score[0],
          awayGoals: score[1],
        })}
      </p>
      <div
        aria-hidden="true"
        className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6"
      >
        <span
          className={`text-right font-title text-[20px] leading-tight text-balance sm:text-title ${TEAM_TEXT[0]}`}
        >
          {names[0]}
        </span>
        <span className="font-score text-[68px] text-ink tabular-nums sm:text-[104px]">
          {`${String(score[0])} : ${String(score[1])}`}
        </span>
        <span
          className={`font-title text-[20px] leading-tight text-balance sm:text-title ${TEAM_TEXT[1]}`}
        >
          {names[1]}
        </span>
      </div>
      {note !== null && (
        <p className="mt-2 text-center text-footnote font-semibold text-ink">{note}</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-6 sm:gap-16">
        <GoalList goals={goals} team={0} />
        <GoalList goals={goals} team={1} />
      </div>
      <AnimatePresence>
        {flash !== null && (
          <motion.div
            key={flash.index}
            aria-hidden="true"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className="absolute inset-x-3 top-3 flex items-center justify-center gap-2 rounded-control bg-ink px-4 py-2.5 text-on-ink shadow-float"
          >
            <span className="font-display text-[20px]">{t('pro.goal.flash')}</span>
            <span className="text-[15px] font-semibold">{`${names[flash.team]} · ${goalLine(t, flash)}`}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </Stage>
  );
}
