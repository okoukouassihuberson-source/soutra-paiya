import Link from 'next/link';

const LINKS = [
  { href: '/explorer', label: 'Explorer' },
  { href: '/explorer?cat=hotels', label: 'Hébergements' },
  { href: '/explorer?cat=restaurants', label: 'Restaurants' },
  { href: '/explorer?cat=activites', label: 'Activités' },
  { href: '/destinations', label: 'Destinations' },
  { href: '/voyages/nationaux', label: 'Voyages 🇨🇮' },
  { href: '/voyages/internationaux', label: 'Voyages 🌍' },
  { href: '/explorer?cat=evenements', label: 'Événements' },
];

/** Barre de navigation publique tourisme (desktop) + barre inférieure (mobile). */
export function TourismNav() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="font-display text-lg font-bold">
            Soutra<span className="text-primary-500">-Playce</span>
          </Link>
          <nav aria-label="Navigation principale" className="hidden items-center gap-5 lg:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm font-medium text-neutral-600 hover:text-primary-600">{l.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/mes-voyages" className="hidden font-medium text-neutral-600 hover:text-primary-600 sm:inline">Mes voyages</Link>
            <Link href="/login" className="rounded-full bg-primary-500 px-4 py-2 font-semibold text-white hover:bg-primary-600">Mon compte</Link>
          </div>
        </div>
      </header>
      <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-neutral-200 bg-white/95 text-[11px] backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {[
          ['/', '🏠', 'Accueil'], ['/explorer', '🧭', 'Explorer'], ['/voyages/nationaux', '🚌', 'Voyages'],
          ['/account', '❤️', 'Favoris'], ['/account', '👤', 'Compte'],
        ].map(([href, icon, label]) => (
          <Link key={label} href={href} className="flex flex-col items-center gap-0.5 py-2 text-neutral-600">
            <span aria-hidden className="text-lg">{icon}</span>{label}
          </Link>
        ))}
      </nav>
    </>
  );
}
