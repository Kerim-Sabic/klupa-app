import { Crosshair, FlaskConical, Footprints, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { env } from '../../lib/env';
import { isEnabled } from '../../lib/flags';
import { ListGroup, ListRow, SectionHeader } from '../../ui';

/** The research behind the product, and the two labs, kept out of the coach's way at the end. */
export function MoreSection() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="today-more" className="flex flex-col gap-6">
      <div>
        <SectionHeader id="today-more" title={t('home.more.title')} />
        <ListGroup labelledBy="today-more">
          <ListRow
            to="/evidence"
            icon={<FlaskConical />}
            tone="pitch"
            title={t('home.more.evidence.title')}
            detail={t('home.more.evidence.body')}
          />
        </ListGroup>
      </div>
      {isEnabled('labs', env.disabled) && (
        <div>
          <SectionHeader
            as="h3"
            id="today-labs"
            title={t('home.more.labs')}
            detail={t('home.more.labsNote')}
          />
          <ListGroup
            labelledBy="today-labs"
            className="sm:grid sm:grid-cols-2 sm:[&>li>*]:after:hidden"
          >
            <ListRow
              to="/movement"
              icon={<Footprints />}
              tone="seen"
              title={t('home.more.movement.title')}
              detail={t('home.more.movement.body')}
            />
            <ListRow
              to="/pro"
              icon={<Trophy />}
              tone="pitch"
              title={t('home.more.pro.title')}
              detail={t('home.more.pro.body')}
            />
            <ListRow
              to="/shot"
              icon={<Crosshair />}
              tone="effort"
              title={t('home.more.shot.title')}
              detail={t('home.more.shot.body')}
            />
          </ListGroup>
        </div>
      )}
    </section>
  );
}
