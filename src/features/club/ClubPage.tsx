import { useMutation } from '@tanstack/react-query';
import { FlaskConical, History, LogOut, Settings, ShieldCheck, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageSwitch } from '../../app/LanguageSwitch';
import { useAuth } from '../../lib/auth';
import { useActiveClub } from '../../lib/club';
import { usePlayers } from '../../lib/data';
import { errorKey } from '../../lib/errors';
import { Button, Card, CardTitle, PageHeader, Pill, RevealList, useToast } from '../../ui';
import { canManage } from './model';
import { SampleSeasonCard } from './SampleSeasonCard';

interface Destination {
  readonly key: 'squad' | 'settings' | 'privacy' | 'activity' | 'evidence';
  readonly to: string;
  readonly icon: ReactNode;
}

const DESTINATIONS: readonly Destination[] = [
  { key: 'squad', to: '/club/squad', icon: <Users aria-hidden="true" size={22} /> },
  { key: 'settings', to: '/club/settings', icon: <Settings aria-hidden="true" size={22} /> },
  { key: 'privacy', to: '/club/privacy', icon: <ShieldCheck aria-hidden="true" size={22} /> },
  { key: 'activity', to: '/club/activity', icon: <History aria-hidden="true" size={22} /> },
  { key: 'evidence', to: '/evidence', icon: <FlaskConical aria-hidden="true" size={22} /> },
];

/** The club at a glance, a door to each of its pages, and the account controls. */
export function ClubPage() {
  const { t } = useTranslation();
  const club = useActiveClub();
  const players = usePlayers();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const leave = useMutation({
    mutationFn: signOut,
    onError: (error) => {
      toast({ tone: 'error', message: t(errorKey(error)) });
    },
  });

  const offerSample =
    club.isDemo && canManage(club.role) && players.isSuccess && players.data.length === 0;

  return (
    <>
      <PageHeader
        title={t('club.overview.title')}
        subtitle={t('club.overview.subtitle', { team: club.teamName, club: club.clubName })}
      />
      <div className="flex flex-col gap-4">
        <p>
          <Pill tone="mute">
            {t('club.overview.roleLine', { role: t(`club.overview.role.${club.role}`) })}
          </Pill>
        </p>
        {offerSample && <SampleSeasonCard />}
        <RevealList as="ul" className="grid gap-3 sm:grid-cols-2">
          {DESTINATIONS.map((destination) => (
            <Card key={destination.key} as="li" interactive className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-pitch">
                {destination.icon}
                <CardTitle>
                  {/* The link stretches over the whole card, so the card is the tap target. */}
                  <Link
                    to={destination.to}
                    className="text-ink no-underline after:absolute after:inset-0 after:rounded-card after:content-['']"
                  >
                    {t(`club.overview.${destination.key}.title`)}
                  </Link>
                </CardTitle>
              </div>
              <p className="text-ink-soft">{t(`club.overview.${destination.key}.body`)}</p>
            </Card>
          ))}
        </RevealList>
        <Card as="section" aria-labelledby="club-account" className="flex flex-col gap-4">
          <CardTitle>
            <span id="club-account">{t('club.overview.account.title')}</span>
          </CardTitle>
          <LanguageSwitch />
          <div className="flex flex-col items-start gap-2">
            <Button
              variant="secondary"
              icon={<LogOut />}
              loading={leave.isPending}
              onClick={() => {
                leave.mutate();
              }}
            >
              {t('club.overview.account.signOut')}
            </Button>
            {club.isDemo && (
              <p className="text-[13px] text-ink-soft">{t('club.overview.account.demoNote')}</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
