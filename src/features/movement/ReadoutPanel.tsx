import { useTranslation } from 'react-i18next';
import type { TeamShape } from '../../engine/tracking';
import type { Side } from '../../engine/types';
import { Card, CardTitle } from '../../ui';
import { useClubName } from './clubs';
import { formatNumber, formatPercent } from './format';
import type { Readout } from './model';

export interface ReadoutPanelProps {
  readonly readout: Readout;
  readonly half: string;
}

function TeamColumn({ side, shape }: { side: Side; shape: TeamShape | null }) {
  const { t, i18n } = useTranslation();
  const club = useClubName();
  const metres = (value: number) =>
    t('movement.readout.metres', { value: formatNumber(value, 0, i18n.language) });
  const rows =
    shape === null
      ? []
      : [
          { key: 'width', value: metres(shape.width) },
          { key: 'depth', value: metres(shape.length) },
          {
            key: 'area',
            value: t('movement.readout.squareMetres', {
              value: formatNumber(shape.area, 0, i18n.language),
            }),
          },
        ];
  return (
    // Three rows shared with the column beside it: a club name that wraps moves both.
    <div className="row-span-3 grid min-w-0 grid-rows-subgrid">
      <h3 className="flex items-start gap-2 font-semibold break-words text-ink">
        <span
          aria-hidden="true"
          className={`mt-1.5 size-3 shrink-0 ${side === 'home' ? 'rounded-full bg-home' : 'rounded-[2px] bg-away'}`}
        />
        {club(side)}
      </h3>
      {shape === null ? (
        <p className="text-[13px] text-ink-soft">{t('movement.readout.none')}</p>
      ) : (
        <>
          <p className="text-[13px] text-ink-soft">
            {t('movement.readout.outfield', { count: shape.count })}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
            {rows.map((row) => (
              <div key={row.key} className="contents">
                <dt className="text-ink-soft">{t(`movement.readout.${row.key}`)}</dt>
                <dd className="text-right font-semibold tabular-nums">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

/** The numbers behind the picture, refreshed a few times a second while the match plays. */
export function ReadoutPanel({ readout, half }: ReadoutPanelProps) {
  const { t, i18n } = useTranslation();
  const club = useClubName();
  const share = readout.homeShare;
  const player = readout.player;

  return (
    <Card as="section" aria-labelledby="movement-readout-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <CardTitle>
          <span id="movement-readout-title">{t('movement.readout.title')}</span>
        </CardTitle>
        <p className="text-[13px] text-ink-soft tabular-nums">
          <span className="sr-only">{t('movement.readout.clock')} </span>
          {readout.clock} · {half}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-4">
        <TeamColumn side="home" shape={readout.home} />
        <TeamColumn side="away" shape={readout.away} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[13px] font-semibold text-ink-soft">{t('movement.readout.space')}</h3>
        {share === null ? (
          <p className="text-[15px] text-ink-soft">{t('movement.readout.spaceNone')}</p>
        ) : (
          <>
            {/* A team and its share wrap together, never in the middle of a club's name. */}
            <p className="flex flex-wrap gap-x-4 font-semibold tabular-nums">
              <span>
                {t('movement.readout.spaceTeam', {
                  club: club('home'),
                  share: formatPercent(share, i18n.language),
                })}
              </span>{' '}
              <span>
                {t('movement.readout.spaceTeam', {
                  club: club('away'),
                  share: formatPercent(1 - share, i18n.language),
                })}
              </span>
            </p>
            {/* Home fills from the left, away from the right, with a gap at the split. */}
            <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              <span className="h-full bg-home" style={{ width: `${(share * 100).toFixed(1)}%` }} />
              <span className="h-full flex-1 bg-away" />
            </div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        <h3 className="text-[13px] font-semibold text-ink-soft">
          {t('movement.readout.playerTitle')}
        </h3>
        {player === null ? (
          <p className="text-[15px] text-ink-soft">{t('movement.readout.playerNone')}</p>
        ) : (
          <>
            <p className="font-semibold">
              {t('movement.readout.playerName', {
                side: club(player.side),
                shirt: player.shirt,
              })}
            </p>
            {!player.onPitch && (
              <p className="text-[13px] text-ink-soft">{t('movement.readout.offPitch')}</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
              <dt className="text-ink-soft">{t('movement.readout.speed')}</dt>
              <dd className="text-right font-semibold tabular-nums">
                {player.speed === null
                  ? t('movement.readout.speedNone')
                  : t('movement.readout.speedValue', {
                      value: formatNumber(player.speed, 1, i18n.language),
                    })}
              </dd>
              <dt className="text-ink-soft">{t('movement.readout.distance')}</dt>
              <dd className="text-right font-semibold tabular-nums">
                {t('movement.readout.distanceValue', {
                  value: formatNumber(player.metres / 1000, 2, i18n.language),
                })}
              </dd>
            </dl>
            <p className="text-[13px] text-ink-soft">{t('movement.readout.approximate')}</p>
          </>
        )}
      </div>
    </Card>
  );
}
