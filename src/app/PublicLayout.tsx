import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { KlupaMark } from '../ui';
import { LanguageSwitch } from './LanguageSwitch';

const PUBLIC_NAV = [
  { to: '/pro', key: 'pro' },
  { to: '/movement', key: 'replay' },
  { to: '/shot', key: 'shot' },
  { to: '/overlay', key: 'overlay' },
  { to: '/evidence', key: 'research' },
] as const;

export const SKIP_LINK_CLASS =
  'sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-raised focus:px-3 focus:py-2 focus:shadow-float';

/** Frame for pages anyone can open: sign-in and the evidence page. */
export function PublicLayout({
  children,
  wide = false,
}: {
  readonly children: ReactNode;
  /** A wider column for dense analysis screens that use two columns on a desktop. */
  readonly wide?: boolean;
}) {
  const { t } = useTranslation();
  const width = wide ? 'max-w-6xl' : 'max-w-5xl';
  return (
    <div className="min-h-dvh">
      <a href="#main" className={SKIP_LINK_CLASS}>
        {t('app.skip')}
      </a>
      <header className="material-chrome sticky top-0 z-30 border-b border-hairline">
        <div className={`mx-auto flex ${width} items-center justify-between gap-3 px-4 py-2.5`}>
          <Link to="/" className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-control">
            <KlupaMark size={32} />
            <span className="font-title text-[22px] leading-none">{t('app.name')}</span>
          </Link>
          <nav aria-label={t('nav.public.label')} className="hidden items-center gap-1 lg:flex">
            {PUBLIC_NAV.map(({ to, key }) => (
              <NavLink
                key={key}
                to={to}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium whitespace-nowrap ${isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'}`
                }
              >
                {t(`nav.public.${key}`)}
              </NavLink>
            ))}
          </nav>
          <LanguageSwitch />
        </div>
      </header>
      <main id="main" className={`page-settle mx-auto ${width} px-4 pt-8 pb-10 sm:pt-12`}>
        {children}
      </main>
      <footer className={`mx-auto ${width} px-4 pb-10 text-footnote text-ink-soft`}>
        <Link
          to="/status"
          className="inline-flex min-h-11 items-center rounded-control underline decoration-hairline underline-offset-4 hover:text-ink"
        >
          {t('status.link')}
        </Link>
      </footer>
    </div>
  );
}
