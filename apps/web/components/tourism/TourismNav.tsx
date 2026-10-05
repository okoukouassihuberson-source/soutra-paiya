import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { NotificationBell } from './NotificationBell';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MobileDock } from '@/components/home/MobileDock';
import { CommandPalette } from '@/components/search/CommandPalette';
import { AssistantDock } from './AssistantDock';

/** Barre de navigation publique tourisme (desktop) + barre inférieure (mobile). */
export function TourismNav() {
  const { t, lp } = getI18n();
  const LINKS = [
    { href: '/explorer', label: t('nav.explore') },
    { href: '/destinations', label: t('nav.destinations') },
    { href: '/activites', label: t('nav.activities') },
    { href: '/voyages/nationaux', label: t('nav.trips') },
    { href: '/promotions', label: t('nav.promotions') },
    { href: '/assistant', label: t('nav.assistant') },
  ];
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={lp('/')} className="shrink-0 whitespace-nowrap font-display text-lg font-bold">
            Soutra<span className="text-primary-700">-Playce</span>
          </Link>
          <nav aria-label={t('nav.main')} className="hidden items-center gap-4 xl:flex xl:gap-5">
            {LINKS.map((l) => (
              <Link key={l.href} href={lp(l.href)} className="whitespace-nowrap text-sm font-medium text-neutral-600 hover:text-primary-700">{l.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <CommandPalette />
            <LanguageSwitcher />
            <NotificationBell />
            <Link href={lp('/organisateur')} className="hidden whitespace-nowrap font-medium text-neutral-600 hover:text-primary-700 2xl:inline">{t('nav.organizer')}</Link>
            <Link href={lp('/mes-voyages')} className="hidden whitespace-nowrap font-medium text-neutral-600 hover:text-primary-700 xl:inline">{t('nav.myTrips')}</Link>
            <Link href={lp('/login')} className="hidden whitespace-nowrap rounded-full bg-primary-500 px-4 py-2 font-semibold text-night hover:bg-primary-400 xl:inline-flex">{t('nav.myAccount')}</Link>
          </div>
        </div>
      </header>
      <MobileDock />
      <AssistantDock />
    </>
  );
}
