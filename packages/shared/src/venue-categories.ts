// ============================================================================
// Catalogue des catégories de lieux Soutra-Playce.
//
// Source unique pour mobile + web. Chaque catégorie a :
//   - value : enum SQL (migrations 0001 / 0013 / 0033)
//   - label : libellé FR à afficher
//   - group : domaine d'activité (pour grouper dans les sélecteurs)
//   - emoji : pictogramme rapide pour les cards / filtres
//
// L'ordre dans CATEGORY_LIST est l'ordre d'affichage par défaut.
// ============================================================================

import type { VenueCategory } from './types/database';

export type VenueCategoryGroup =
  | 'restauration'
  | 'hebergement'
  | 'loisirs'
  | 'sport'
  | 'commerce'
  | 'education'
  | 'sante'
  | 'services'
  | 'tourisme'
  | 'autres';

/**
 * Mode d'interaction métier exposé par une catégorie côté UI mobile.
 * Doit rester strictement synchrone avec la fonction SQL
 * get_venue_business_type (migration 0057).
 */
export type VenueBusinessType =
  | 'reservation_table'  // restaurant, maquis, cafe, bar, lounge, fast_food, patisserie
  | 'hotel_rooms'        // hotel, villa, resort, auberge, residence_meublee
  | 'product_catalog'    // boutique, mall, supermarche, pharmacie
  | 'event_tickets'      // event_space (table events séparée)
  | 'time_slot'          // club, cinema, casino, fitness, salle_sport, piscine, etc.
  | 'service_quote'      // salle_reception, organisateur_evenements, prestataires, banque, etc.
  | 'vtc_ride'           // vtc_transport
  | 'venue_visit';       // parc, musee, monument, attraction, beach, écoles, hôpital, etc.

export interface VenueCategoryMeta {
  value: VenueCategory;
  label: string;
  group: VenueCategoryGroup;
  emoji: string;
  businessType: VenueBusinessType;
}

export const VENUE_CATEGORY_GROUPS: Record<VenueCategoryGroup, string> = {
  restauration: 'Restauration',
  hebergement:  'Hébergement',
  loisirs:      'Loisirs',
  sport:        'Sport',
  commerce:     'Commerce',
  education:    'Éducation',
  sante:        'Santé',
  services:     'Services',
  tourisme:     'Tourisme',
  autres:       'Autres',
};

/** Libellés FR pour chaque type métier (UI sélecteur + badges). */
export const BUSINESS_TYPE_LABELS: Record<VenueBusinessType, { label: string; verb: string; emoji: string }> = {
  reservation_table: { label: 'Réservation de table',  verb: 'Réserver une table',  emoji: '🍽️' },
  hotel_rooms:       { label: 'Réservation de chambre',verb: 'Réserver une chambre',emoji: '🛏️' },
  product_catalog:   { label: 'Catalogue produits',    verb: 'Voir le catalogue',   emoji: '🛍️' },
  event_tickets:     { label: 'Billetterie événement', verb: 'Acheter un ticket',   emoji: '🎟️' },
  time_slot:         { label: 'Créneaux horaires',     verb: 'Réserver un créneau', emoji: '⏰' },
  service_quote:     { label: 'Devis sur mesure',      verb: 'Demander un devis',   emoji: '📝' },
  vtc_ride:          { label: 'Réservation de trajet', verb: 'Réserver un trajet',  emoji: '🚖' },
  venue_visit:       { label: 'Fiche info',            verb: 'Voir la fiche',       emoji: 'ℹ️' },
};

