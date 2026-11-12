import { useId, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  distanceToGoal,
  HALF_DEPTH,
  HALF_WIDTH,
  locationToSvg,
  MARKINGS,
  nudge,
  PENALTY_SPOT,
  pointerToLocation,
  VIEW,
  type PitchLocation,
} from './pitch';

export interface PitchPickerProps {
  readonly location: PitchLocation | null;
  readonly onChange: (location: PitchLocation) => void;
}

const LINE = 'fill-none stroke-pitch [stroke-width:3]';

/**
 * The attacking half, goal at the top. The whole drawing (margin included) is one big button,
 * so a tap just outside a line still lands on the nearest edge. Arrow keys nudge the marker.
 */
export function PitchPicker({ location, onChange }: PitchPickerProps) {
  const { t } = useTranslation();
  const statusId = useId();
  const svg = useRef<SVGSVGElement>(null);

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    // A keyboard press arrives as a click with no pointer: drop the marker where nudging starts.
    if (event.detail === 0) {
      if (location === null) onChange(PENALTY_SPOT);
      return;
    }
    const box = svg.current?.getBoundingClientRect();
    if (box === undefined) return;
    onChange(pointerToLocation(event.clientX, event.clientY, box));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nudge(location, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
  }

  const marker = location === null ? null : locationToSvg(location);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label={t('matches.shot.pitchLabel')}
        aria-describedby={statusId}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="block w-full cursor-crosshair touch-manipulation overflow-hidden rounded-control border border-line bg-pitch-soft p-0"
      >
        <svg
          ref={svg}
          aria-hidden="true"
          viewBox={`${String(VIEW.x)} ${String(VIEW.y)} ${String(VIEW.width)} ${String(VIEW.height)}`}
          className="block h-auto w-full"
        >
          <rect x={0} y={0} width={HALF_WIDTH} height={HALF_DEPTH} className={LINE} />
          <rect {...MARKINGS.penaltyArea} className={LINE} />
          <rect {...MARKINGS.sixYardBox} className={LINE} />
          <rect {...MARKINGS.goal} className="fill-raised stroke-pitch [stroke-width:3]" />
          <path d={MARKINGS.arc} className={LINE} />
          <path d={MARKINGS.centreArc} className={LINE} />
          <circle {...MARKINGS.penaltySpot} r={4} className="fill-pitch" />
          {marker !== null && (
            <g data-testid="pitch-marker">
              <circle cx={marker.sx} cy={marker.sy} r={22} className="fill-ink/15" />
              <circle
                cx={marker.sx}
                cy={marker.sy}
                r={11}
                className="fill-ink stroke-raised [stroke-width:4]"
              />
            </g>
          )}
        </svg>
      </button>
      <p id={statusId} aria-live="polite" className="min-h-5 text-[13px] text-ink-soft">
        {location !== null && t('matches.shot.marker', { metres: distanceToGoal(location) })}
      </p>
    </div>
  );
}
