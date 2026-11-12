import { useTranslation } from 'react-i18next';
import { MOMENTUM_STATES, type MomentumReading } from '../../engine';
import { formatClock, formatPercent, stateDurations } from './chartModel';

interface StateTimeTableProps {
  readonly readings: readonly MomentumReading[];
  readonly durationSeconds: number;
}

/** The conclusion strip as a table for screen readers: time and share in each state. */
export function StateTimeTable({ readings, durationSeconds }: StateTimeTableProps) {
  const { t, i18n } = useTranslation();
  const durations = stateDurations(readings, durationSeconds);
  // The wrapper clips: a table ignores the width sr-only sets and would widen the page.
  return (
    <div className="sr-only">
      <table>
        <caption>{t('lab.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('lab.tableState')}</th>
            <th scope="col">{t('lab.tableTime')}</th>
            <th scope="col">{t('lab.tableShare')}</th>
          </tr>
        </thead>
        <tbody>
          {MOMENTUM_STATES.map((state) => (
            <tr key={state}>
              <th scope="row">{t(`state.${state}.label`)}</th>
              <td>{formatClock(durations[state])}</td>
              <td>
                {formatPercent(
                  durationSeconds > 0 ? durations[state] / durationSeconds : 0,
                  i18n.language,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
