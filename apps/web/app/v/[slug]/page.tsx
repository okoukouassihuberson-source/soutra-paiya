import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase-server';
import { VenueView } from './_components/VenueView';
import { categoryLabel, categoryEmoji, businessTypeOf } from '@soutra/shared';

/**
 * /v/[slug] — fiche venue PUBLIQUE (pas d'auth requise).
 *
 * Objectifs :
 *   • SEO (indexable, Open Graph pour partage WhatsApp/Facebook)
 *   • Vue desktop pour qui ne veut pas installer l'app mobile
 *   • Lien partageable depuis le mobile (un user envoie un lien à un ami)
 *
 * Le CTA principal s'adapte au businessType de la catégorie (PR1 taxonomie 0057)
 * et redirige vers : l'app mobile (deep-link soutrapaiya://) si installée,
 * ou les stores sinon.
 */

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const sb = supabaseServer();
  const { data: venue } = await (sb as any)
    .from('venues')
    .select('name, description, category, city, district, cover_url, slug')
    .eq('slug', params.slug)
    .eq('status', 'active')
    .maybeSingle();
  if (!venue) {
    return { title: 'Lieu introuvable — Soutra-Explore', robots: { index: false } };
  }

  const title = `${venue.name} — ${categoryLabel(venue.category)} à ${venue.city}`;
  const description = venue.description?.slice(0, 160)
    || `Découvre ${venue.name}, ${categoryLabel(venue.category)} à ${[venue.district, venue.city].filter(Boolean).join(', ')}. Réserve sur Soutra-Explore.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/v/${venue.slug}`,
      images: venue.cover_url ? [{ url: venue.cover_url, width: 1200, height: 630, alt: venue.name }] : [],
      siteName: 'Soutra-Explore',
      locale: 'fr_CI',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: venue.cover_url ? [venue.cover_url] : [],
    },
  };
}

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
  tour_360_url: string | null;
  opening_hours: Record<string, [string, string]> | null;
  avg_price_xof: number | null;
  rating_avg: number;
  rating_count: number;
  amenities: string[] | null;
}

export default async function VenuePage({ params }: { params: { slug: string } }) {
  const sb = supabaseServer();
  const { data: venue, error } = await (sb as any)
    .from('venues')
    .select(`
      id, slug, name, category, description,
      address, city, district, commune,
      phone, whatsapp, email, website,
      cover_url, gallery_urls, video_urls, tour_360_url,
      opening_hours, avg_price_xof, rating_avg, rating_count, amenities
    `)
    .eq('slug', params.slug)
    .eq('status', 'active')
    .maybeSingle();

  if (error) console.error('[venue-public] load:', error);
  if (!venue) notFound();

  // Détermine le type métier pour le CTA dynamique
  const businessType = businessTypeOf(venue.category);
  const emoji = categoryEmoji(venue.category);
  const catLabel = categoryLabel(venue.category);

  return (
    <VenueView
      venue={venue as Venue}
      businessType={businessType}
      categoryEmoji={emoji}
      categoryLabel={catLabel}
    />
  );
}
