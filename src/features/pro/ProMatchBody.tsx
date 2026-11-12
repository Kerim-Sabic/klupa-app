import { useReducedMotionConfig } from 'motion/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  goalSequences,
  matchClock,
  type Pair,
  type ProIndex,
  type ProMatch,
} from '../../engine/pro';
import { ShotMap } from '../momentum/ShotMap';
import { Card, PageHeader } from '../../ui';
import { GoalReplay } from './GoalReplay';
import { LiveBar } from './LiveBar';
import { NetworkCard } from './NetworkCard';
import { TerritoryCard } from './TerritoryCard';
import { NumbersCard } from './NumbersCard';
import { OnTopCard } from './OnTopCard';
import { PlayersCard } from './PlayersCard';
import { RaceChart } from './RaceChart';
import { Scoreboard, goalAnnouncement } from './Scoreboard';
import { Section } from './Section';
import { SourceCard } from './SourceCard';
import { usePlayback } from './usePlayback';
import { goalPlayheads, matchView } from './view';
import { teamLabel } from './text';

/** A goal stays on the board for this long in wall-clock seconds during a replay. */
const FLASH_SECONDS = 3.5;

interface ProMatchBodyProps {
  readonly match: ProMatch;
  readonly index: ProIndex;
}

/**
 * The match screen. Every section is a pure function of the events up to the playhead; the page
 * opens at full time, so it reads as a finished analysis until someone asks to watch it as live.
 */
export function ProMatchBody({ match, index }: ProMatchBodyProps) {
  const { t } = useTranslation();
  const reduced = useReducedMotionConfig() === true;
  const clock = useMemo(() => matchClock(match), [match]);
  const { state, dispatch } = usePlayback(clock.total);
  const view = useMemo(
    () => matchView(match, clock, state.playhead),
    [match, clock, state.playhead],
  );
  const full = useMemo(() => matchView(match, clock, clock.total), [match, clock]);
  const goalTimes = useMemo(() => goalPlayheads(match, clock), [match, clock]);
  const sequences = useMemo(() => goalSequences(match), [match]);
  const replays = sequences.slice(0, view.goals.length);
  const names: Pair<string> = [
    teamLabel(t, match.teams[0].name),
    teamLabel(t, match.teams[1].name),
  ];
  const sideNames = { home: names[0], away: names[1] };
  const competition = index.competitions.find((c) => c.id === match.competition)?.name ?? '';

  // The goal just scored, derived from the playhead: no timers, nothing to clean up.
  const lastGoal = view.goals.length > 0 ? view.goals[view.goals.length - 1] : undefined;
  const lastGoalAt = goalTimes[view.goals.length - 1] ?? -Infinity;
  const recent = state.playing && state.playhead - lastGoalAt < FLASH_SECONDS * state.speed;
  const flash = recent && lastGoal !== undefined ? lastGoal : null;

  return (
    <article className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <PageHeader
          title={t('pro.match.title', { home: names[0], away: names[1] })}
          back={{ to: '/pro', label: t('pro.match.back') }}
        />
        <Scoreboard
          match={match}
          competitionName={competition}
          score={view.score}
          goals={view.goals}
          fullTime={view.fullTime}
          flash={flash}
        />
      </div>
      {/* A direct child of the article, so that while a match is being watched the transport
          stays under the header all the way down the page. At full time it scrolls away like
          any other block and gives the phone its screen back. */}
      <div className={view.fullTime ? '-mt-6' : 'sticky top-16 z-20 -mt-6'}>
        <LiveBar
          state={state}
          dispatch={dispatch}
          clock={clock}
          moment={view.moment}
          score={view.score}
          goals={full.goals.map((goal, i) => ({ playhead: goalTimes[i] ?? 0, team: goal.team }))}
          reduced={reduced}
          announcement={flash === null ? '' : goalAnnouncement(t, flash, names)}
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        <Section id="pro-numbers" title={t('pro.numbers.title')}>
          <NumbersCard stats={view.stats} names={names} />
        </Section>
        <Section id="pro-race" title={t('pro.race.title')} intro={t('pro.race.intro')}>
          <RaceChart
            race={view.race}
            clock={clock}
            playhead={state.playhead}
            goals={view.goals}
            ceilingUnits={Math.max(full.stats[0].xgUnits, full.stats[1].xgUnits)}
            names={names}
          />
        </Section>
      </div>

      <Section id="pro-top" title={t('pro.top.title')} intro={t('pro.top.intro')}>
        <OnTopCard
          review={view.review}
          clock={clock}
          moment={view.moment}
          playing={state.playing}
          fullTime={view.fullTime}
          sideNames={sideNames}
          matchId={match.id}
        />
      </Section>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        <Section id="pro-shots" title={t('pro.shots.title')} intro={t('pro.shots.intro')}>
          <Card>
            <ShotMap events={view.chances} sideNames={sideNames} note={t('pro.shots.note')} />
          </Card>
        </Section>
        <Section id="pro-network" title={t('pro.network.title')} intro={t('pro.network.intro')}>
          <NetworkCard players={match.players} events={view.events} names={names} />
        </Section>
      </div>

      <div className="flex flex-col gap-10">
        <Section
          id="pro-territory"
          title={t('pro.territory.title')}
          intro={t('pro.territory.intro')}
        >
          <TerritoryCard events={view.events} names={names} />
        </Section>
        <Section id="pro-goals" title={t('pro.replay.title')} intro={t('pro.replay.intro')}>
          {replays.length === 0 ? (
            <p className="rounded-card border border-dashed border-line px-4 py-8 text-center text-ink-soft">
              {t(view.fullTime ? 'pro.replay.none' : 'pro.replay.noneYet')}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {replays.map((sequence) => (
                <GoalReplay key={sequence.goal.index} sequence={sequence} names={names} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section id="pro-players" title={t('pro.players.title')} intro={t('pro.players.intro')}>
        <PlayersCard players={view.players} names={names} />
      </Section>

      <Section id="pro-source" title={t('pro.source.title')}>
        <SourceCard source={index.source} />
      </Section>
    </article>
  );
}
