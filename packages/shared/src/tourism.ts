// ============================================================================
// SOUTRA PLAYCE V2 — Catalogue touristique (source unique web + mobile).
// Réutilise les catégories de venues existantes (venue-categories.ts) ; ne
// définit que ce qui est propre au tourisme (voyages, formules, destinations).
// ============================================================================

export type TripScope = 'national' | 'international';
export type TripStatus = 'draft' | 'published' | 'full' | 'closed' | 'cancelled';
export type TripHighlight = 'a_la_une' | 'populaire' | 'nouveau' | 'promotion' | 'coup_de_coeur' | 'recommande';
/** Traductions du contenu éditorial : { en: { title: '…' } } (champs absents = texte d'origine). */
export type I18nContent = Record<string, Record<string, string>>;

export type DestinationKind = 'country' | 'region' | 'city' | 'commune' | 'site';

export interface Destination {
  id: string;
  slug: string;
  name: string;
  kind: DestinationKind;
  country_code: string;
  tagline: string | null;
  description: string | null;
  history: string | null;
  cover_url: string | null;
  gallery_urls: string[];
  video_urls: string[];
  latitude: number | null;
  longitude: number | null;
  venue_city: string | null;
  is_featured: boolean;
  i18n?: I18nContent | null;
}

export interface Trip {
  id: string;
  slug: string;
  organizer_id: string;
  scope: TripScope;
  title: string;
  summary: string | null;
  description: string | null;
  destination_id: string | null;
  country: string;
  country_code: string;
  continent: string | null;
  city: string | null;
  cover_url: string | null;
  gallery_urls: string[];
  starts_on: string;
  ends_on: string;
  duration_days: number;
  base_price_xof: number;
  deposit_pct: number;
  seats_total: number;
  seats_booked: number;
  departure_point: string | null;
  departure_time: string | null;
  return_time: string | null;
  transport: string | null;
  lodging: string | null;
  meals: string | null;
  activities: string[];
  inclusions: string[];
  exclusions: string[];
  flight_info: string | null;
  hotel_info: string | null;
  transfer_info: string | null;
  insurance_info: string | null;
  visa_info: string | null;
  conditions: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  contact_email: string | null;
  highlight: TripHighlight | null;
  is_circuit: boolean;
  status: TripStatus;
  i18n?: I18nContent | null;
}

export interface TripItineraryDay {
  id: string;
  trip_id: string;
  day_number: number;
  title: string;
  description: string | null;
  stops: string[];
  meals: string | null;
  lodging: string | null;
  i18n?: I18nContent | null;
}

export interface TripPackage {
  id: string;
  trip_id: string;
  code: 'essentielle' | 'confort' | 'premium' | 'vip' | 'custom';
  name: string;
  description: string | null;
  includes: string[];
  price_xof: number;
  position: number;
  i18n?: I18nContent | null;
}

export const seatsLeft = (t: Pick<Trip, 'seats_total' | 'seats_booked'>) =>
  Math.max(0, t.seats_total - t.seats_booked);

export const HIGHLIGHT_LABELS: Record<TripHighlight, string> = {
  a_la_une: 'À la une',
  populaire: 'Populaire',
  nouveau: 'Nouveau',
  promotion: 'Promotion',
  coup_de_coeur: 'Coup de cœur',
  recommande: 'Recommandé',
};

/** Modèles de formules proposés par défaut ; l'admin/organisateur peut en créer d'autres (code 'custom'). */
export const PACKAGE_PRESETS: { code: TripPackage['code']; name: string; includes: string[] }[] = [
  { code: 'essentielle', name: 'Formule Essentielle', includes: ['Transport'] },
  { code: 'confort', name: 'Formule Confort', includes: ['Transport', 'Hébergement'] },
  { code: 'premium', name: 'Formule Premium', includes: ['Transport', 'Hôtel', 'Activités'] },
  { code: 'vip', name: 'Formule VIP', includes: ['Transport', 'Hôtel premium', 'Activités', 'Accompagnement personnalisé'] },
];

export const CONTINENTS: { value: string; label: string; countries: string[] }[] = [
  { value: 'afrique', label: 'Afrique', countries: ['Maroc', 'Sénégal', 'Ghana', 'Bénin', 'Togo', 'Kenya', 'Afrique du Sud', 'Égypte'] },
  { value: 'europe', label: 'Europe', countries: ['France', 'Italie', 'Espagne', 'Belgique', 'Allemagne', 'Portugal'] },
  { value: 'asie', label: 'Asie', countries: ['Chine', 'Émirats arabes unis', 'Turquie', 'Thaïlande'] },
  { value: 'amerique', label: 'Amérique', countries: ['Canada', 'États-Unis'] },
];

export const CI_CITIES = [
  'Abidjan', 'Grand-Bassam', 'Assinie', 'Bonoua', 'Aboisso', 'Yamoussoukro',
  'San Pedro', 'Korhogo', 'Man', 'Bouaké', 'Taï',
];

/**
 * Cartes de la page d'accueil. `venueCategories` référence les valeurs de
 * l'enum SQL venue_category déjà existant (aucune nouvelle catégorie SQL).
 */