export const VENUE_CATEGORIES: VenueCategoryMeta[] = [
  // Restauration → réservation de table
  { value: 'restaurant',   label: 'Restaurant',           group: 'restauration', emoji: '🍽️', businessType: 'reservation_table' },
  { value: 'maquis',       label: 'Maquis',               group: 'restauration', emoji: '🍢', businessType: 'reservation_table' },
  { value: 'cafe',         label: 'Café',                 group: 'restauration', emoji: '☕', businessType: 'reservation_table' },
  { value: 'bar',          label: 'Bar',                  group: 'restauration', emoji: '🍻', businessType: 'reservation_table' },
  { value: 'lounge',       label: 'Lounge',               group: 'restauration', emoji: '🛋️', businessType: 'reservation_table' },
  { value: 'fast_food',    label: 'Fast-food',            group: 'restauration', emoji: '🍔', businessType: 'reservation_table' },
  { value: 'patisserie',   label: 'Pâtisserie',           group: 'restauration', emoji: '🍰', businessType: 'reservation_table' },

  // Hébergement → réservation de chambre
  { value: 'hotel',              label: 'Hôtel',              group: 'hebergement', emoji: '🏨', businessType: 'hotel_rooms' },
  { value: 'residence_meublee',  label: 'Résidence meublée',  group: 'hebergement', emoji: '🛏️', businessType: 'hotel_rooms' },
  { value: 'villa',              label: 'Villa',              group: 'hebergement', emoji: '🏡', businessType: 'hotel_rooms' },
  { value: 'resort',             label: 'Resort',             group: 'hebergement', emoji: '🌴', businessType: 'hotel_rooms' },
  { value: 'auberge',            label: 'Auberge',            group: 'hebergement', emoji: '🏠', businessType: 'hotel_rooms' },

  // Loisirs → time_slot (club/cinema/casino/centre) ou event_tickets (event_space) ou venue_visit (parc/beach)
  { value: 'club',            label: 'Boîte de nuit',     group: 'loisirs', emoji: '🕺',  businessType: 'time_slot' },
  { value: 'piscine',         label: 'Piscine',           group: 'loisirs', emoji: '🏊',  businessType: 'time_slot' },
  { value: 'cinema',          label: 'Cinéma',            group: 'loisirs', emoji: '🎬',  businessType: 'time_slot' },
  { value: 'casino',          label: 'Casino',            group: 'loisirs', emoji: '🎰',  businessType: 'time_slot' },
  { value: 'centre_loisirs',  label: 'Centre de loisirs', group: 'loisirs', emoji: '🎡',  businessType: 'time_slot' },
  { value: 'parc',            label: 'Parc',              group: 'loisirs', emoji: '🌳',  businessType: 'venue_visit' },
  { value: 'event_space',     label: 'Espace événementiel', group: 'loisirs', emoji: '🎉', businessType: 'event_tickets' },
  { value: 'beach',           label: 'Plage privée',      group: 'loisirs', emoji: '🏖️', businessType: 'venue_visit' },

  // Sport → créneaux horaires
  { value: 'sport',            label: 'Complexe sportif',     group: 'sport', emoji: '⚽',  businessType: 'time_slot' },
  { value: 'salle_sport',      label: 'Salle de sport',       group: 'sport', emoji: '💪',  businessType: 'time_slot' },
  { value: 'terrain_football', label: 'Terrain de football',  group: 'sport', emoji: '🥅',  businessType: 'time_slot' },
  { value: 'multisports',      label: 'Multisports',          group: 'sport', emoji: '🏀',  businessType: 'time_slot' },
  { value: 'fitness',          label: 'Fitness',              group: 'sport', emoji: '🏋️', businessType: 'time_slot' },

  // Commerce → catalogue produits
  { value: 'mall',         label: 'Centre commercial', group: 'commerce', emoji: '🛍️', businessType: 'product_catalog' },
  { value: 'supermarche',  label: 'Supermarché',       group: 'commerce', emoji: '🛒', businessType: 'product_catalog' },
  { value: 'boutique',     label: 'Boutique',          group: 'commerce', emoji: '🏪', businessType: 'product_catalog' },

  // Éducation → fiche info (pas de réservation/booking)
  { value: 'maternelle',             label: 'Maternelle',             group: 'education', emoji: '🧸', businessType: 'venue_visit' },
  { value: 'primaire',               label: 'Primaire',               group: 'education', emoji: '✏️', businessType: 'venue_visit' },
  { value: 'college',                label: 'Collège',                group: 'education', emoji: '📚', businessType: 'venue_visit' },
  { value: 'lycee',                  label: 'Lycée',                  group: 'education', emoji: '🎓', businessType: 'venue_visit' },
  { value: 'universite',             label: 'Université',             group: 'education', emoji: '🏛️', businessType: 'venue_visit' },
  { value: 'grande_ecole',           label: 'Grande école',           group: 'education', emoji: '🎓', businessType: 'venue_visit' },
  { value: 'formation',              label: 'Centre de formation',    group: 'education', emoji: '📖', businessType: 'service_quote' },
  { value: 'bibliotheque',           label: 'Bibliothèque',           group: 'education', emoji: '📚', businessType: 'venue_visit' },
  { value: 'residence_universitaire',label: 'Résidence universitaire',group: 'education', emoji: '🏘️', businessType: 'venue_visit' },

  // Santé → fiche info (sauf pharmacie qui vend)
  { value: 'hopital',     label: 'Hôpital',     group: 'sante', emoji: '🏥', businessType: 'venue_visit' },
  { value: 'clinique',    label: 'Clinique',    group: 'sante', emoji: '💉', businessType: 'venue_visit' },
  { value: 'pharmacie',   label: 'Pharmacie',   group: 'sante', emoji: '💊', businessType: 'product_catalog' },
  { value: 'laboratoire', label: 'Laboratoire', group: 'sante', emoji: '🧪', businessType: 'venue_visit' },

  // Services → devis sur mesure
  { value: 'banque',                 label: 'Banque',                 group: 'services', emoji: '🏦', businessType: 'service_quote' },
  { value: 'assurance',              label: 'Assurance',              group: 'services', emoji: '📋', businessType: 'service_quote' },
  { value: 'immobilier',             label: 'Agence immobilière',     group: 'services', emoji: '🏢', businessType: 'service_quote' },
  { value: 'voyage',                 label: 'Agence de voyage',       group: 'services', emoji: '✈️', businessType: 'service_quote' },
  { value: 'comptable',              label: 'Cabinet comptable',      group: 'services', emoji: '🧾', businessType: 'service_quote' },
  { value: 'juridique',              label: 'Cabinet juridique',      group: 'services', emoji: '⚖️', businessType: 'service_quote' },
  // Migration 0057 — nouvelles catégories du brief PM
  { value: 'salle_reception',        label: 'Salle de réception',     group: 'services', emoji: '🎊', businessType: 'service_quote' },
  { value: 'organisateur_evenements',label: 'Organisateur d\'événements', group: 'services', emoji: '🎪', businessType: 'service_quote' },
  { value: 'prestataire_services',   label: 'Prestataire de services',group: 'services', emoji: '🛠️', businessType: 'service_quote' },
  { value: 'vtc_transport',          label: 'VTC / Transport',        group: 'services', emoji: '🚖', businessType: 'vtc_ride' },

  // Tourisme → fiche info
  { value: 'site_touristique',  label: 'Site touristique',     group: 'tourisme', emoji: '📸', businessType: 'venue_visit' },
  { value: 'musee',             label: 'Musée',                group: 'tourisme', emoji: '🖼️', businessType: 'venue_visit' },
  { value: 'monument',          label: 'Monument',             group: 'tourisme', emoji: '🗿', businessType: 'venue_visit' },
  { value: 'reserve_naturelle', label: 'Réserve naturelle',    group: 'tourisme', emoji: '🌿', businessType: 'venue_visit' },
  { value: 'attraction',        label: 'Attraction touristique', group: 'tourisme', emoji: '🎢', businessType: 'venue_visit' },

  // Autres
  { value: 'entreprise', label: 'Entreprise',  group: 'autres', emoji: '🏢', businessType: 'service_quote' },
  { value: 'autre',      label: 'Autre',       group: 'autres', emoji: '📍', businessType: 'venue_visit' },
];

