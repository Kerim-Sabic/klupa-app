import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MomentumLab } from '../features/momentum/MomentumLab';
import { ListGroup, ListRow } from '../ui';
import { PublicLayout } from './PublicLayout';

/** Public page: the research behind the product, on professional match data. */
export function EvidencePage() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <MomentumLab />
      <ListGroup label={t('pro.evidenceLink.label')} className="mt-10">
        <ListRow
          to="/pro"
          icon={<Trophy />}
          tone="pitch"
          title={t('pro.evidenceLink.title')}
          detail={t('pro.evidenceLink.body')}
        />
      </ListGroup>
    </PublicLayout>
  );
}
