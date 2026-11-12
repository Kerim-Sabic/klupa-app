import { useTranslation } from 'react-i18next';
import { LinkButton } from '../ui';
import { PublicLayout } from './PublicLayout';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <h1 className="font-display text-4xl">{t('notFound.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('notFound.body')}</p>
      <div className="mt-6">
        <LinkButton to="/">{t('notFound.back')}</LinkButton>
      </div>
    </PublicLayout>
  );
}