export interface TourismCategoryCard {
  key: string;
  emoji: string;
  label: string;
  href: string;
  /** Catégories venues (enum existant) interrogées par /explorer. */
  venueCategories?: string[];
  image: string;
}

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=70`;

export const TOURISM_CATEGORIES: TourismCategoryCard[] = [
  { key: 'hotels', emoji: '🏨', label: 'Hôtels', href: '/explorer?cat=hotels', venueCategories: ['hotel', 'resort', 'auberge'], image: img('photo-1566073771259-6a8506099945') },
  { key: 'residences', emoji: '🏠', label: 'Résidences', href: '/explorer?cat=residences', venueCategories: ['residence_meublee'], image: img('photo-1522708323590-d24dbb6b0267') },
  { key: 'villas', emoji: '🏡', label: 'Villas', href: '/explorer?cat=villas', venueCategories: ['villa'], image: img('photo-1613490493576-7fde63acd811') },
  { key: 'restaurants', emoji: '🍽️', label: 'Restaurants', href: '/explorer?cat=restaurants', venueCategories: ['restaurant'], image: img('photo-1414235077428-338989a2e8c0') },
  { key: 'maquis', emoji: '🍢', label: 'Maquis', href: '/explorer?cat=maquis', venueCategories: ['maquis'], image: img('photo-1555939594-58d7cb561ad1') },
  { key: 'bars', emoji: '🍸', label: 'Bars & Lounges', href: '/explorer?cat=bars', venueCategories: ['bar', 'lounge'], image: img('photo-1514933651103-005eec06c04b') },
  { key: 'plages', emoji: '🏖️', label: 'Plages', href: '/explorer?cat=plages', venueCategories: ['beach'], image: img('photo-1507525428034-b723cf961d3e') },
  { key: 'sites', emoji: '🌴', label: 'Sites touristiques', href: '/explorer?cat=sites', venueCategories: ['parc', 'musee', 'monument', 'attraction'], image: img('photo-1516026672322-bc52d61a55d5') },
  { key: 'activites', emoji: '🎯', label: 'Activités', href: '/activites', image: img('photo-1530053969600-caed2596d242') },
  { key: 'voyages-nationaux', emoji: '🚌', label: 'Voyages nationaux', href: '/voyages/nationaux', image: img('photo-1488646953014-85cb44e25828') },
  { key: 'voyages-internationaux', emoji: '✈️', label: 'Voyages internationaux', href: '/voyages/internationaux', image: img('photo-1436491865332-7a61a109cc05') },
  { key: 'evenements', emoji: '🎉', label: 'Événements', href: '/explorer?cat=evenements', venueCategories: ['event_space'], image: img('photo-1492684223066-81342ee5ff30') },
];

export function formatTripDates(startsOn: string, endsOn: string, locale = 'fr-FR'): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  return startsOn === endsOn ? f(startsOn) : `${f(startsOn)} → ${f(endsOn)}`;
}

// ─── Activités touristiques (marketplace) ───────────────────────────────────

export type ActivityStatus = 'draft' | 'published' | 'paused' | 'archived';

export const ACTIVITY_CATEGORIES: { key: string; label: string; emoji: string }[] = [
  { key: 'balade_bateau', label: 'Balade en bateau', emoji: '⛵' },
  { key: 'visite_guidee', label: 'Visite guidée', emoji: '🧭' },
  { key: 'randonnee', label: 'Randonnée', emoji: '🥾' },
  { key: 'safari', label: 'Safari', emoji: '🦒' },
  { key: 'peche', label: 'Pêche', emoji: '🎣' },
  { key: 'plongee', label: 'Plongée', emoji: '🤿' },
  { key: 'jet_ski', label: 'Jet-ski', emoji: '🌊' },
  { key: 'quad', label: 'Quad', emoji: '🏍️' },
  { key: 'visite_culturelle', label: 'Visite culturelle', emoji: '🏛️' },
  { key: 'atelier_cuisine', label: 'Atelier cuisine', emoji: '🍳' },
  { key: 'artisanat', label: 'Découverte artisanale', emoji: '🧵' },
  { key: 'excursion', label: 'Excursion', emoji: '🚐' },
  { key: 'photographie', label: 'Photographie touristique', emoji: '📸' },
  { key: 'autre', label: 'Autre', emoji: '🎯' },
];

export const activityCategoryLabel = (key: string) => ACTIVITY_CATEGORIES.find((c) => c.key === key)?.label ?? 'Activité';
export const activityCategoryEmoji = (key: string) => ACTIVITY_CATEGORIES.find((c) => c.key === key)?.emoji ?? '🎯';

export interface Activity {
  id: string; slug: string; organizer_id: string; venue_id: string | null; destination_id: string | null;
  title: string; summary: string | null; description: string | null; category: string;
  city: string | null; address: string | null; latitude: number | null; longitude: number | null;
  cover_url: string | null; gallery_urls: string[]; price_xof: number; duration_minutes: number;
  min_age: number; min_participants: number; max_group_size: number; languages: string[];
  includes: string[]; excludes: string[]; conditions: string | null;
  contact_phone: string | null; contact_whatsapp: string | null; highlight: TripHighlight | null;
  status: ActivityStatus; rating_avg: number; rating_count: number;
  i18n?: I18nContent | null;
}

export interface ActivitySlot {
  id: string; activity_id: string; starts_at: string; capacity: number; booked: number;
  price_xof: number | null; status: 'open' | 'closed';
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  const d = Math.round(minutes / (60 * 24));
  return `${d} jour${d > 1 ? 's' : ''}`;
}

/** Les créneaux sont stockés en UTC ; la Côte d'Ivoire est en UTC+0 toute l'année. */
export function formatSlot(startsAt: string, locale = 'fr-FR'): string {
  return new Date(startsAt).toLocaleString(locale, {
    weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan',
  });
}
