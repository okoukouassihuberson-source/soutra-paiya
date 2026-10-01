// ============================================================================
// SOUTRA PLAYCE V2 — Catalogue touristique (source unique web + mobile).
// Réutilise les catégories de venues existantes (venue-categories.ts) ; ne
// définit que ce qui est propre au tourisme (voyages, formules, destinations).
// ============================================================================

export type TripScope = 'national' | 'international';
export type TripStatus = 'draft' | 'published' | 'full' | 'closed' | 'cancelled';
export type TripHighlight = 'a_la_une' | 'populaire' | 'nouveau' | 'promotion' | 'coup_de_coeur' | 'recommande';
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
  { key: 'activites', emoji: '🎯', label: 'Activités', href: '/explorer?cat=activites', venueCategories: ['centre_loisirs', 'piscine'], image: img('photo-1530053969600-caed2596d242') },
  { key: 'voyages-nationaux', emoji: '🚌', label: 'Voyages nationaux', href: '/voyages/nationaux', image: img('photo-1488646953014-85cb44e25828') },
  { key: 'voyages-internationaux', emoji: '✈️', label: 'Voyages internationaux', href: '/voyages/internationaux', image: img('photo-1436491865332-7a61a109cc05') },
  { key: 'evenements', emoji: '🎉', label: 'Événements', href: '/explorer?cat=evenements', venueCategories: ['event_space'], image: img('photo-1492684223066-81342ee5ff30') },
];

export function formatTripDates(startsOn: string, endsOn: string, locale = 'fr-FR'): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  return startsOn === endsOn ? f(startsOn) : `${f(startsOn)} → ${f(endsOn)}`;
}
