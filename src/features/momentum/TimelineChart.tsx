import { motion, useReducedMotionConfig } from 'motion/react';
import { useRef, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MomentumReading, Side } from '../../engine';
import {
  clampLabel,
  formatClock,
  formatXg,
  linearScale,
  markRadius,
  minuteTicks,
  nearestIndex,
  niceCeiling,
  runSpan,
  stateRuns,
  stepAreaPath,
  stepLinePath,
  timeAtOffset,
} from './chartModel';
import { HatchPattern, stateFill, useSvgId } from './StateSwatch';
import { StateTimeTable } from './StateTimeTable';
import { useElementWidth } from './useElementWidth';

/** A shot on the timeline: when, whose, how good, and whether it went in. */
export interface ShotMark {
  readonly id: string;
  readonly t: number;
  readonly side: Side;
  /** Chance quality in 1/10,000 units. */
  readonly weight: number;
  readonly goal: boolean;
}

// Pixel layout. The SVG is drawn at its measured width so text stays at its real size.
const HEIGHT = 244;
const PAD_X = 14;
const LANE = { home: 16, away: 176 } as const;
const PLOT = { top: 40, zero: 96, bottom: 152 } as const;
const STRIP = { y: 194, height: 16 } as const;
const AXIS_Y = 214;
const MAX_MARK = 10;
const CURSOR_LABEL_WIDTH = 50;
const FALLBACK_WIDTH = 640;

interface TimelineChartProps {
  readonly readings: readonly MomentumReading[];
  readonly marks: readonly ShotMark[];
  readonly durationSeconds: number;
  readonly windowIndex: number;
  readonly cursorIndex: number;
  readonly sideNames: Readonly<Record<Side, string>>;
  /** Full text alternative for the chart. */
  readonly label: string;
  /** Called with the reading index under the pointer while scrubbing. */
  readonly onScrub: (index: number) => void;
  /**
   * Draw the line in when it changes (default). Off while a match replays as live, where the
   * line grows several times a second and a redraw each time would flicker.
   */
  readonly animate?: boolean;
}

