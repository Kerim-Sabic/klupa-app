import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useActiveClub } from '../../lib/club';
import { useMatchPages, type MatchSummary } from '../../lib/data';
import {
  Button,
  Card,
  CardTitle,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Pill,
  RevealList,
  Skeleton,
  type PillTone,
} from '../../ui';
import { fetchGoals } from './api';
import { mergeFeed } from './feed';
import { formatMatchDate } from './format';
import { NewMatchSheet } from './NewMatchSheet';
import { scoreOf, type Score } from './score';
import { matchScoresKey, useOutbox } from './useOutbox';

const STATUS_TONE: Readonly<Record<MatchSummary['status'], PillTone>> = {
  scheduled: 'mute',
  live: 'ink',
  finished: 'mute',
};

function MatchCard({ match, score }: { match: MatchSummary; score: Score | undefined }) {
  const { t, i18n } = useTranslation();
  const finished = match.status === 'finished';
  const to = finished ? `/matches/${match.id}` : `/matches/${match.id}/live`;
  const label = t(finished ? 'matches.openReview' : 'matches.openLive', {
    opponent: match.opponent,
  });
  return (
    <Card as="li" interactive className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <CardTitle className="truncate">
          <Link
            to={to}
            aria-label={label}
            className="no-underline after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
          >
            {match.opponent}
          </Link>
        </CardTitle>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {formatMatchDate(match.played_on, i18n.language)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill tone={STATUS_TONE[match.status]}>{t(`matches.status.${match.status}`)}</Pill>
        </div>
      </div>
      {match.status !== 'scheduled' && score !== undefined && (
        <p className="font-display text-[30px] leading-none whitespace-nowrap">
          <span className="sr-only">
            {t('matches.listScore', { home: score.home, away: score.away })}
          </span>
          <span aria-hidden="true">
            {score.home}–{score.away}
          </span>
        </p>
      )}
      <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-ink-soft" />
    </Card>
  );
}

function ListSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t('matches.loading')} className="flex flex-col gap-3">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-24 w-full rounded-card" />
      ))}
    </div>
  );
}

/** Goals for the listed live and finished matches, including goals still on this phone. */
function useScores(matches: readonly MatchSummary[] | undefined): Map<string, Score> {
  const { clubId, teamId } = useActiveClub();
  const { queue } = useOutbox();
  const ids = (matches ?? []).filter((match) => match.status !== 'scheduled').map((m) => m.id);
  const goals = useQuery({
    queryKey: [...matchScoresKey, teamId, ids],
    queryFn: () => fetchGoals(clubId, ids),
    enabled: ids.length > 0,
  });
  return useMemo(() => {
    const scores = new Map<string, Score>();
    if (goals.data === undefined) return scores;
    for (const id of ids) {
      scores.set(id, scoreOf(mergeFeed(goals.data, queue, id)));
    }
    return scores;
  }, [goals.data, ids, queue]);
}

export function MatchesPage() {
  const { t } = useTranslation();
  const matches = useMatchPages();
  const scores = useScores(matches.data);
  const [creating, setCreating] = useState(false);

  const newButton = (
    <Button
      icon={<Plus />}
      onClick={() => {
        setCreating(true);
      }}
    >
      {t('matches.new')}
    </Button>
  );

  let body;
  if (matches.isPending) {
    body = <ListSkeleton />;
  } else if (matches.isError) {
    body = (
      <ErrorNotice
        title={t('matches.loadError')}
        onRetry={() => {
          matches.refetch();
        }}
      />
    );
  } else if (matches.data.length === 0) {
    body = (
      <EmptyState
        icon={<CalendarPlus />}
        title={t('matches.empty.title')}
        body={t('matches.empty.body')}
        action={newButton}
      />
    );
  } else {
    body = (
      <>
        <RevealList as="ul" className="flex flex-col gap-3">
          {matches.data.map((match) => (
            <MatchCard key={match.id} match={match} score={scores.get(match.id)} />
          ))}
        </RevealList>
        {matches.hasMore && (
          <div className="mt-4">
            <Button variant="secondary" onClick={matches.loadMore} disabled={matches.loadingMore}>
              {t('matches.showEarlier')}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('matches.title')} subtitle={t('matches.subtitle')} actions={newButton} />
      {body}
      <NewMatchSheet
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
      />
    </>
  );
}
