import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ProMatchSummary } from '../../engine/pro';
import { formatDate } from '../../lib/dates';
import { Card, Skeleton } from '../../ui';
import { competitionLabel, noteText, scoreLine, stageLabel, teamLabel } from './text';

export const matchPath = (id: number): string => `/pro/${String(id)}`;

/** One final as a large card: the whole card is the link. */
export function FinalCard({
  match,
  competition,
}: {
  readonly match: ProMatchSummary;
  readonly competition: string;
}) {
  const { t, i18n } = useTranslation();
  const note = noteText(t, match);
  return (
    <Card as="li" interactive className="flex flex-col gap-4">
      <p className="text-footnote font-semibold text-ink-soft">
        {`${competitionLabel(t, match.competition, competition)} · ${stageLabel(t, match.stage)}`}
      </p>
      <Link
        to={matchPath(match.id)}
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-control no-underline after:absolute after:inset-0 after:rounded-card"
      >
        <span className="sr-only">{scoreLine(t, match)}</span>
        <span
          aria-hidden="true"
          className="truncate text-right text-[17px] font-semibold text-home"
        >
          {teamLabel(t, match.home)}
        </span>
        <span aria-hidden="true" className="font-display text-[44px] text-ink tabular-nums">
          {`${String(match.score[0])}–${String(match.score[1])}`}
        </span>
        <span aria-hidden="true" className="truncate text-[17px] font-semibold text-away">
          {teamLabel(t, match.away)}
        </span>
      </Link>
      <p className="flex items-center justify-between gap-3 text-footnote text-ink-soft">
        <span>
          {formatDate(match.date, i18n.language, 'long')}
          {note !== null && ` · ${note}`}
        </span>
        <ChevronRight aria-hidden="true" size={18} strokeWidth={2.4} className="text-mute" />
      </p>
    </Card>
  );
}

/** A plain row in a stage list: the result is the title, the date and any note under it. */
export function MatchRow({ match }: { readonly match: ProMatchSummary }) {
  const { t, i18n } = useTranslation();
  const note = noteText(t, match);
  return (
    <li className="group [&:last-child>a]:after:hidden">
      <Link
        to={matchPath(match.id)}
        className="relative flex min-h-14 items-center gap-3 px-4 no-underline transition-colors duration-120 ease-touch after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px after:bg-hairline hover:bg-mute-soft/60 focus-visible:-outline-offset-3 active:bg-mute-soft"
      >
        <span className="flex min-w-0 flex-1 flex-col py-3">
          <span className="text-[16px] leading-snug font-semibold text-ink">
            <span className="text-home">{teamLabel(t, match.home)}</span>
            <span className="px-1.5 tabular-nums">{`${String(match.score[0])}–${String(match.score[1])}`}</span>
            <span className="text-away">{teamLabel(t, match.away)}</span>
          </span>
          <span className="mt-0.5 text-footnote text-ink-soft">
            {formatDate(match.date, i18n.language, 'medium')}
            {note !== null && ` · ${note}`}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          size={18}
          strokeWidth={2.4}
          className="-mr-1 shrink-0 text-mute transition-transform duration-120 ease-touch group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}

/** Placeholder while the list loads: the shape of what is coming, announced once. */
export function ListSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">{t('pro.list.loading')}</span>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
      <Skeleton className="h-12 w-full" />
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-14 w-full" />
      ))}
    </div>
  );
}
