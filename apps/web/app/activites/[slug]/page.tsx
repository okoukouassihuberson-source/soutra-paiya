import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { formatDuration, formatXOF, HIGHLIGHT_LABELS, activityCategoryEmoji, activityCategoryLabel } from '@soutra/shared';
import { getActivity } from '@/lib/activities';
import { TourismNav } from '@/components/tourism/TourismNav';
import { ActivityBooking } from './_components/ActivityBooking';
import { ReportButton } from './_components/ReportButton';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const r = await getActivity(params.slug);
  if (!r) return { title: 'Activité introuvable', robots: { index: false } };
  const a = r.activity;
  const title = `${a.title} — ${activityCategoryLabel(a.category)}${a.city ? ` à ${a.city}` : ''}`;
  const description = a.summary ?? `${a.title} : ${formatDuration(a.duration_minutes)}, dès ${formatXOF(a.price_xof)}. Réservez sur Soutra-Playce.`;
  return {
    title, description, alternates: { canonical: `/activites/${a.slug}` },
    openGraph: { title, description, type: 'website', url: `/activites/${a.slug}`, siteName: 'Soutra-Playce', locale: 'fr_CI',
      images: a.cover_url ? [{ url: a.cover_url, width: 1200, height: 630, alt: a.title }] : [] },
    twitter: { card: 'summary_large_image', title, description, images: a.cover_url ? [a.cover_url] : [] },
  };
}

const Row = ({ k, v }: { k: string; v?: string | null }) => v ? (
  <div className="flex gap-3 border-b border-neutral-100 py-2 text-sm"><dt className="w-36 shrink-0 font-semibold text-neutral-500">{k}</dt><dd>{v}</dd></div>
) : null;

