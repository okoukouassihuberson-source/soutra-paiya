import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Barre de navigation publique tourisme (desktop) + barre inférieure (mobile). */
export function TourismNav() {
  const { t, lp } = getI18n();
  const LINKS = [
    { href: '/explorer', label: t('nav.explore') },
    { href: '/explorer?cat=hotels', label: t('nav.accommodations') },
    { href: '/explorer?cat=restaurants', label: t('nav.restaurants') },
    { href: '/activites', label: t('nav.activities') },
    { href: '/destinations', label: t('nav.destinations') },
    { href: '/voyages/nationaux', label: t('nav.tripsNational') },
    { href: '/voyages/internationaux', label: t('nav.tripsInternational') },
    { href: '/explorer?cat=evenements', label: t('nav.events') },
  ];
  const MOBILE: [string, string, string][] = [
    ['/', '🏠', t('nav.home')], ['/explorer', '🧭', t('nav.explore')], ['/voyages/nationaux', '🚌', t('nav.trips')],
    ['/account', '❤️', t('nav.favorites')], ['/account', '👤', t('nav.account')],
  ];
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={lp('/')} className="shrink-0 whitespace-nowrap font-display text-lg font-bold">
            Soutra<span className="text-primary-500">-Playce</span>
          </Link>
          <nav aria-label={t('nav.main')} className="hidden items-center gap-4 xl:flex xl:gap-5">
            {LINKS.map((l) => (
              <Link key={l.href} href={lp(l.href)} className="whitespace-nowrap text-sm font-medium text-neutral-600 hover:text-primary-600">{l.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <LanguageSwitcher />
            <NotificationBell />
            <Link href={lp('/organisateur')} className="hidden whitespace-nowrap font-medium text-neutral-600 hover:text-primary-600 2xl:inline">{t('nav.organizer')}</Link>
            <Link href={lp('/mes-voyages')} className="hidden whitespace-nowrap font-medium text-neutral-600 hover:text-primary-600 xl:inline">{t('nav.myTrips')}</Link>
            <Link href={lp('/login')} className="whitespace-nowrap rounded-full bg-primary-500 px-4 py-2 font-semibold text-white hover:bg-primary-600">{t('nav.myAccount')}</Link>
          </div>
        </div>
      </header>
      <nav aria-label={t('nav.mobile')} className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-neutral-200 bg-white/95 text-[11px] backdrop-blur xl:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {MOBILE.map(([href, icon, label]) => (
          <Link key={label} href={lp(href)} className="flex flex-col items-center gap-0.5 py-2 text-neutral-600">
            <span aria-hidden className="text-lg">{icon}</span>{label}
          </Link>
        ))}
      </nav>
    </>
  );
}
