import { Activity, ChevronRight, Eye, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate } from '../../lib/dates';
import type { MatchSummary } from '../../lib/data';
import {
  Card,
  EmptyState,
  ErrorNotice,
  LinkButton,
  SectionHeader,
  Skeleton,
  StateStrip,
} from '../../ui';
import { formatPercent } from './format';
import type { MatchStrip } from './matchModel';
import type { Source } from './useToday';

/** A match being recorded right now outranks everything else on the card. */
export function LiveMatchCard({ match }: { readonly match: MatchSummary }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 rounded-card bg-ink p-4 text-on-ink shadow-lift sm:flex-row sm:items-center sm:p-5">
      <div className="min-w-0 flex-1">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-on-ink/12 px-2.5 py-1 text-footnote font-semibold">
          <Radio aria-hidden="true" size={15} strokeWidth={2.4} />
          {t('home.match.live.badge')}
        </p>
        <h3 className="font-title mt-2 text-title text-balance">
          {t('home.match.against', { opponent: match.opponent })}
        </h3>
        <p className="mt-0.5 opacity-80">{t('home.match.live.body')}</p>
      </div>
      {/* The recording phone opens the tagger; anyone else in the club watches the match centre. */}
      <div className="flex shrink-0 flex-wrap gap-2">
        <LinkButton to={`/matches/${match.id}`} variant="secondary" size="lg" icon={<Eye />}>
          {t('home.match.live.watch')}
        </LinkButton>
        <LinkButton
          to={`/matches/${match.id}/live`}
          variant="secondary"
          size="lg"
          icon={<Activity />}
        >
          {t('home.match.live.open')}
        </LinkButton>
      </div>
    </div>
  );
}

function StripBody({ strip }: { readonly strip: MatchStrip }) {
  const { t, i18n } = useTranslation();
  const lead = strip.shares[0];
  if (strip.segments.length === 0 || lead === undefined) {
    return <p className="text-footnote text-ink-soft">{t('home.match.noEvents')}</p>;
  }
  const summary = strip.shares
    .map((entry) =>
      t('home.match.share', {
        state: t(`state.${entry.state}.label`),
        percent: formatPercent(entry.share, i18n.language),
      }),
    )
    .join(', ');
  return (
    <div className="flex flex-col gap-2">
      <StateStrip
        segments={strip.segments}
        total={strip.total}
        breaks={strip.breaks}
        label={t('home.match.strip', { summary })}
      />
      <p className="text-footnote text-ink-soft">
        {t('home.match.lead', {
          state: t(`state.${lead.state}.label`),
          percent: formatPercent(lead.share, i18n.language),
        })}
      </p>
    </div>
  );
}

interface LastMatchCardProps {
  readonly match: MatchSummary;
  readonly strip: Source<MatchStrip>;
}

/** Opponent, score, date and the momentum strip; the whole card opens the review. */
export function LastMatchCard({ match, strip }: LastMatchCardProps) {
  const { t, i18n } = useTranslation();
  const score = strip.status === 'ready' ? strip.data.score : null;
  return (
    <Card as="article" interactive className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-title text-title text-balance">
            <Link
              to={`/matches/${match.id}`}
              aria-label={t('home.match.openLabel', { opponent: match.opponent })}
              className="no-underline after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
            >
              {t('home.match.against', { opponent: match.opponent })}
            </Link>
          </h3>
          <p className="mt-0.5 text-footnote text-ink-soft">
            {formatDate(match.played_on, i18n.language, 'weekday')}
          </p>
        </div>
        {score === null ? (
          strip.status === 'loading' && <Skeleton className="h-9 w-16" />
        ) : (
          <p className="font-display text-[36px] leading-none whitespace-nowrap tabular-nums">
            <span aria-hidden="true">
              {score.home}
              <span className="px-1 text-ink-soft">–</span>
              {score.away}
            </span>
            <span className="sr-only">{t('home.match.scoreLabel', score)}</span>
          </p>
        )}
      </div>
      {strip.status === 'loading' && <Skeleton className="h-2.5 w-full rounded-full" />}
      {strip.status === 'ready' && <StripBody strip={strip.data} />}
      <p className="inline-flex items-center gap-0.5 self-start font-semibold text-pitch">
        {t('home.match.open')}
        <ChevronRight aria-hidden="true" size={18} strokeWidth={2.4} />
      </p>
    </Card>
  );
}

interface LastMatchSectionProps {
  readonly live: MatchSummary | null;
  readonly last: MatchSummary | null;
  readonly strip: Source<MatchStrip>;
}

/** The match card: the live one while a match is being recorded, otherwise the last finished one. */
export function LastMatchSection({ live, last, strip }: LastMatchSectionProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="today-match" className="flex flex-col gap-3">
      <SectionHeader
        id="today-match"
        title={t(live === null ? 'home.match.title' : 'home.match.liveTitle')}
        className="pb-0"
      />
      {live !== null && <LiveMatchCard match={live} />}
      {live === null && last !== null && <LastMatchCard match={last} strip={strip} />}
      {live === null && last !== null && strip.status === 'error' && (
        <ErrorNotice title={t('home.match.eventsFailed')} onRetry={strip.retry} />
      )}
      {live === null && last === null && (
        <EmptyState icon={<Activity />} title={t('home.match.none')} />
      )}
    </section>
  );
}