export default async function ActivityPage({ params }: { params: { slug: string } }) {
  const r = await getActivity(params.slug);
  if (!r) notFound();
  const { activity: a, slots, reviews, destination } = r;

  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'TouristAttraction', name: a.title,
    description: a.summary ?? a.description ?? undefined, image: a.cover_url ?? undefined,
    ...(a.city ? { address: { '@type': 'PostalAddress', addressLocality: a.city, addressCountry: 'CI' } } : {}),
    ...(a.latitude != null && a.longitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: a.latitude, longitude: a.longitude } } : {}),
    ...(a.rating_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: a.rating_avg, reviewCount: a.rating_count } } : {}),
    offers: { '@type': 'Offer', price: a.price_xof, priceCurrency: 'XOF', availability: slots.length ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut' },
  };

  return (
    <>
      <TourismNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <main className="pb-28">
        <div className="relative h-64 bg-neutral-200 sm:h-96">
          {a.cover_url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.cover_url} alt={a.title} className="h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-6 text-white sm:px-6 lg:px-8">
            {a.highlight && <span className="rounded-full bg-primary-500 px-3 py-1 text-xs font-bold">{HIGHLIGHT_LABELS[a.highlight]}</span>}
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{a.title}</h1>
            <p className="text-white/85">{activityCategoryEmoji(a.category)} {activityCategoryLabel(a.category)}{a.city ? ` · ${a.city}` : ''} · {formatDuration(a.duration_minutes)}
              {a.rating_count > 0 ? ` · ★ ${Number(a.rating_avg).toFixed(1)} (${a.rating_count})` : ''}</p>
          </div>
        </div>

        <div className="mx-auto mt-8 grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_380px] lg:px-8">
          <div className="space-y-8">
            {a.description && <p className="whitespace-pre-line text-neutral-700">{a.description}</p>}
            <section aria-labelledby="infos"><h2 id="infos" className="mb-2 font-display text-xl font-bold">Informations</h2>
              <dl>
                <Row k="Durée" v={formatDuration(a.duration_minutes)} />
                <Row k="Lieu" v={[a.address, a.city].filter(Boolean).join(', ')} />
                <Row k="Âge minimum" v={a.min_age > 0 ? `${a.min_age} ans` : null} />
                <Row k="Taille du groupe" v={`jusqu'à ${a.max_group_size} personnes par réservation`} />
                <Row k="Départ garanti dès" v={a.min_participants > 1 ? `${a.min_participants} participants` : null} />
                <Row k="Langues" v={a.languages.join(', ')} />
              </dl>
            </section>
            {(a.includes.length > 0 || a.excludes.length > 0) && (
              <section className="grid gap-6 sm:grid-cols-2">
                {a.includes.length > 0 && <div><h2 className="mb-2 font-display text-xl font-bold">Inclus</h2><ul className="space-y-1 text-sm">{a.includes.map((i) => <li key={i}>✅ {i}</li>)}</ul></div>}
                {a.excludes.length > 0 && <div><h2 className="mb-2 font-display text-xl font-bold">Non inclus</h2><ul className="space-y-1 text-sm">{a.excludes.map((i) => <li key={i}>➖ {i}</li>)}</ul></div>}
              </section>
            )}
            {a.gallery_urls.length > 0 && (
              <section><h2 className="mb-3 font-display text-xl font-bold">Photos</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{a.gallery_urls.slice(0, 8).map((u) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={u} src={u} alt={a.title} loading="lazy" className="aspect-square rounded-xl object-cover" />)}</div>
              </section>
            )}
            {a.conditions && <section><h2 className="mb-2 font-display text-xl font-bold">Conditions</h2><p className="whitespace-pre-line text-sm text-neutral-700">{a.conditions}</p></section>}
            {a.latitude != null && a.longitude != null && (
              <section><h2 className="mb-3 font-display text-xl font-bold">🗺️ Lieu</h2>
                <iframe title={`Carte de ${a.title}`} loading="lazy" className="h-64 w-full rounded-2xl border"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${a.longitude - 0.02}%2C${a.latitude - 0.012}%2C${a.longitude + 0.02}%2C${a.latitude + 0.012}&layer=mapnik&marker=${a.latitude}%2C${a.longitude}`} />
                <a className="mt-2 inline-block text-sm font-semibold text-primary-600 underline" href={`https://www.openstreetmap.org/directions?to=${a.latitude}%2C${a.longitude}`} target="_blank" rel="noreferrer">Itinéraire</a>
              </section>
            )}
            <section aria-labelledby="avis"><h2 id="avis" className="mb-3 font-display text-xl font-bold">Avis {a.rating_count > 0 && <span className="text-base font-normal text-neutral-500">· ★ {Number(a.rating_avg).toFixed(1)} sur 5 ({a.rating_count})</span>}</h2>
              {reviews.length === 0 ? <p className="text-sm text-neutral-500">Pas encore d’avis. Les avis sont déposés par les voyageurs ayant réalisé l’activité.</p> : (
                <ul className="space-y-4">{reviews.map((rv) => (
                  <li key={rv.id} className="rounded-xl border border-neutral-200 p-4">
                    <div className="flex items-center justify-between"><b className="text-sm">{rv.author}</b><span className="text-amber-600" aria-label={`${rv.rating} sur 5`}>{'★'.repeat(rv.rating)}<span className="text-neutral-300">{'★'.repeat(5 - rv.rating)}</span></span></div>
                    {rv.comment && <p className="mt-1 text-sm text-neutral-700">{rv.comment}</p>}
                    <div className="mt-1 flex items-center justify-between text-xs text-neutral-400"><span>{new Date(rv.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</span><ReportButton reviewId={rv.id} /></div>
                  </li>))}</ul>
              )}
            </section>
            {destination && <Link href={`/destinations/${destination.slug}`} className="inline-block font-semibold text-primary-600 underline">Explorer {destination.name} →</Link>}
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-3 text-2xl font-bold text-primary-600"><span className="text-sm font-normal text-neutral-500">dès </span>{formatXOF(a.price_xof)}<span className="text-sm font-normal text-neutral-500"> / pers.</span></p>
            <ActivityBooking slots={slots} basePrice={a.price_xof} maxGroup={a.max_group_size} minAge={a.min_age} />
            <div className="mt-3 flex gap-2 text-sm">
              {a.contact_whatsapp && <a className="flex-1 rounded-xl border py-2 text-center font-medium" href={`https://wa.me/${a.contact_whatsapp.replace(/\D/g, '')}`}>WhatsApp</a>}
              {a.contact_phone && <a className="flex-1 rounded-xl border py-2 text-center font-medium" href={`tel:${a.contact_phone}`}>Appeler</a>}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
