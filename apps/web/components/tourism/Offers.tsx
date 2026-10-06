import Link from 'next/link';
import { getI18n } from '@/lib/i18n/server';
import { offerConditions, offerValue, type PublicOffer } from '@/lib/offers';

export function OfferCard({ offer, withTarget = false }: { offer: PublicOffer; withTarget?: boolean }) {
  const i = getI18n();
  const title = i.field(offer as any, 'title') ?? offer.title;
  const desc = i.field(offer as any, 'description') ?? offer.description;
  const targetTitle = offer.target_title ? (i.field({ i18n: offer.target_i18n, title: offer.target_title } as any, 'title') ?? offer.target_title) : null;
  const href = offer.target_slug ? i.lp(`/${offer.target_kind === 'activity' ? 'activites' : 'voyages'}/${offer.target_slug}`) : null;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-secondary-100 px-3 py-1 text-xs font-bold text-secondary-700">{i.t(`offer.kind.${offer.kind}` as 'offer.kind.discount')}</span>
        <span className="font-display text-2xl font-extrabold text-primary-700">{offerValue(offer, i)}</span>
      </div>
      <h3 className="mt-3 font-display text-lg font-bold text-dark">{title}</h3>
      {desc && <p className="mt-1 text-sm text-neutral-600">{desc}</p>}
      {withTarget && targetTitle && (
        <p className="mt-2 text-sm font-medium text-neutral-800">
          {i.t(offer.target_kind === 'activity' ? 'offers.forActivity' : 'offers.forTrip', { title: targetTitle })}
        </p>
      )}
      <ul className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-600">
        {offerConditions(offer, i).map((c) => <li key={c} className="rounded-full bg-neutral-100 px-2.5 py-1">{c}</li>)}
      </ul>
    </>
  );
  const cls = 'block rounded-2xl border border-dashed border-primary-300 bg-white p-5 shadow-sm';
  return href && withTarget
    ? <Link href={href} className={`${cls} transition hover:-translate-y-0.5 hover:shadow-lg`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Bloc « Offres disponibles » des pages de détail. */
export function OffersBlock({ offers }: { offers: PublicOffer[] }) {
  const i = getI18n();
  if (offers.length === 0) return null;
  return (
    <section aria-labelledby="offers-h" className="space-y-3">
      <h2 id="offers-h" className="font-display text-xl font-bold">🏷️ {i.t('offer.block')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{offers.map((o) => <OfferCard key={o.id} offer={o} />)}</div>
    </section>
  );
}
