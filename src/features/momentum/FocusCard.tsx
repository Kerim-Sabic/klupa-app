import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, LinkButton } from '../../ui';
import { formatXg } from './chartModel';
import { suggestFocus, type Reason, type SuggestEvent } from './suggest';

function useReasonText() {
  const { t, i18n } = useTranslation();
  return (reason: Reason): string => {
    if (reason.code === 'chanceQualityGap') {
      return t('review.reason.chanceQualityGap', {
        ours: formatXg(reason.values.ours ?? 0, i18n.language),
        theirs: formatXg(reason.values.theirs ?? 0, i18n.language),
      });
    }
    return t(`review.reason.${reason.code}`, reason.values);
  };
}

interface FocusCardProps {
  readonly events: readonly SuggestEvent[];
  readonly matchId: string;
}

/** Training prompts from the match's counts, with the counts shown and their limits named. */
export function FocusCard({ events, matchId }: FocusCardProps) {
  const { t } = useTranslation();
  const reasonText = useReasonText();
  const result = suggestFocus(events);

  if (result.status === 'insufficient') {
    return (
      <p className="text-ink-soft">
        {t('review.focus.insufficient', { events: result.events, minimum: result.minimum })}
      </p>
    );
  }
  if (result.suggestions.length === 0) {
    return <p className="text-ink-soft">{t('review.focus.none')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-prose text-ink-soft">{t('review.focus.disclaimer')}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {result.suggestions.map((suggestion) => (
          <Card as="li" key={suggestion.focus} className="flex flex-col gap-3">
            <h3 className="text-[17px] font-semibold text-ink">
              {t(`review.focus.${suggestion.focus}.name`)}
            </h3>
            <div>
              <h4 className="text-[13px] font-semibold text-ink-soft">
                {t('review.focus.countsTitle')}
              </h4>
              <ul className="mt-1 list-disc pl-5 text-ink tabular-nums">
                {suggestion.reasons.map((reason) => (
                  <li key={reason.code}>{reasonText(reason)}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-ink-soft">
                {t('review.focus.limitTitle')}
              </h4>
              <p className="mt-1 text-[15px] text-ink-soft">
                {t(`review.focus.${suggestion.focus}.limit`)}
              </p>
            </div>
            <LinkButton
              variant="secondary"
              icon={<ClipboardList />}
              to={`/training/new?focus=${suggestion.focus}&match=${encodeURIComponent(matchId)}`}
              className="mt-auto"
            >
              {t('review.focus.plan', { focus: t(`review.focus.${suggestion.focus}.name`) })}
            </LinkButton>
          </Card>
        ))}
      </ul>
    </div>
  );
}
