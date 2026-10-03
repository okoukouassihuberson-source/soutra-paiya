import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { EstablishmentLink } from '@/components/marketing/EstablishmentLink';
import { LanguageSwitcher } from '@/components/tourism/LanguageSwitcher';
import { BrandMark } from '@/components/layout/BrandMark';

// Liens optionnels : ne s'affichent que s'ils sont configurés (aucun lien mort en production).
const OPTIONAL = {
  contact: process.env.NEXT_PUBLIC_CONTACT_EMAIL ? `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL}` : '',
  ios: process.env.NEXT_PUBLIC_APP_STORE_URL ?? '',
  android: process.env.NEXT_PUBLIC_PLAY_STORE_URL ?? '',
  instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM ?? '',
  facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK ?? '',
  x: process.env.NEXT_PUBLIC_SOCIAL_X ?? '',
  tiktok: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK ?? '',
};

export function SiteFooter() {
  const { t, lp, locale } = getI18n();
  const a = 'inline-flex min-h-[32px] items-center text-sm text-neutral-400 transition hover:text-white';
  const social = ([['Instagram', OPTIONAL.instagram], ['Facebook', OPTIONAL.facebook], ['X', OPTIONAL.x], ['TikTok', OPTIONAL.tiktok]] as const).filter(([, u]) => u);
  const legal = [[t('home2.footer.terms'), lp('/cgu')], [t('home2.footer.privacy'), lp('/confidentialite')], [t('home2.footer.about'), lp('/a-propos')]] as const;
  const col = 'text-xs font-bold uppercase tracking-[0.14em] text-neutral-300';
  return (
    <footer className="bg-night pb-8 pt-14 text-neutral-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href={lp('/')} className="inline-flex items-center gap-2 font-display text-xl font-extrabold"><BrandMark size="sm" decorative /><span className="text-white">Soutra<span className="text-primary-400">-Playce</span></span></Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed">{t('home2.footer.tagline')}</p>
            {(OPTIONAL.ios || OPTIONAL.android) && (
              <div className="mt-5">
                <p className={col}>{t('home2.footer.app')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {OPTIONAL.ios && <a href={OPTIONAL.ios} className="rounded-xl border border-white/15 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10">App Store</a>}
                  {OPTIONAL.android && <a href={OPTIONAL.android} className="rounded-xl border border-white/15 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/10">Google Play</a>}
                </div>
              </div>
            )}
          </div>

          <nav aria-label={t('home2.footer.explore')}>
            <h3 className={col}>{t('home2.footer.explore')}</h3>
            <ul className="mt-3 space-y-1">
              <li><Link className={a} href={lp('/explorer')}>{t('nav.explore')}</Link></li>
              <li><Link className={a} href={lp('/destinations')}>{t('nav.destinations')}</Link></li>
              <li><Link className={a} href={lp('/activites')}>{t('nav.activities')}</Link></li>
              <li><Link className={a} href={lp('/voyages/nationaux')}>{t('nav.tripsNational')}</Link></li>
              <li><Link className={a} href={lp('/voyages/internationaux')}>{t('nav.tripsInternational')}</Link></li>
            </ul>
          </nav>

          <nav aria-label={t('home2.footer.pros')}>
            <h3 className={col}>{t('home2.footer.pros')}</h3>
            <ul className="mt-3 space-y-1">
              <li><EstablishmentLink className={a}>{t('home2.footer.proSpace')}</EstablishmentLink></li>
              <li><Link className={a} href={lp('/organisateur')}>{t('home2.footer.partner')}</Link></li>
              <li><Link className={a} href={lp('/subscribe')}>Premium</Link></li>
            </ul>
          </nav>

          <nav aria-label={t('home2.footer.help')}>
            <h3 className={col}>{t('home2.footer.help')}</h3>
            <ul className="mt-3 space-y-1">
              {locale === 'fr' && <li><a className={a} href="/#how">{t('home2.footer.how')}</a></li>}
              <li><Link className={a} href={lp('/loyalty')}>{t('home2.loyaltyBadge')}</Link></li>
              {OPTIONAL.contact && <li><a className={a} href={OPTIONAL.contact}>{t('home2.footer.contact')}</a></li>}
              {legal.map(([label, url]) => <li key={label}><Link className={a} href={url}>{label}</Link></li>)}
            </ul>
            {social.length > 0 && (
              <div className="mt-4">
                <h3 className={col}>{t('home2.footer.social')}</h3>
                <ul className="mt-2 flex flex-wrap gap-x-4">{social.map(([label, url]) => <li key={label}><a className={a} href={url} rel="noopener noreferrer" target="_blank">{label}</a></li>)}</ul>
              </div>
            )}
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-sm sm:flex-row">
          <p>© {new Date().getFullYear()} Soutra-Playce. {t('home2.footer.rights')}</p>
          <div className="flex items-center gap-4"><LanguageSwitcher tone="dark" /><p className="font-semibold text-white">{t('home2.footer.made')}</p></div>
        </div>
      </div>
    </footer>
  );
}
