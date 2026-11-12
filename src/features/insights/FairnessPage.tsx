import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { PageHeader, Segmented, type SegmentedOption } from '../../ui';

export type FairnessView = 'fair' | 'load' | 'pitch';

const PATHS: Readonly<Record<FairnessView, string>> = {
  fair: '/fairness',
  load: '/fairness/load',
  pitch: '/fairness/pitch',
};

/** The view a URL belongs to. Anything under /fairness that is not load or pitch is fair share. */
export function viewForPath(pathname: string): FairnessView {
  const path = pathname.replace(/\/+$/, '');
  if (path === PATHS.load) return 'load';
  if (path === PATHS.pitch) return 'pitch';
  return 'fair';
}

/** The frame of the insights page: its title, the three views as routes, and the view itself. */
export function FairnessPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const options: SegmentedOption<FairnessView>[] = [
    { value: 'fair', label: t('insights.views.fair') },
    { value: 'load', label: t('insights.views.load') },
    { value: 'pitch', label: t('insights.views.pitch') },
  ];
  return (
    <>
      <PageHeader title={t('insights.title')} subtitle={t('insights.subtitle')} />
      <div className="mb-6">
        <Segmented
          label={t('insights.views.label')}
          options={options}
          value={viewForPath(pathname)}
          onChange={(view) => {
            void navigate(PATHS[view]);
          }}
        />
      </div>
      <Outlet />
    </>
  );
}
