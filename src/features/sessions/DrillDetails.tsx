import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Drill } from '../../data/drills';
import { localized } from './format';

function Section({
  title,
  level,
  children,
}: {
  readonly title: string;
  readonly level: 3 | 4;
  readonly children: ReactNode;
}) {
  const Heading = level === 3 ? 'h3' : 'h4';
  return (
    <section className="flex flex-col gap-1">
      <Heading className="text-[13px] font-semibold text-ink-soft">{title}</Heading>
      {children}
    </section>
  );
}

export interface DrillDetailsProps {
  readonly drill: Drill;
  /** The saved session card needs only what a coach reads on the pitch. */
  readonly variations?: boolean;
  readonly summary?: boolean;
  /** Level of the sub-headings: 3 under a sheet's title, 4 under a drill name in the card. */
  readonly headingLevel?: 3 | 4;
}

/** What to set up and what to say, in the coach's language. Sub-headings sit one level under the caller's own. */
export function DrillDetails({
  drill,
  variations = true,
  summary = true,
  headingLevel = 3,
}: DrillDetailsProps) {
  const { t, i18n } = useTranslation();
  const text = (value: Drill['setup']) => localized(value, i18n.language);
  return (
    <div className="flex flex-col gap-4 text-[15px]">
      {summary && <p className="text-pretty text-ink">{text(drill.summary)}</p>}
      <Section level={headingLevel} title={t('sessions.drill.setup')}>
        <p className="text-pretty">{text(drill.setup)}</p>
      </Section>
      <Section level={headingLevel} title={t('sessions.drill.coachingPoints')}>
        <ul className="list-disc space-y-1 pl-5 marker:text-ink-soft">
          {drill.coachingPoints.map((point) => (
            <li key={point.en} className="text-pretty">
              {text(point)}
            </li>
          ))}
        </ul>
      </Section>
      {variations && (
        <>
          <Section level={headingLevel} title={t('sessions.drill.easier')}>
            <p className="text-pretty">{text(drill.easier)}</p>
          </Section>
          <Section level={headingLevel} title={t('sessions.drill.harder')}>
            <p className="text-pretty">{text(drill.harder)}</p>
          </Section>
        </>
      )}
    </div>
  );
}
