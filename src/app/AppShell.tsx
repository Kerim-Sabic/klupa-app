import { Activity, ClipboardList, House, Scale, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useActiveClub } from '../lib/club';
import { KlupaMark } from '../ui';
import { SPRING } from '../ui/internal';
import { SKIP_LINK_CLASS } from './PublicLayout';

const NAV = [
  { to: '/', key: 'home', icon: House, end: true },
  { to: '/matches', key: 'matches', icon: Activity, end: false },
  { to: '/training', key: 'training', icon: ClipboardList, end: false },
  { to: '/fairness', key: 'fairness', icon: Scale, end: false },
  { to: '/club', key: 'club', icon: Shield, end: false },
] as const;

const ITEM = [
  'group relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control',
  'text-caption font-semibold transition-[color,transform] duration-120 ease-touch active:scale-[0.94]',
  'md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-[15px] md:active:scale-[0.98]',
].join(' ');

/**
 * Signed-in frame. On a phone the five destinations sit under the thumb as a translucent tab
 * bar; from tablet width they become a rail on the left. The active place is marked by a
 * highlight that slides from the previous one, plus colour and a heavier icon, never colour
 * alone.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const club = useActiveClub();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <a href="#main" className={SKIP_LINK_CLASS}>
        {t('app.skip')}
      </a>
      <nav
        aria-label={t('nav.label')}
        className="material-chrome fixed inset-x-0 bottom-0 z-30 border-t border-hairline pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-dvh md:border-t-0 md:border-r md:pb-0"
      >
        <div className="hidden items-center gap-2.5 px-5 pt-6 pb-1 md:flex">
          <KlupaMark size={30} />
          <span className="font-title text-[24px] leading-none">{t('app.name')}</span>
        </div>
        <p className="hidden truncate px-5 pb-5 text-footnote text-ink-soft md:block">
          {club.teamName} · {club.clubName}
        </p>
        <ul className="grid grid-cols-5 px-1 md:grid-cols-1 md:gap-0.5 md:px-3">
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <li key={key}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `${ITEM} ${isActive ? 'text-pitch' : 'text-ink-soft hover:text-ink'}`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        aria-hidden="true"
                        layoutId="nav-highlight"
                        transition={SPRING.snappy}
                        className="absolute inset-x-1.5 inset-y-1 -z-10 rounded-[12px] bg-mute-soft md:inset-0"
                      />
                    )}
                    <Icon aria-hidden="true" size={23} strokeWidth={isActive ? 2.4 : 1.9} />
                    <span>{t(`nav.${key}`)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main
        id="main"
        // min-w-0 lets wide tables scroll inside their own box instead of widening the page.
        className="mx-auto w-full max-w-5xl min-w-0 px-4 pt-7 pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:px-10 md:pt-12 md:pb-16"
      >
        {/* Keyed by route: each new page settles in once; re-renders never replay it. */}
        <div key={pathname} className="page-settle">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
