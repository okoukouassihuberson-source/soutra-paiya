'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { stripLocale } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/client';

const I = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  explore: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5-5 2 2-5z',
  map: 'M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7zM9 4v13m6-10v13',
  user: 'M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
const Icon = ({ d }: { d: string }) => (
  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

/** Navigation mobile : 4 destinations + bouton central « Soutra » (assistant IA). */
export function MobileDock() {
  const { t, lp } = useI18n();
  const { path } = stripLocale(usePathname() ?? '/');
  const items = [
    { href: '/', label: t('home2.dock.home'), icon: I.home, active: path === '/' },
    { href: '/explorer', label: t('home2.dock.explore'), icon: I.explore, active: path.startsWith('/explorer') && !path.includes('view=map') },
    null,
    { href: '/explorer?view=map', label: t('home2.dock.map'), icon: I.map, active: false },
    { href: '/account', label: t('home2.dock.account'), icon: I.user, active: path.startsWith('/account') || path.startsWith('/login') },
  ];
  return (
    <nav aria-label={t('nav.mobile')} className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur xl:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {items.map((it, k) => it ? (
          <li key={it.href}>
            <Link href={lp(it.href)} aria-current={it.active ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${it.active ? 'text-primary-700' : 'text-neutral-600 active:text-primary-700'}`}>
              <Icon d={it.icon} />
              <span>{it.label}</span>
              <span aria-hidden className={`h-1 w-1 rounded-full ${it.active ? 'bg-primary-500' : 'bg-transparent'}`} />
            </Link>
          </li>
        ) : (
          <li key="soutra" className="flex justify-center">
            <Link href={lp('/assistant')} aria-label={t('home2.dock.soutraAria')}
              className="-mt-6 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-night text-white shadow-lg shadow-night/40 ring-4 ring-white transition active:scale-95">
              <span aria-hidden className="text-xl leading-none text-primary-400">✦</span>
              <span className="text-[10px] font-bold">{t('home2.dock.soutra')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