/** Chance balance for one window, the chances themselves, and the conclusion strip. */
export function TimelineChart(props: TimelineChartProps) {
  const { readings, marks, durationSeconds, windowIndex, cursorIndex, sideNames } = props;
  const { i18n } = useTranslation();
  const reduced = useReducedMotionConfig() === true || props.animate === false;
  const { ref, width } = useElementWidth(FALLBACK_WIDTH);
  const hatchId = useSvgId('strip-hatch');
  const dragging = useRef(false);

  const x = linearScale([0, durationSeconds], [PAD_X, width - PAD_X]);
  const values = readings.map((reading) => reading.windows[windowIndex]?.differential ?? 0);
  const ceiling = niceCeiling(Math.max(1, ...values.map((value) => Math.abs(value))));
  const y = linearScale([-ceiling, ceiling], [PLOT.bottom, PLOT.top]);
  const points = (clamp: (value: number) => number) =>
    readings.map((reading, index) => ({ x: x(reading.t), y: y(clamp(values[index] ?? 0)) }));
  const endX = x(durationSeconds);
  const times = readings.map((reading) => reading.t);
  const cursor = readings[cursorIndex];
  const cursorValue = values[cursorIndex] ?? 0;

  function scrub(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const time = timeAtOffset(
      event.clientX - rect.left - PAD_X,
      rect.width - 2 * PAD_X,
      durationSeconds,
    );
    const index = nearestIndex(times, time);
    if (index >= 0 && index !== cursorIndex) props.onScrub(index);
  }

  return (
    <div ref={ref} className="w-full">
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${String(width)} ${String(HEIGHT)}`}
        role="img"
        aria-label={props.label}
        className="block cursor-ew-resize touch-pan-y select-none"
        onPointerDown={(event) => {
          dragging.current = true;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Capture is a nicety (keeps the drag when the finger leaves the chart).
          }
          scrub(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) scrub(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <defs>
          <HatchPattern id={hatchId} />
        </defs>

        {/* Scale: the zero line and one round gridline each way, labelled in xG. */}
        <line x1={PAD_X} x2={endX} y1={PLOT.zero} y2={PLOT.zero} className="stroke-mute" />
        {[ceiling, -ceiling].map((value) => (
          <g key={value}>
            <line
              x1={PAD_X}
              x2={endX}
              y1={y(value)}
              y2={y(value)}
              className="stroke-line"
              strokeDasharray="2 4"
            />
            <text
              x={endX}
              y={y(value) - 4}
              textAnchor="end"
              className="fill-ink-soft text-[11px] tabular-nums"
            >
              {formatXg(Math.abs(value), i18n.language)}
            </text>
          </g>
        ))}

        <path
          d={stepAreaPath(
            points((v) => Math.max(v, 0)),
            PLOT.zero,
            endX,
          )}
          className="fill-home/30"
        />
        <path
          d={stepAreaPath(
            points((v) => Math.min(v, 0)),
            PLOT.zero,
            endX,
          )}
          className="fill-away/30"
        />
        <motion.path
          key={`${String(windowIndex)}-${String(durationSeconds)}-${String(readings.length)}`}
          d={stepLinePath(
            points((v) => v),
            endX,
          )}
          className="fill-none stroke-ink"
          strokeWidth={2}
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0 : 0.42, ease: [0.2, 0.8, 0.2, 1] }}
        />

        {marks.map((mark) => {
          const r = markRadius(mark.weight, MAX_MARK);
          const cy = LANE[mark.side];
          return (
            <g key={mark.id}>
              <circle
                cx={x(mark.t)}
                cy={cy}
                r={r}
                className={
                  mark.side === 'home' ? 'fill-home/55 stroke-home' : 'fill-away/55 stroke-away'
                }
              />
              {mark.goal && (
                <circle
                  cx={x(mark.t)}
                  cy={cy}
                  r={r + 3}
                  className="fill-none stroke-ink"
                  strokeWidth={1.5}
                />
              )}
            </g>
          );
        })}

        {stateRuns(readings).map((run) => {
          const span = runSpan(run, readings, durationSeconds);
          return (
            <rect
              key={run.fromIndex}
              data-state={run.state}
              x={x(span.from)}
              y={STRIP.y}
              width={Math.max(x(span.to) - x(span.from), 1)}
              height={STRIP.height}
              {...stateFill(run.state, hatchId)}
            />
          );
        })}

        {minuteTicks(durationSeconds).map((tick) => (
          <g key={tick.seconds}>
            <line
              x1={x(tick.seconds)}
              x2={x(tick.seconds)}
              y1={AXIS_Y}
              y2={AXIS_Y + (tick.major ? 6 : 3)}
              className="stroke-mute"
            />
            {tick.major && (
              <text
                x={x(tick.seconds)}
                y={AXIS_Y + 20}
                textAnchor="middle"
                className="fill-ink-soft text-[11px] tabular-nums"
              >
                {`${String(tick.seconds / 60)}'`}
              </text>
            )}
          </g>
        ))}

        {cursor !== undefined && (
          <g pointerEvents="none">
            <line
              x1={x(cursor.t)}
              x2={x(cursor.t)}
              y1={PLOT.top - 14}
              y2={STRIP.y + STRIP.height}
              className="stroke-ink"
              strokeWidth={1.5}
            />
            <circle
              cx={x(cursor.t)}
              cy={y(cursorValue)}
              r={4}
              className="fill-ink stroke-raised"
              strokeWidth={2}
            />
            <rect
              x={clampLabel(x(cursor.t), CURSOR_LABEL_WIDTH, width) - CURSOR_LABEL_WIDTH / 2}
              y={AXIS_Y + 6}
              width={CURSOR_LABEL_WIDTH}
              height={20}
              rx={10}
              className="fill-ink"
            />
            <text
              x={clampLabel(x(cursor.t), CURSOR_LABEL_WIDTH, width)}
              y={AXIS_Y + 20}
              textAnchor="middle"
              className="fill-on-ink text-[12px] font-semibold tabular-nums"
            >
              {formatClock(cursor.t)}
            </text>
          </g>
        )}

        {/* Drawn last, with a halo in the card's colour, so the cursor line never cuts a name. */}
        <text
          x={PAD_X}
          y={PLOT.top - 4}
          className="fill-home stroke-raised stroke-[4px] [paint-order:stroke] [stroke-linejoin:round] text-[11px] font-semibold"
        >
          {`▲ ${sideNames.home}`}
        </text>
        <text
          x={PAD_X}
          y={PLOT.bottom + 13}
          className="fill-away stroke-raised stroke-[4px] [paint-order:stroke] [stroke-linejoin:round] text-[11px] font-semibold"
        >
          {`▼ ${sideNames.away}`}
        </text>
      </svg>

      <StateTimeTable readings={readings} durationSeconds={durationSeconds} />
    </div>
  );
}