/** Map rapide value → meta (pour les lookups en O(1)). */
export const VENUE_CATEGORY_BY_VALUE: Record<VenueCategory, VenueCategoryMeta> =
  VENUE_CATEGORIES.reduce((acc, c) => {
    acc[c.value] = c;
    return acc;
  }, {} as Record<VenueCategory, VenueCategoryMeta>);

/** Catégories regroupées par domaine, ordre stable. */
export function categoriesByGroup(): Array<{ group: VenueCategoryGroup; label: string; items: VenueCategoryMeta[] }> {
  const groups: Record<VenueCategoryGroup, VenueCategoryMeta[]> = {
    restauration: [], hebergement: [], loisirs: [], sport: [], commerce: [],
    education: [], sante: [], services: [], tourisme: [], autres: [],
  };
  for (const c of VENUE_CATEGORIES) groups[c.group].push(c);
  return (Object.keys(groups) as VenueCategoryGroup[]).map((g) => ({
    group: g,
    label: VENUE_CATEGORY_GROUPS[g],
    items: groups[g],
  }));
}

/** Helper : libellé FR pour une value (avec fallback safe sur la value brute). */
export function categoryLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return VENUE_CATEGORY_BY_VALUE[value as VenueCategory]?.label ?? value;
}

/** Helper : emoji pour une value (fallback 📍). */
export function categoryEmoji(value: string | null | undefined): string {
  if (!value) return '📍';
  return VENUE_CATEGORY_BY_VALUE[value as VenueCategory]?.emoji ?? '📍';
}

/**
 * Helper : type métier (mode d'interaction UI) d'une catégorie.
 * Fallback safe sur 'venue_visit' (fiche info) si catégorie inconnue.
 * Strictement synchrone avec la fonction SQL get_venue_business_type
 * (migration 0057).
 */
export function businessTypeOf(value: string | null | undefined): VenueBusinessType {
  if (!value) return 'venue_visit';
  return VENUE_CATEGORY_BY_VALUE[value as VenueCategory]?.businessType ?? 'venue_visit';
}

/** Liste des catégories qui partagent le même mode d'interaction métier. */
export function categoriesByBusinessType(bt: VenueBusinessType): VenueCategoryMeta[] {
  return VENUE_CATEGORIES.filter((c) => c.businessType === bt);
}

/** Vérifie si une catégorie expose le module Boutique (catalogue produits). */
export function isShopCategory(value: string | null | undefined): boolean {
  return businessTypeOf(value) === 'product_catalog';
}

/** Vérifie si une catégorie expose le module Hôtel (réservation chambre). */
export function isHotelCategory(value: string | null | undefined): boolean {
  return businessTypeOf(value) === 'hotel_rooms';
}

/** Vérifie si une catégorie expose la réservation de table. */
export function isTableReservationCategory(value: string | null | undefined): boolean {
  return businessTypeOf(value) === 'reservation_table';
}
