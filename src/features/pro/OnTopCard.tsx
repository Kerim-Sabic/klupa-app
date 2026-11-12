import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Side } from '../../engine';
import type { ClockMoment, MatchClock } from '../../engine/pro';
import { formatClock, formatXg } from '../momentum/chartModel';
import { MomentumExplorer } from '../momentum/MomentumExplorer';
import { evidenceOf, shotMarks, type ReviewEvent } from '../momentum/reviewModel';
import { Segmented } from '../../ui';

/** The engine needs at least one five-second step to read a period. */
const MIN_SECONDS = 5;

/**
 * "Who was on top", exactly as a coach's match is read: the momentum explorer on the pro events
 * mapped to the coach's taps, one period at a time. While replaying, only periods that have
 * started can be chosen, the running one is read up to the playhead, and the view follows play.
 */
export function OnTopCard({
  review,
  clock,
  moment,
  playing,
  fullTime,
  sideNames,
  matchId,
}: {
  readonly review: readonly ReviewEvent[];
  readonly clock: MatchClock;
  readonly moment: ClockMoment;
  readonly playing: boolean;
  readonly fullTime: boolean;
  readonly sideNames: Readonly<Record<Side, string>>;
  readonly matchId: number;
}) {
  const { t, i18n } = useTranslation();
  const [choice, setChoice] = useState<string | null>(null);
  const evidence = useMemo(() => evidenceOf(review), [review]);
  const byId = useMemo(() => new Map(review.map((row) => [row.id, row])), [review]);
  const started = clock.spans.filter((span) => fullTime || span.period <= moment.period);
  const fallback = fullTime ? 1 : moment.period;
  const wanted = playing ? moment.period : choice === null ? fallback : Number(choice);
  const span =
    started.find((candidate) => candidate.period === wanted) ?? started[started.length - 1];
  if (span === undefined) return null;
  const length = span.to - span.from;
  const live = !fullTime && span.period === moment.period;
  const duration = Math.max(live ? Math.min(moment.t, length) : length, MIN_SECONDS);

  return (
    <MomentumExplorer
      events={evidence}
      marks={shotMarks(review, span.period)}
      period={span.period}
      durationSeconds={duration}
      sideNames={sideNames}
      resetKey={`${String(matchId)}:${String(span.period)}`}
      animate={!playing}
      describeEvent={(event) => {
        const row = byId.get(event.id);
        return t('review.evidenceItem', {
          time: formatClock(event.t),
          actor: sideNames[row?.side ?? event.side],
          kind: row === undefined ? '' : t(`review.kind.${row.kind}`),
          value: formatXg(event.weight, i18n.language),
        });
      }}
      controls={
        <Segmented
          label={t('pro.top.period')}
          value={String(span.period)}
          onChange={setChoice}
          disabled={playing}
          options={started.map((candidate) => ({
            value: String(candidate.period),
            label: t(`pro.top.periodName.${String(candidate.period)}`),
          }))}
        />
      }
    />
  );
}
