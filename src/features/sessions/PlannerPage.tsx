import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useActiveClub } from '../../lib/club';
import { useMatches, usePlayers, type Player } from '../../lib/data';
import { Button, ErrorNotice, PageHeader, Skeleton, useToast } from '../../ui';
import {
  initialForm,
  parseMatchId,
  toConstraints,
  validateForm,
  type PlannerForm,
} from './constraints';
import { buildValues } from './values';
import { formatEstimate } from './format';
import { useCreateSession } from './hooks';
import { FewerPlayers, NoPlan } from './PlanFallbacks';
import { planFor } from './plan';
import { PlanTimeline } from './PlanTimeline';
import { PlannerFields } from './PlannerFields';
import { RotationPanel } from './RotationPanel';

/** `/training/new`: set the night up and watch the plan change under your thumb. */
export function PlannerPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const players = usePlayers();
  const header = (
    <PageHeader
      title={t('sessions.planner.title')}
      subtitle={t('sessions.planner.subtitle')}
      back={{ to: '/training', label: t('sessions.back') }}
    />
  );

  if (players.isPending) {
    return (
      <>
        {header}
        <div role="status" aria-label={t('ui.loading')} className="flex flex-col gap-4">
          <Skeleton className="h-72 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
        </div>
      </>
    );
  }
  if (players.isError) {
    return (
      <>
        {header}
        <ErrorNotice
          title={t('errors.loadFailed')}
          onRetry={() => {
            void players.refetch();
          }}
        />
      </>
    );
  }
  return (
    <>
      {header}
      <PlannerBody
        // A new focus link is a new plan: start the form again rather than carry old choices.
        key={params.toString()}
        squad={players.data}
        focus={params.get('focus')}
        matchId={parseMatchId(params.get('match'))}
      />
    </>
  );
}

interface PlannerBodyProps {
  readonly squad: readonly Player[];
  readonly focus: string | null;
  readonly matchId: string | null;
}

function PlannerBody({ squad, focus, matchId }: PlannerBodyProps) {
  const { t } = useTranslation();
  const club = useActiveClub();
  const matches = useMatches();
  const navigate = useNavigate();
  const { toast } = useToast();
  const create = useCreateSession();
  const [form, setForm] = useState<PlannerForm>(() =>
    initialForm({ focus, squadSize: squad.length }),
  );
  const errors = validateForm(form);
  const attendance = useMemo(() => planFor(form, club.ageGroup), [form, club.ageGroup]);
  const expected = attendance?.scenarios[0]?.plan ?? null;
  // A match id from a link only counts if it is one of this team's matches.
  const sourceMatch = matchId === null ? undefined : matches.data?.find((m) => m.id === matchId);

  const blocker =
    expected === null || !expected.feasible
      ? 'sessions.save.blockedNoPlan'
      : errors.heldOn !== undefined
        ? 'sessions.save.blockedDate'
        : null;

  function save() {
    if (expected === null) return;
    const result = buildValues({
      form,
      plan: expected,
      playerIds: squad.map((player) => player.id),
      sourceMatchId: sourceMatch?.id ?? null,
    });
    if (!result.ok) {
      toast({ tone: 'error', message: t('errors.invalid') });
      return;
    }
    create.mutate(result.values, {
      onSuccess: (sessionId) => {
        toast({ tone: 'success', message: t('sessions.save.saved') });
        void navigate(`/training/${sessionId}`);
      },
    });
  }

  return (
    <div className="flex flex-col gap-8 pb-4">
      {sourceMatch !== undefined && (
        <p className="rounded-control bg-pitch-soft px-4 py-3 text-[15px] text-ink">
          {t('sessions.planner.fromMatch', { opponent: sourceMatch.opponent })}
        </p>
      )}
      <PlannerFields
        form={form}
        errors={errors}
        onChange={(patch) => {
          setForm((current) => ({ ...current, ...patch }));
        }}
      />
      {attendance !== null && expected !== null && (
        <>
          <section aria-labelledby="plan-heading" className="flex flex-col gap-3">
            <div>
              <h2 id="plan-heading" className="text-[22px] font-semibold text-ink">
                {t('sessions.planner.planTitle')}
              </h2>
              {expected.feasible && (
                <p className="mt-1 text-[15px] text-ink-soft tabular-nums">
                  {t('sessions.planner.total', {
                    minutes: expected.totalMinutes,
                    reps: formatEstimate(expected.expectedRepsPerPlayer),
                  })}
                </p>
              )}
            </div>
            {expected.feasible ? (
              <PlanTimeline key={form.focus} blocks={expected.blocks} />
            ) : (
              <NoPlan plan={expected} constraints={toConstraints(form, club.ageGroup)} />
            )}
          </section>
          <FewerPlayers attendance={attendance} />
        </>
      )}
      <RotationPanel squad={squad} players={form.players} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-raised p-4 md:sticky md:bottom-4 md:z-10 md:border md:border-line md:p-3 md:shadow-float">
        <p id="save-note" className="min-w-0 flex-1 basis-40 text-[13px] text-ink-soft">
          {blocker === null ? t('sessions.save.ready') : t(blocker)}
        </p>
        <Button
          size="lg"
          loading={create.isPending}
          disabled={blocker !== null}
          aria-describedby="save-note"
          onClick={save}
        >
          {t('sessions.save.action')}
        </Button>
      </div>
    </div>
  );
}
