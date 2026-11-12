import { useMemo } from 'react';
import { useActiveClub } from '../../lib/club';
import { LastMatchSection } from './LastMatchSection';
import { focusNeed, matchStrip, pickMatches, type MatchStrip } from './matchModel';
import { buildNeeds, buildRings, MAX_NEEDS, stageOf, type TodayInput } from './model';
import { NeedsSection, type AnyNeed } from './NeedsSection';
import { RingsSection } from './RingsSection';
import { DemoStart, SetupSection } from './SetupSection';
import { useMatchEvents, type Source } from './useToday';

/** The season's sections, once every read has arrived. */
export function TodayBody({ input }: { readonly input: TodayInput }) {
  const club = useActiveClub();
  const { live, last } = useMemo(() => pickMatches(input.matches), [input.matches]);
  const events = useMatchEvents(last?.id ?? null);
  const rings = useMemo(() => buildRings(input), [input]);
  const seasonNeeds = useMemo(() => buildNeeds(input), [input]);

  const strip = useMemo((): Source<MatchStrip> => {
    if (events.status === 'error') return events;
    if (events.status === 'loading' || last === null) return { status: 'loading' };
    return { status: 'ready', data: matchStrip(last, events.data) };
  }, [events, last]);

  const needs = useMemo((): AnyNeed[] => {
    const focus =
      events.status === 'ready' && last !== null ? focusNeed(last.id, events.data) : null;
    // Wellbeing first, then the session the last match suggests, then fairness and the pitch.
    const load = seasonNeeds.filter((need) => need.kind === 'load');
    const others = seasonNeeds.filter((need) => need.kind !== 'load');
    const ordered: AnyNeed[] = [...load, ...(focus === null ? [] : [focus]), ...others];
    return ordered.slice(0, MAX_NEEDS);
  }, [events, last, seasonNeeds]);

  const stage = stageOf({
    players: input.players.length,
    matches: input.matches.length,
    sessions: input.sessions.length,
    isDemo: club.isDemo,
  });

  if (stage.kind === 'demo-empty') return <DemoStart />;
  const matchSection = input.matches.length > 0 && (
    <LastMatchSection live={live} last={last} strip={strip} />
  );
  return (
    <>
      {/* A match being played right now comes before the season. */}
      {live !== null && matchSection}
      {stage.kind === 'setup' && <SetupSection steps={stage.steps} current={stage.current} />}
      {input.players.length > 0 && <RingsSection rings={rings} />}
      {input.players.length > 0 && <NeedsSection needs={needs} />}
      {live === null && matchSection}
    </>
  );
}
