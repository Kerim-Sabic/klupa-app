import { useTranslation } from 'react-i18next';
import { SIDES, type Side } from '../../engine';
import { formatXg, markRadius } from './chartModel';
import { PITCH, mapShots, shotTotals, type ReviewEvent } from './reviewModel';

const HALF = PITCH.length / 2;
const CENTRE = PITCH.width / 2;
const MAX_MARK_M = 2.6;
// The arc of the 9.15 m circle around the spot (11 m out) that lies beyond the 16.5 m line.
const ARC_HALF_CHORD = Math.sqrt(9.15 ** 2 - (16.5 - 11) ** 2);

/** Home is a circle, away a diamond of the same area: side by shape as well as colour. */
export function ShotGlyph({
  side,
  cx,
  cy,
  r,
}: {
  readonly side: Side;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}) {
  if (side === 'home') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className="fill-home/70 stroke-home"
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  const half = (r * Math.sqrt(Math.PI)) / Math.SQRT2;
  return (
    <path
      d={`M${String(cx)} ${String(cy - half)}L${String(cx + half)} ${String(cy)}L${String(cx)} ${String(cy + half)}L${String(cx - half)} ${String(cy)}Z`}
      className="fill-away/70 stroke-away"
      vectorEffect="non-scaling-stroke"
    />
  );
}

function Markings() {
  const line = { className: 'fill-none stroke-mute', vectorEffect: 'non-scaling-stroke' } as const;
  return (
    <g>
      <rect x={0} y={0} width={PITCH.width} height={HALF} {...line} />
      <rect x={CENTRE - 20.16} y={0} width={40.32} height={16.5} {...line} />
      <rect x={CENTRE - 9.16} y={0} width={18.32} height={5.5} {...line} />
      <rect x={CENTRE - 3.66} y={-1.6} width={7.32} height={1.6} {...line} />
      <path
        d={`M${String(CENTRE - ARC_HALF_CHORD)} 16.5A9.15 9.15 0 0 0 ${String(CENTRE + ARC_HALF_CHORD)} 16.5`}
        {...line}
      />
      <path
        d={`M${String(CENTRE - 9.15)} ${String(HALF)}A9.15 9.15 0 0 1 ${String(CENTRE + 9.15)} ${String(HALF)}`}
        {...line}
      />
      <circle cx={CENTRE} cy={11} r={0.3} className="fill-mute" />
      <circle cx={CENTRE} cy={HALF} r={0.3} className="fill-mute" />
    </g>
  );
}

interface ShotMapProps {
  readonly events: readonly ReviewEvent[];
  readonly sideNames: Readonly<Record<Side, string>>;
  /** What to say about chance quality under the map; defaults to the note for a youth team. */
  readonly note?: string;
}

/** Where the chances came from: both teams' shots on one attacking half, goal at the top. */
export function ShotMap({ events, sideNames, note }: ShotMapProps) {
  const { t, i18n } = useTranslation();
  const { shots, unplaced, ownHalf } = mapShots(events);
  const totals = shotTotals(events);
  // Biggest chances first so smaller marks stay visible on top of them.
  const ordered = [...shots].sort((a, b) => b.weight - a.weight);
  const label = t('review.shots.mapLabel', {
    home: sideNames.home,
    away: sideNames.away,
    homeShots: shots.filter((shot) => shot.side === 'home').length,
    awayShots: shots.filter((shot) => shot.side === 'away').length,
  });

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`-3 -4 ${String(PITCH.width + 6)} ${String(HALF + 7)}`}
        role="img"
        aria-label={label}
        className="mx-auto block h-auto w-full max-w-md"
      >
        <Markings />
        {ordered.map((shot) => {
          const r = markRadius(shot.weight, MAX_MARK_M, 0.7);
          return (
            <g key={shot.id} data-side={shot.side} data-goal={shot.goal}>
              <ShotGlyph side={shot.side} cx={shot.across} cy={shot.depth} r={r} />
              {shot.goal && (
                <circle
                  cx={shot.across}
                  cy={shot.depth}
                  r={r + 0.9}
                  className="fill-none stroke-ink"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
        {SIDES.map((side) => (
          <li key={side} className="flex items-center gap-1.5">
            <svg aria-hidden="true" viewBox="-2 -2 4 4" className="size-3.5">
              <ShotGlyph side={side} cx={0} cy={0} r={1.5} />
            </svg>
            {sideNames[side]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <svg aria-hidden="true" viewBox="-2 -2 4 4" className="size-3.5">
            <circle r={1.6} className="fill-none stroke-ink" strokeWidth={0.5} />
          </svg>
          {t('review.shots.goalKey')}
        </li>
        <li>{t('review.shots.sizeKey')}</li>
      </ul>
      {(unplaced > 0 || ownHalf > 0) && (
        <p className="text-center text-[13px] text-ink-soft">
          {t('review.shots.notDrawn', { unplaced, ownHalf })}
        </p>
      )}

      <dl className="grid gap-2 sm:grid-cols-2">
        {SIDES.map((side) => (
          <div key={side} className="rounded-control border border-line p-3 tabular-nums">
            <dt className="text-[13px] font-semibold text-ink-soft">{sideNames[side]}</dt>
            <dd className="mt-0.5 text-ink">
              {t('review.shots.totals', {
                shots: totals[side].shots,
                goals: totals[side].goals,
                quality: formatXg(totals[side].chanceQuality, i18n.language),
              })}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] text-ink-soft">{note ?? t('review.shots.estimateNote')}</p>
    </div>
  );
}
