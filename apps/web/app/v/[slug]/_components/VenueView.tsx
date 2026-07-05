'use client';

import Link from 'next/link';
import { VenueGallery } from '@/components/venue/VenueGallery';
import { VenueStatusBadge } from '@/components/venue/VenueStatusBadge';
import { CategorizedPhotos } from '@/components/venue/CategorizedPhotos';
import { BUSINESS_TYPE_LABELS, type VenueBusinessType } from '@soutra/shared';

interface Venue {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  address: string;
  city: string | null;
  district: string | null;
  commune: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  cover_url: string | null;
  gallery_urls: string[] | null;
  video_urls: string[] | null;
  opening_hours: Record<string, [string, string]> | null;
  avg_price_xof: number | null;
  rating_avg: number;
  rating_count: number;
  amenities: string[] | null;
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Lundi', tue: 'Mardi', wed: 'Mercredi', thu: 'Jeudi',
  fri: 'Vendredi', sat: 'Samedi', sun: 'Dimanche',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function VenueView({
  venue,
  businessType,
  categoryEmoji,
  categoryLabel,
}: {
  venue: Venue;
  businessType: VenueBusinessType;
  categoryEmoji: string;
  categoryLabel: string;
}) {
  const cta = BUSINESS_TYPE_LABELS[businessType];
  const fullAddress = [venue.address, venue.district, venue.commune, venue.city]
    .filter(Boolean).join(', ');

  // Deep-link mobile pour ouvrir la fiche dans l'app si installée
  const deepLink = `soutrapaiya://venue/${venue.id}`;

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-extrabold text-white shadow-sm" style={{ background: 'linear-gradient(135deg,#FF6B1A,#E5500D)' }}>SP</span>
            <span><span className="text-dark">Soutra</span><span className="text-primary-500">-Playce</span></span>
          </Link>
          <a
            href={deepLink}
            className="hidden rounded-full bg-primary-500 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-primary-600 sm:inline-flex"
          >
            Ouvrir dans l&apos;app
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {/* ═══ GALERIE ═══ */}
        <VenueGallery
          cover={venue.cover_url}
          gallery={venue.gallery_urls}
          videos={venue.video_urls}
          alt={venue.name}
        />

        {/* ═══ PHOTOS PAR CATÉGORIE (Phase 5 refonte UX) ═══ */}
        <CategorizedPhotos venueId={venue.id} />

        {/* ═══ INFOS ═══ */}
        <div className="mt-6 grid gap-6 lg:mt-10 lg:grid-cols-3 lg:gap-10">
          {/* Colonne principale */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary-700">
                  <span>{categoryEmoji}</span>
                  <span>{categoryLabel}</span>
                </div>
                <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-dark sm:text-4xl lg:text-5xl">
                  {venue.name}
                </h1>
                <p className="mt-2 text-sm text-neutral-600 sm:text-base">
                  📍 {fullAddress}
                </p>
                {/* Badge "Ouvert maintenant" compact, sous l'adresse */}
                {venue.opening_hours && Object.keys(venue.opening_hours).length > 0 && (
                  <div className="mt-2">
                    <VenueStatusBadge hours={venue.opening_hours} compact />
                  </div>
                )}
              </div>
              {venue.rating_count > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-right">
                  <div className="flex items-center gap-1 font-bold text-amber-700">
                    ★ <span className="font-mono">{venue.rating_avg.toFixed(1)}</span>
                  </div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-amber-600">
                    {venue.rating_count} avis
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            {venue.description && (
              <section className="mt-8">
                <h2 className="font-display text-xl font-bold">À propos</h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-700 sm:text-base">
                  {venue.description}
                </p>
              </section>
            )}

            {/* Amenities */}
            {venue.amenities && venue.amenities.length > 0 && (
              <section className="mt-8">
                <h2 className="font-display text-xl font-bold">Équipements</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {venue.amenities.map((a) => (
                    <span key={a} className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                      {a}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Horaires (compact) */}
            {venue.opening_hours && Object.keys(venue.opening_hours).length > 0 && (
              <section className="mt-8">
                <h2 className="font-display text-xl font-bold">Horaires</h2>
                {/* Badge "Ouvert / Ferme à" en pleine taille */}
                <div className="mt-3">
                  <VenueStatusBadge hours={venue.opening_hours} />
                </div>
                <dl className="mt-3 divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                  {DAY_ORDER.map((d) => {
                    const slot = venue.opening_hours?.[d];
                    return (
                      <div key={d} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <dt className="font-medium text-neutral-700">{DAY_LABELS[d]}</dt>
                        <dd className="font-mono text-neutral-900">
                          {slot && Array.isArray(slot) && slot.length === 2
                            ? `${slot[0]} – ${slot[1]}`
                            : <span className="text-neutral-400">Fermé</span>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            )}
          </div>

          {/* Colonne droite : sticky CTA + contact (desktop) */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
              {venue.avg_price_xof != null && venue.avg_price_xof > 0 && (
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  À partir de <span className="font-display text-xl font-black text-dark">{venue.avg_price_xof.toLocaleString('fr-FR')} FCFA</span>
                </p>
              )}

              <a
                href={deepLink}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 px-5 py-3.5 font-bold text-white shadow-lg shadow-primary-500/30 transition hover:scale-[1.02]"
              >
                <span>{cta.emoji}</span>
                <span>{cta.verb}</span>
              </a>
              <p className="mt-2 text-center text-[11px] text-neutral-500">
                Ouvre l&apos;app Soutra-Playce
              </p>

              {/* Contact rapide */}
              <div className="mt-5 space-y-2 border-t border-neutral-100 pt-5">
                {venue.phone && (
                  <a
                    href={`tel:${venue.phone}`}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    {venue.phone}
                  </a>
                )}
                {venue.whatsapp && (
                  <a
                    href={`https://wa.me/${venue.whatsapp.replace(/[^\d]/g, '')}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-600">
                      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0c3.181 0 6.167 1.24 8.413 3.488A11.821 11.821 0 0 1 23.94 11.91c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.87 9.87 0 0 0 1.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.149-.174.198-.298.297-.496.099-.198.05-.372-.025-.521-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
                    </svg>
                    WhatsApp
                  </a>
                )}
                {venue.email && (
                  <a
                    href={`mailto:${venue.email}`}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    {venue.email}
                  </a>
                )}
                {venue.website && (
                  <a
                    href={venue.website}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    Site web
                  </a>
                )}
                {/* Itinéraire */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  Itinéraire
                </a>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-neutral-500">
              Découvre plus de venues sur l&apos;app{' '}
              <Link href="/" className="font-semibold text-primary-600 hover:underline">
                Soutra-Playce
              </Link>
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
