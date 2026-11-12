import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PublicLayout } from '../../app/PublicLayout';
import type { ProIndex } from '../../engine/pro';
import { EmptyState, ErrorNotice, PageHeader, Segmented, TextField } from '../../ui';
import { useProIndex } from './data';
import { finalsOf, groupByStage } from './listModel';
import { FinalCard, ListSkeleton, MatchRow } from './ProListParts';
import { competitionLabel, stageLabel, teamLabel } from './text';

function MatchList({ index }: { readonly index: ProIndex }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const first = index.competitions[0]?.id ?? '';
  const chosen = params.get('t');
  const competition =
    index.competitions.some((c) => c.id === chosen) && chosen !== null ? chosen : first;
  const query = params.get('q') ?? '';
  const groups = groupByStage(index.matches, competition, query, (team) => teamLabel(t, team));
  const names = new Map(index.competitions.map((c) => [c.id, c.name]));

  const update = (key: 't' | 'q', value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="pro-finals">
        <h2 id="pro-finals" className="font-title text-title text-ink">
          {t('pro.list.finals')}
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {finalsOf(index.matches, index.competitions).map((match) => (
            <FinalCard
              key={match.id}
              match={match}
              competition={names.get(match.competition) ?? ''}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="pro-all" className="flex flex-col gap-6">
        <h2 id="pro-all" className="font-title text-title text-ink">
          {t('pro.list.all')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Segmented
            label={t('pro.list.tournament')}
            value={competition}
            onChange={(value) => {
              update('t', value === first ? '' : value);
            }}
            options={index.competitions.map((c) => ({
              value: c.id,
              label: competitionLabel(t, c.id, c.name),
            }))}
          />
          <TextField
            label={t('pro.list.search')}
            type="search"
            autoComplete="off"
            placeholder={t('pro.list.searchPlaceholder')}
            value={query}
            onChange={(event) => {
              update('q', event.target.value);
            }}
          />
        </div>
        <p className="sr-only" role="status">
          {t('pro.list.count', { count: groups.reduce((sum, g) => sum + g.matches.length, 0) })}
        </p>
        {groups.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={t('pro.list.empty')}
            body={t('pro.list.emptyBody')}
          />
        ) : (
          groups.map((group) => {
            const id = `pro-stage-${group.stage.replace(/\W+/g, '-').toLowerCase()}`;
            return (
              <div key={group.stage}>
                <h3 id={id} className="pb-2 text-headline font-semibold text-ink">
                  {stageLabel(t, group.stage)}
                </h3>
                <ul
                  aria-labelledby={id}
                  className="overflow-hidden rounded-card border border-hairline bg-raised shadow-card"
                >
                  {group.matches.map((match) => (
                    <MatchRow key={match.id} match={match} />
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

/**
 * Every match of the 2018 World Cup and Euro 2016, read by the same engine that reads a coach's
 * taps. A showcase of what the engine can read, not a scouting tool.
 */
export function ProListPage() {
  const { t } = useTranslation();
  const index = useProIndex();
  return (
    <PublicLayout>
      <PageHeader title={t('pro.title')} subtitle={t('pro.subtitle')} />
      {index.isPending && <ListSkeleton />}
      {index.isError && (
        <ErrorNotice
          title={t('pro.list.error.title')}
          body={t('pro.list.error.body')}
          onRetry={() => void index.refetch()}
        />
      )}
      {index.isSuccess && <MatchList index={index.data} />}
    </PublicLayout>
  );
}
