// ============================================================================
// Modules Pro Web — mapping businessType → sidebar visible
//
// Spec PO Soutra-Paiya : "Le dashboard doit s'adapter automatiquement selon
// la catégorie choisie. L'utilisateur ne doit voir QUE les fonctionnalités
// utiles à son activité."
//
// Source unique de vérité côté front pour décider quels onglets afficher
// dans la sidebar Pro Web (apps/web/app/pro/page.tsx). Aligné avec
// businessTypeOf() (migration 0057).
// ============================================================================

import type { VenueBusinessType } from './venue-categories';

/**
 * Identifiants stables des onglets de la sidebar Pro.
 * Doit rester strictement en miroir du type Tab dans apps/web/app/pro/page.tsx.
 */
export type ProModule =
  | 'dashboard'
  | 'reservations'      // tables (restau/bar/lounge/club)
  | 'events'            // billetterie
  | 'menu'              // restauration uniquement
  | 'analytics'
  | 'shop-products'     // catalogue magasin
  | 'shop-orders'       // commandes magasin
  | 'hotel-rooms'       // catalogue chambres
  | 'hotel-bookings'    // réservations nuitées
  | 'finances'
  | 'marketing'         // promos/codes — universel
  | 'settings';

/**
 * Modules affichés dans la sidebar Pro selon le mode d'interaction métier
 * de la catégorie du venue actif. Ordre = ordre d'affichage.
 *
 * Universel pour tous : Dashboard, Analytics, Finances, Marketing, Paramètres.
 * Spécifique par businessType : Réservations / Menu / Catalogue / Chambres /
 * Événements selon ce que l'activité produit comme valeur.
 */
export const MODULES_BY_BUSINESS_TYPE: Record<VenueBusinessType, ProModule[]> = {
  // Restaurants, maquis, cafés, bars, lounges, fast-food, pâtisseries
  // → réservation de table + menu/cartes
  reservation_table: [
    'dashboard',
    'reservations',
    'menu',
    'events',         // beaucoup de bars/lounges font des soirées événements
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],

  // Hôtels, villas, resorts, auberges, résidences meublées
  // → chambres + bookings nuitées
  hotel_rooms: [
    'dashboard',
    'hotel-rooms',
    'hotel-bookings',
    'menu',           // souvent un restaurant interne dans l'hôtel
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],

  // Boutiques, malls, supermarchés, pharmacies
  // → catalogue produits + commandes
  product_catalog: [
    'dashboard',
    'shop-products',
    'shop-orders',
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],

  // Event_space + organisateurs d'événements
  // → billetterie pure
  event_tickets: [
    'dashboard',
    'events',
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],

  // Club, casino, cinéma, fitness, salle_sport, piscine, terrain_football,
  // multisports, centre_loisirs, sport
  // → créneaux horaires (mappé sur reservations en attendant un module
  //   time_slots dédié — la table reservations sert au booking de séances)
  time_slot: [
    'dashboard',
    'reservations',
    'events',         // soirée club / projection cinéma / tournoi
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],

  // Services BtoB/BtoC (banque, assurance, immobilier, juridique, comptable,
  // organisateur_evenements, prestataire_services, formation, salle_reception,
  // voyage, entreprise) — fiche info enrichie + devis sur mesure (manuel)
  service_quote: [
    'dashboard',
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],

  // VTC / Transport (vtc_transport)
  // Pour l'instant fiche info — module trajet à venir
  vtc_ride: [
    'dashboard',
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],

  // Tout le reste : parcs, musées, monuments, attractions, plages,
  // sites touristiques, hôpitaux, cliniques, écoles, universités, etc.
  // → fiche info pure
  venue_visit: [
    'dashboard',
    'analytics',
    'marketing',
    'finances',
    'settings',
  ],
};

/**
 * Helper : retourne la liste des modules pour une catégorie donnée.
 * Fallback safe sur la liste minimale (dashboard + paramètres) si businessType
 * inconnu — évite une sidebar vide.
 */
export function modulesForBusinessType(bt: VenueBusinessType | null | undefined): ProModule[] {
  if (!bt) return ['dashboard', 'analytics', 'marketing', 'finances', 'settings'];
  return MODULES_BY_BUSINESS_TYPE[bt] ?? ['dashboard', 'analytics', 'marketing', 'finances', 'settings'];
}

/**
 * Helper : vérifie si un module donné est disponible pour un businessType.
 */
export function isModuleAvailable(module: ProModule, bt: VenueBusinessType | null | undefined): boolean {
  return modulesForBusinessType(bt).includes(module);
}
