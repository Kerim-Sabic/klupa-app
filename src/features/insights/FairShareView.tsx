import { Users } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, LinkButton, Reveal, Stat } from '../../ui';
import { useFormatter } from './format';
import { Ledger } from './Ledger';
import {
  buildFairShareModel,
  MIN_ATTEMPTS,
  type FairShareInput,
  type FairShareModel,
} from './models';
import { useFairShareSource } from './queries';
import { RelativeAge } from './RelativeAge';
import { SecondLook } from './SecondLook';
import { SourceView } from './SourceView';

function Stats({ model }: { readonly model: FairShareModel }) {
  const { t } = useTranslation();
  const format = useFormatter();
  const words = t(`insights.fair.evenness.${model.evenness}`);
  return (
    <Card className="grid gap-5 sm:grid-cols-3">
      <Stat
        label={t('insights.fair.played.label')}
        value={model.playersWithMinutes}
        format={(value) =>
          t('insights.fair.played.value', { played: Math.round(value), squad: model.squadSize })
        }
        hint={t('insights.fair.played.hint')}
      />
      {/* The words belong to the final value; counting through them would flicker between labels. */}
      <Stat
        label={t('insights.fair.evenness.label')}
        value={model.minutesGini}
        format={() => words}
        hint={
          model.evenness === 'none'
            ? t('insights.fair.evenness.hintNone')
            : t('insights.fair.evenness.hint', { value: format.number(model.minutesGini, 2) })
        }
      />
      <Stat
        label={t('insights.fair.observed.label')}
        value={model.underObservedCount}
        hint={t('insights.fair.observed.hint', { min: MIN_ATTEMPTS })}
      />
    </Card>
  );
}

/** What was left out and why, so a number is never quietly smaller than the records behind it. */
function Notes({ model }: { readonly model: FairShareModel }) {
  const { t } = useTranslation();
  if (model.openStints === 0 && model.missingMinutes === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {model.openStints > 0 && (
        <p className="text-[13px] text-ink-soft">
          {t('insights.fair.openStints', { count: model.openStints })}
        </p>
      )}
      {model.missingMinutes > 0 && (
        <p className="text-[13px] text-ink-soft">
          {t('insights.fair.missingMinutes', { count: model.missingMinutes })}
        </p>
      )}
    </div>
  );
}

function FairShareBody({ input }: { readonly input: FairShareInput }) {
  const { t } = useTranslation();
  const { players, stints, attendance, observations } = input;
  const model = useMemo(
    () => buildFairShareModel({ players, stints, attendance, observations }),
    [players, stints, attendance, observations],
  );

  if (model.squadSize === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title={t('insights.fair.noSquad.title')}
        body={t('insights.fair.noSquad.body')}
        action={<LinkButton to="/club/squad">{t('insights.fair.noSquad.action')}</LinkButton>}
      />
    );
  }
  if (!model.hasEvidence) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={<Users />}
          title={t('insights.fair.noEvidence.title')}
          body={t('insights.fair.noEvidence.body')}
          action={<LinkButton to="/matches">{t('insights.fair.noEvidence.action')}</LinkButton>}
        />
        <Notes model={model} />
      </div>
    );
  }
  return (
    <Reveal>
      <div className="flex flex-col gap-8">
        <Stats model={model} />
        <SecondLook rows={model.secondLook} />
        <Ledger rows={model.ledger} />
        <RelativeAge summary={model.relativeAge} />
        <Notes model={model} />
      </div>
    </Reveal>
  );
}

/** Fair share: who was given minutes and a look, and how little or how much we actually saw. */
export function FairShareView() {
  const source = useFairShareSource();
  return <SourceView source={source}>{(input) => <FairShareBody input={input} />}</SourceView>;
}
