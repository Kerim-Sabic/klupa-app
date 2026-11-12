import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_WINDOWS_SECONDS,
  MOMENTUM_STATES,
  momentumSeries,
  summariseSeries,
  type EvidenceEvent,
  type MomentumState,
  type Side,
} from '../../engine';
import { Card, Segmented, Stat, type StatTone } from '../../ui';
import { defaultCursor, formatClock, formatPercent } from './chartModel';
import { ReadingPanel } from './ReadingPanel';
import { StateSwatch } from './StateSwatch';
import { TimelineChart, type ShotMark } from './TimelineChart';

const STEP_SECONDS = 5;
const DEFAULT_WINDOW = String(DEFAULT_WINDOWS_SECONDS[1] ?? 300);

const STATE_TONE: Readonly<Record<MomentumState, StatTone>> = {
  stable: 'pitch',
  'event-sensitive': 'amber',
  'window-sensitive': 'clay',
  level: 'ink',
  insufficient: 'ink',
};

export interface MomentumExplorerProps {
  /** Evidence for the whole match; the engine reads only the chosen period. */
  readonly events: readonly EvidenceEvent[];
  /** Shots to draw for the chosen period. */
  readonly marks: readonly ShotMark[];
  readonly period: number;
  readonly durationSeconds: number;
  readonly sideNames: Readonly<Record<Side, string>>;
  /** Changing it sends the cursor back to its default moment (new match or period). */
  readonly resetKey: string;
  /** Extra controls shown before the window choice, such as a match or period picker. */
  readonly controls?: ReactNode;
  readonly describeEvent?: (event: EvidenceEvent) => string;
  /** Draw the line in on change (default true); see `TimelineChart`. */
  readonly animate?: boolean;
}

/** One period: the chart, a cursor you can drag, the reading at the cursor, and the shares. */
export function MomentumExplorer(props: MomentumExplorerProps) {
  const { events, marks, period, durationSeconds, sideNames, resetKey } = props;
  const { t, i18n } = useTranslation();
  const sliderId = useId();
  const [windowValue, setWindowValue] = useState(DEFAULT_WINDOW);
  const [chosen, setChosen] = useState<{ key: string; index: number } | null>(null);

  const readings = useMemo(
    () => momentumSeries(events, period, durationSeconds, STEP_SECONDS),
    [events, period, durationSeconds],
  );
  const summary = useMemo(() => summariseSeries(readings), [readings]);
  const cursorIndex = chosen?.key === resetKey ? chosen.index : defaultCursor(readings);
  const reading = readings[cursorIndex];
  const windowIndex = Math.max(
    DEFAULT_WINDOWS_SECONDS.findIndex((seconds) => String(seconds) === windowValue),
    0,
  );
  const windowMinutes = (DEFAULT_WINDOWS_SECONDS[windowIndex] ?? 300) / 60;
  if (reading === undefined) return null;

  const moveTo = (index: number) => {
    setChosen({ key: resetKey, index });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        {props.controls}
        <Segmented
          label={t('lab.window')}
          value={windowValue}
          onChange={setWindowValue}
          options={DEFAULT_WINDOWS_SECONDS.map((seconds) => ({
            value: String(seconds),
            label: t('lab.windowOption', { minutes: seconds / 60 }),
          }))}
        />
      </div>

      <Card as="section" padded={false} className="overflow-hidden px-1 pt-3 pb-4 sm:px-3">
        <figure>
          <TimelineChart
            readings={readings}
            marks={marks}
            durationSeconds={durationSeconds}
            windowIndex={windowIndex}
            cursorIndex={cursorIndex}
            sideNames={sideNames}
            onScrub={moveTo}
            animate={props.animate ?? true}
            label={t('lab.chartLabel', {
              minutes: windowMinutes,
              period,
              home: sideNames.home,
              away: sideNames.away,
            })}
          />
          <figcaption className="px-3 text-[13px] text-ink-soft">{t('lab.stripLabel')}</figcaption>
        </figure>
        <label htmlFor={sliderId} className="mt-4 flex flex-col gap-1.5 px-3">
          <span className="text-[13px] font-semibold text-ink-soft">{t('lab.cursor')}</span>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={readings.length - 1}
            value={cursorIndex}
            aria-valuetext={t('lab.cursorValue', {
              time: formatClock(reading.t),
              state: t(`state.${reading.state}.label`),
            })}
            onChange={(event) => {
              moveTo(Number(event.target.value));
            }}
            className="min-h-11 w-full accent-ink"
          />
        </label>
      </Card>

      <ReadingPanel
        reading={reading}
        sideNames={sideNames}
        {...(props.describeEvent !== undefined && { describeEvent: props.describeEvent })}
      />

      <section aria-labelledby={`${sliderId}-summary`}>
        <h3 id={`${sliderId}-summary`} className="text-[17px] font-semibold text-ink">
          {t('lab.summaryTitle')}
        </h3>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MOMENTUM_STATES.map((state) => (
            <Card as="li" key={state} className="flex gap-2.5">
              <span className="pt-0.5">
                <StateSwatch state={state} />
              </span>
              <Stat
                label={t(`state.${state}.label`)}
                value={summary.grid === 0 ? 0 : summary.byState[state] / summary.grid}
                format={(share) => formatPercent(share, i18n.language)}
                tone={STATE_TONE[state]}
              />
            </Card>
          ))}
        </ul>
      </section>
    </div>
  );
}
