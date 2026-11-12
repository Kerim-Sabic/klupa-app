import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { EvidenceEvent, MomentumReading, Side, WindowAssessment } from '../../engine';
import { Card, Pill, StateBadge } from '../../ui';
import { formatClock, formatXg } from './chartModel';

function fragilityKey(window: WindowAssessment): string | null {
  if (window.robust) return 'reading.robust';
  if (window.canReverse) return 'reading.canReverse';
  if (window.canTie) return 'reading.canTie';
  return null;
}

interface SideNames {
  readonly sideNames: Readonly<Record<Side, string>>;
}

function WindowCard({ window, sideNames }: { readonly window: WindowAssessment } & SideNames) {
  const { t, i18n } = useTranslation();
  const fragility = fragilityKey(window);
  let headline = t('reading.noEvents');
  if (window.lean !== 0) {
    headline = t('reading.favours', {
      side: window.lean > 0 ? sideNames.home : sideNames.away,
      value: formatXg(Math.abs(window.differential), i18n.language),
    });
  } else if (window.events.length > 0) {
    headline = t('reading.noLean');
  }
  return (
    <li className="rounded-control border border-line p-3">
      <h4 className="text-[13px] font-semibold text-ink-soft">
        {t('reading.windowTitle', { minutes: window.windowSeconds / 60 })}
      </h4>
      <p className="mt-1 font-semibold text-ink">{headline}</p>
      {fragility !== null && <p className="mt-1 text-[13px] text-ink-soft">{t(fragility)}</p>}
    </li>
  );
}

interface ReadingPanelProps extends SideNames {
  readonly reading: MomentumReading;
  /** One line per contributing event; defaults to time, side and xG. */
  readonly describeEvent?: (event: EvidenceEvent) => string;
}

/** Everything a coach may conclude at one moment, and the evidence behind it. */
export function ReadingPanel({ reading, sideNames, describeEvent }: ReadingPanelProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const widest = reading.windows[reading.windows.length - 1];
  const side = reading.favoured === null ? '' : sideNames[reading.favoured];
  const decisive = new Set(reading.windows.map((window) => window.decisiveEventId));
  const describe =
    describeEvent ??
    ((event: EvidenceEvent) =>
      t('reading.evidenceItem', {
        time: formatClock(event.t),
        side: sideNames[event.side],
        value: formatXg(event.weight, i18n.language),
      }));

  return (
    <Card as="section" aria-live="polite" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-[17px] font-semibold text-ink tabular-nums">
          {t('reading.title', { time: formatClock(reading.t) })}
        </h3>
        <StateBadge state={reading.state} />
      </div>
      <p className="mt-2 max-w-prose text-ink-soft">
        {t(
          reading.opposed
            ? 'state.window-sensitive.explainOpposed'
            : `state.${reading.state}.explain`,
          { side },
        )}
      </p>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {reading.windows.map((window) => (
          <WindowCard key={window.windowSeconds} window={window} sideNames={sideNames} />
        ))}
      </ul>

      <h4 className="mt-5 text-[13px] font-semibold text-ink-soft">{t('reading.evidenceTitle')}</h4>
      {widest === undefined || widest.events.length === 0 ? (
        <p className="mt-1 text-ink-soft">{t('reading.evidenceEmpty')}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {widest.events.map((event) => (
            <li
              key={event.id}
              className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1.5 tabular-nums"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`size-2.5 shrink-0 ${event.side === 'home' ? 'rounded-full bg-home' : 'rotate-45 bg-away'}`}
                />
                {describe(event)}
              </span>
              {decisive.has(event.id) && <Pill tone="amber">{t('reading.decisive')}</Pill>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
