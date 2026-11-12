import { ChevronRight, CircleCheck, Eye, HeartPulse, LandPlot, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Card, SectionHeader } from '../../ui';
import { formatDecimal, formatXg } from './format';
import { focusLink, type FocusNeed } from './matchModel';
import { MIN_ATTEMPTS, type Need } from './model';

export type AnyNeed = Need | FocusNeed;

interface NeedView {
  readonly key: AnyNeed['kind'];
  readonly icon: ReactNode;
  readonly tile: string;
  readonly text: string;
  readonly action: string;
  readonly to: string;
}

function useNeedView() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  return (need: AnyNeed): NeedView => {
    switch (need.kind) {
      case 'load':
        return {
          key: need.kind,
          icon: <HeartPulse />,
          tile: 'text-amber',
          text: t('home.needs.load', {
            count: need.players,
            ratio: formatDecimal(need.highestRatio, language),
          }),
          action: t('home.needs.loadAction'),
          to: '/fairness/load',
        };
      case 'secondLook':
        return {
          key: need.kind,
          icon: <Eye />,
          tile: 'text-ring-seen',
          text: t('home.needs.secondLook', { count: need.players, min: MIN_ATTEMPTS }),
          action: t('home.needs.secondLookAction'),
          to: '/fairness',
        };
      case 'focus': {
        const values: Record<string, string | number> = { ...need.reason.values };
        if (need.reason.code === 'chanceQualityGap') {
          values.ours = formatXg(need.reason.values.ours ?? 0, language);
          values.theirs = formatXg(need.reason.values.theirs ?? 0, language);
        }
        return {
          key: need.kind,
          icon: <Target />,
          tile: 'text-pitch',
          text: t(`home.needs.focus.${need.reason.code}`, {
            ...values,
            focus: t(`review.focus.${need.focus}.name`),
          }),
          action: t('home.needs.focusAction'),
          to: focusLink(need),
        };
      }
      case 'pitch':
        return {
          key: need.kind,
          icon: <LandPlot />,
          tile: 'text-ink-soft',
          text: t('home.needs.pitch', {
            count: need.sessions,
            hours: formatDecimal(need.hoursFreed, language),
          }),
          action: t('home.needs.pitchAction'),
          to: '/fairness/pitch',
        };
    }
  };
}

function NeedCard({ view }: { readonly view: NeedView }) {
  const { t } = useTranslation();
  return (
    <Card as="li" interactive className="flex gap-3.5">
      <span
        aria-hidden="true"
        className={`grid size-7 shrink-0 place-items-center [&>svg]:size-6 ${view.tile}`}
      >
        {view.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-footnote font-semibold text-ink-soft">
          {t(`home.needs.kicker.${view.key}`)}
        </p>
        <p className="text-[16px] leading-snug text-pretty text-ink">{view.text}</p>
        <Link
          to={view.to}
          className="mt-1 inline-flex min-h-11 items-center gap-0.5 self-start font-semibold text-pitch no-underline after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-pitch"
        >
          {view.action}
          <ChevronRight aria-hidden="true" size={18} strokeWidth={2.4} />
        </Link>
      </div>
    </Card>
  );
}

/** At most four things worth the coach's attention, each with the number that justifies it. */
export function NeedsSection({ needs }: { readonly needs: readonly AnyNeed[] }) {
  const { t } = useTranslation();
  const toView = useNeedView();
  return (
    <section aria-labelledby="today-needs">
      <SectionHeader id="today-needs" title={t('home.needs.title')} />
      {needs.length === 0 ? (
        <Card className="flex items-center gap-3">
          <CircleCheck aria-hidden="true" size={22} className="shrink-0 text-pitch" />
          <p className="text-pretty text-ink-soft">{t('home.needs.none')}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {needs.map((need) => (
            <NeedCard key={need.kind} view={toView(need)} />
          ))}
        </ul>
      )}
    </section>
  );
}
