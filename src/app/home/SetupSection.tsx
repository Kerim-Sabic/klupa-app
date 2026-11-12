import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { SampleSeasonAction } from '../../features/club/SampleSeasonAction';
import { useSampleSeason } from '../../features/club/useSampleSeason';
import { Card, LinkButton, SectionHeader } from '../../ui';
import { cx } from '../../ui/internal';
import type { ChecklistStep, StepKey } from './model';

/** Set by the welcome page for a new demo club: "load the sample season on arrival". */
export const SAMPLE_PARAM = 'sample';

const STEP_LINK: Record<StepKey, string> = {
  squad: '/club/squad',
  match: '/matches',
  training: '/training/new',
};

function StepRow({
  step,
  index,
  current,
}: {
  readonly step: ChecklistStep;
  readonly index: number;
  readonly current: boolean;
}) {
  const { t } = useTranslation();
  return (
    <li
      aria-current={current ? 'step' : undefined}
      className={cx(
        'flex gap-3.5 rounded-control p-3',
        current && 'bg-pitch-soft',
        step.done && 'opacity-80',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'grid size-8 shrink-0 place-items-center rounded-full text-[15px] font-semibold',
          step.done && 'bg-pitch text-raised',
          !step.done && current && 'bg-ink text-on-ink',
          !step.done && !current && 'border border-line text-ink-soft',
        )}
      >
        {step.done ? <Check size={17} strokeWidth={3} /> : index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={cx('font-semibold text-ink', step.done && 'line-through decoration-1')}>
          {t(`home.setup.${step.key}.title`)}
          {step.done && <span className="sr-only">: {t('home.setup.done')}</span>}
        </p>
        {!step.done && (
          <p className="text-footnote text-pretty text-ink-soft">
            {t(`home.setup.${step.key}.body`)}
          </p>
        )}
        {current && (
          <LinkButton to={STEP_LINK[step.key]} className="mt-2 self-start">
            {t(`home.setup.${step.key}.title`)}
          </LinkButton>
        )}
      </div>
    </li>
  );
}

/** A brand-new club's three steps, the next one highlighted with the one button that does it. */
export function SetupSection({
  steps,
  current,
}: {
  readonly steps: readonly ChecklistStep[];
  readonly current: StepKey;
}) {
  const { t } = useTranslation();
  const done = steps.filter((step) => step.done).length;
  return (
    <section aria-labelledby="today-setup">
      <SectionHeader
        id="today-setup"
        title={t('home.setup.title')}
        detail={t('home.setup.progress', { done, total: steps.length })}
      />
      <Card padded={false} className="p-2">
        <ol className="flex flex-col gap-1">
          {steps.map((step, index) => (
            <StepRow key={step.key} step={step} index={index} current={step.key === current} />
          ))}
        </ol>
      </Card>
    </section>
  );
}

/**
 * An empty demo club: the sample season, one tap away, loaded right here. A visitor who has
 * just made a demo club arrives with `?sample=1` and the season loads by itself, once.
 */
export function DemoStart() {
  const { t } = useTranslation();
  const load = useSampleSeason();
  const [params, setParams] = useSearchParams();
  const asked = useRef(false);
  const arrivedForSample = params.get(SAMPLE_PARAM) === '1';
  const { mutate } = load;

  useEffect(() => {
    if (!arrivedForSample || asked.current) return;
    asked.current = true;
    mutate();
    setParams({}, { replace: true });
  }, [arrivedForSample, mutate, setParams]);

  return (
    <Card as="section" aria-labelledby="today-demo" className="flex flex-col items-start gap-3">
      <h2 id="today-demo" className="font-title text-title text-balance">
        {t('home.demo.title')}
      </h2>
      <p className="max-w-prose text-pretty text-ink-soft">{t('home.demo.body')}</p>
      <SampleSeasonAction load={load} size="lg" />
    </Card>
  );
}
