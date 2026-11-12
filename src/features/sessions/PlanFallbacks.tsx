import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AttendancePlan, SessionConstraints, SessionPlan } from '../../engine';
import { Card, CardTitle } from '../../ui';
import { findDrill, localized } from './format';
import { describeRejection, type RejectionMessage } from './rejections';
import { describeSwitchPoints } from './switchPoints';

function rejectionText(message: RejectionMessage, t: TFunction): string {
  switch (message.key) {
    case 'sessions.rejection.TOO_FEW_PLAYERS':
    case 'sessions.rejection.TOO_MANY_PLAYERS':
      return t(message.key, { players: message.count });
    case 'sessions.rejection.NOT_ENOUGH_SPACE':
      return t(message.key, { area: t(`sessions.areaFull.${message.area}`) });
    case 'sessions.rejection.MISSING_EQUIPMENT':
      return t(message.key, {
        items: message.missing.map((item) => t(`sessions.equipment.${item}`)).join(', '),
      });
    case 'sessions.rejection.AGE_GROUP':
      return t(message.key);
  }
}

/** What changes if fewer players come, in plain words. Hidden when only one turnout was planned. */
export function FewerPlayers({ attendance }: { readonly attendance: AttendancePlan }) {
  const { t, i18n } = useTranslation();
  const smallest = attendance.scenarios[attendance.scenarios.length - 1];
  if (attendance.scenarios.length < 2 || smallest === undefined) return null;
  const messages = describeSwitchPoints(attendance.switchPoints);
  return (
    <section aria-labelledby="fewer-heading" className="flex flex-col gap-3">
      <h2 id="fewer-heading" className="text-[22px] font-semibold text-ink">
        {t('sessions.fewer.title')}
      </h2>
      {messages.length === 0 ? (
        <p className="text-[15px] text-ink-soft">
          {t('sessions.fewer.same', { players: smallest.players })}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((message) => {
            const drill = message.drillKey === null ? undefined : findDrill(message.drillKey);
            return (
              <li
                key={`${message.key}-${String(message.count)}`}
                className="rounded-control border border-line bg-raised px-4 py-3 text-[15px] text-pretty"
              >
                {t(message.key, {
                  players: message.count,
                  drill: drill === undefined ? '' : localized(drill.name, i18n.language),
                })}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Said when no main drill fits: why each candidate for this focus was turned away. */
export function NoPlan({
  plan,
  constraints,
}: {
  readonly plan: SessionPlan;
  readonly constraints: SessionConstraints;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Card as="section" aria-labelledby="noplan-heading" className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <CircleAlert
          aria-hidden="true"
          size={22}
          strokeWidth={2.25}
          className="mt-0.5 shrink-0 text-amber"
        />
        <div className="flex flex-col gap-1">
          <CardTitle>
            <span id="noplan-heading">{t('sessions.noPlan.title')}</span>
          </CardTitle>
          <p className="text-[15px] text-ink-soft">
            {t('sessions.noPlan.body', { focus: t(`sessions.focus.${constraints.focus}`) })}
          </p>
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {plan.rejected.map((rejected) => {
          const drill = findDrill(rejected.drillKey);
          if (drill === undefined) return null;
          const message = describeRejection(rejected, drill, constraints);
          const reason = rejectionText(message, t);
          return (
            <li key={rejected.drillKey} className="flex flex-col gap-0.5 py-2.5 text-[15px]">
              <span className="font-semibold text-ink">
                {localized(drill.name, i18n.language)}
                <span className="ml-2 text-[13px] font-semibold text-ink-soft">
                  {t(`sessions.phase.${rejected.phase}`)}
                </span>
              </span>
              <span className="text-ink-soft">{reason}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
