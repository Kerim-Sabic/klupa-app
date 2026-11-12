import { SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { PublicLayout } from '../../app/PublicLayout';
import { EmptyState, ErrorNotice, LinkButton, PageHeader, SelectField } from '../../ui';
import { AboutData } from './AboutData';
import { ClubsContext } from './clubs';
import { LoadingPanel } from './LoadingPanel';
import {
  clubsOf,
  DEFAULT_MATCH_ID,
  formatMatchDate,
  matchLabel,
  shortCompetition,
  type MatchEntry,
} from './matches';
import { PhysicalSection } from './PhysicalReport';
import { Replay } from './Replay';
import { useMatchIndex, useTrackingData } from './useTrackingData';

/** Switch match by URL, so every match has a link of its own and Back works. */
function MatchPicker({ matches, current }: { matches: readonly MatchEntry[]; current: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const match = matches.find((entry) => entry.id === current);
  return (
    <div className="flex flex-col gap-3">
      {match !== undefined && (
        <div>
          {/* The result never breaks across lines: "0–" alone at a line end reads as a typo. */}
          <h2 className="text-title font-semibold text-balance">
            {match.home}{' '}
            <span className="whitespace-nowrap">
              {`${String(match.score[0])}–${String(match.score[1])}`}
            </span>{' '}
            {match.away}
          </h2>
          <p className="text-[15px] text-ink-soft">
            {formatMatchDate(match.date, i18n.language)} · {shortCompetition(match.competition)}
          </p>
        </div>
      )}
      <SelectField
        label={t('movement.picker.label')}
        hint={t('movement.picker.hint')}
        value={current}
        options={matches.map((match) => ({
          value: match.id,
          label: matchLabel(match, i18n.language),
        }))}
        onChange={(id) => {
          void navigate(id === DEFAULT_MATCH_ID ? '/movement' : `/movement/${id}`);
        }}
      />
    </div>
  );
}

/** One match: its replay, then its physical report. Remounted per match, so nothing carries over. */
function MatchView({ match }: { readonly match: MatchEntry }) {
  const { t } = useTranslation();
  const { state, retry } = useTrackingData(match.id);
  const clubs = useMemo(() => clubsOf(match), [match]);
  return (
    <ClubsContext value={clubs}>
      {state.phase === 'loading' && <LoadingPanel loaded={state.loaded} total={state.total} />}
      {state.phase === 'error' && (
        <ErrorNotice
          title={t('movement.error.title')}
          body={t('movement.error.body')}
          onRetry={retry}
        />
      )}
      {state.phase === 'ready' && <Replay tracking={state.value} match={match} />}
      <PhysicalSection matchId={match.id} />
    </ClubsContext>
  );
}

/**
 * Match replay: seven professional matches from open tracking data, in 3D, with the team
 * shape, nearest-player space, a followed player's trail and a physical report. A
 * demonstration of what the tracking engine reads; a grassroots coach's own matches have no
 * such data.
 */
export function MovementLabPage() {
  const { t } = useTranslation();
  const { matchId = DEFAULT_MATCH_ID } = useParams();
  const index = useMatchIndex();
  const matches = index.state.phase === 'ready' ? index.state.value : null;
  const match = matches?.find((entry) => entry.id === matchId);

  return (
    <PublicLayout>
      <PageHeader title={t('movement.title')} subtitle={t('movement.subtitle')} />
      <div className="flex flex-col gap-6">
        {index.state.phase === 'loading' && <LoadingPanel loaded={0} total={0} />}
        {index.state.phase === 'error' && (
          <ErrorNotice
            title={t('movement.error.title')}
            body={t('movement.error.body')}
            onRetry={index.retry}
          />
        )}
        {matches !== null && match !== undefined && (
          <>
            <MatchPicker matches={matches} current={match.id} />
            <MatchView key={match.id} match={match} />
          </>
        )}
        {matches !== null && match === undefined && (
          <EmptyState
            icon={<SearchX />}
            title={t('movement.notFound.title')}
            body={t('movement.notFound.body')}
            action={<LinkButton to="/movement">{t('movement.notFound.back')}</LinkButton>}
          />
        )}
        <AboutData />
        {/* A coach has no tracking data, but may have a video: the overlay reads that. */}
        <div>
          <LinkButton to="/overlay" variant="ghost">
            {t('movement.ownVideo')}
          </LinkButton>
        </div>
      </div>
    </PublicLayout>
  );
}
