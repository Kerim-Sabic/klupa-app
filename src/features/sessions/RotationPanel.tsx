import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { buildRotation } from '../../engine';
import type { Player } from '../../lib/data';
import { ROTATION_ROUNDS, rotationSlots } from './constraints';
import { turnRange } from './format';

export interface RotationPanelProps {
  /** The active squad, already ordered by shirt number. */
  readonly squad: readonly Player[];
  /** Expected turnout; a third of it works the practised role at once. */
  readonly players: number;
}

/** Who takes the key role in each round, so every child gets a go before anyone gets a second. */
export function RotationPanel({ squad, players }: RotationPanelProps) {
  const { t } = useTranslation();
  const slots = rotationSlots(players);
  const rotation = useMemo(
    () =>
      squad.length === 0
        ? null
        : buildRotation(
            squad.map((player) => player.id),
            { rounds: ROTATION_ROUNDS, slotsPerRound: slots },
          ),
    [squad, slots],
  );
  const byId = useMemo(() => new Map(squad.map((player) => [player.id, player])), [squad]);
  const range = rotation === null ? null : turnRange(rotation);

  return (
    <section aria-labelledby="rotation-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="rotation-heading" className="text-[22px] font-semibold text-ink">
          {t('sessions.rotation.title')}
        </h2>
        <p className="mt-1 text-[15px] text-ink-soft">{t('sessions.rotation.intro', { slots })}</p>
      </div>
      {rotation === null || range === null ? (
        <p className="rounded-control border border-dashed border-line px-4 py-3 text-[15px] text-ink-soft">
          {t('sessions.rotation.noSquad')}
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-card border border-line bg-raised">
            <table className="w-full border-collapse text-left text-[15px]">
              <caption className="sr-only">{t('sessions.rotation.caption')}</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">{t('sessions.rotation.round')}</th>
                  <th scope="col">{t('sessions.rotation.players')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rotation.rounds.map((ids, index) => (
                  <tr key={ids.join('-') + String(index)}>
                    <th
                      scope="row"
                      className="w-20 px-4 py-2.5 align-top text-[13px] font-semibold whitespace-nowrap text-ink-soft"
                    >
                      {t('sessions.rotation.roundN', { round: index + 1 })}
                    </th>
                    <td className="px-2 py-2">
                      <ul className="flex flex-wrap gap-1.5">
                        {ids.map((id) => {
                          const player = byId.get(id);
                          return (
                            <li
                              key={id}
                              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-mute-soft px-2.5 text-[13px] font-semibold text-ink"
                            >
                              <span className="tabular-nums">{player?.shirt_number}</span>
                              <span className="text-ink-soft">{player?.label}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[15px] font-semibold text-ink">
            {range.low === range.high
              ? t('sessions.rotation.turnsEqual', { turns: range.low })
              : t('sessions.rotation.turns', { low: range.low, high: range.high })}
          </p>
        </>
      )}
    </section>
  );
}
