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

export interface VenueCategoryMeta {
  value: VenueCategory;
  label: string;
  group: VenueCategoryGroup;
  emoji: string;
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

export const VENUE_CATEGORIES: VenueCategoryMeta[] = [
  // Restauration
  { value: 'restaurant',   label: 'Restaurant',           group: 'restauration', emoji: '🍽️' },
  { value: 'maquis',       label: 'Maquis',               group: 'restauration', emoji: '🍢' },
  { value: 'cafe',         label: 'Café',                 group: 'restauration', emoji: '☕' },
  { value: 'bar',          label: 'Bar',                  group: 'restauration', emoji: '🍻' },
  { value: 'lounge',       label: 'Lounge',               group: 'restauration', emoji: '🛋️' },
  { value: 'fast_food',    label: 'Fast-food',            group: 'restauration', emoji: '🍔' },
  { value: 'patisserie',   label: 'Pâtisserie',           group: 'restauration', emoji: '🍰' },

  // Hébergement
  { value: 'hotel',              label: 'Hôtel',              group: 'hebergement', emoji: '🏨' },
  { value: 'residence_meublee',  label: 'Résidence meublée',  group: 'hebergement', emoji: '🛏️' },
  { value: 'villa',              label: 'Villa',              group: 'hebergement', emoji: '🏡' },
  { value: 'resort',             label: 'Resort',             group: 'hebergement', emoji: '🌴' },
  { value: 'auberge',            label: 'Auberge',            group: 'hebergement', emoji: '🏠' },

  // Loisirs
  { value: 'club',            label: 'Boîte de nuit',     group: 'loisirs', emoji: '🕺' },
  { value: 'piscine',         label: 'Piscine',           group: 'loisirs', emoji: '🏊' },
  { value: 'cinema',          label: 'Cinéma',            group: 'loisirs', emoji: '🎬' },
  { value: 'casino',          label: 'Casino',            group: 'loisirs', emoji: '🎰' },
  { value: 'centre_loisirs',  label: 'Centre de loisirs', group: 'loisirs', emoji: '🎡' },
  { value: 'parc',            label: 'Parc',              group: 'loisirs', emoji: '🌳' },
  { value: 'event_space',     label: 'Espace événementiel', group: 'loisirs', emoji: '🎉' },
  { value: 'beach',           label: 'Plage privée',      group: 'loisirs', emoji: '🏖️' },

  // Sport
  { value: 'sport',            label: 'Complexe sportif',     group: 'sport', emoji: '⚽' },
  { value: 'salle_sport',      label: 'Salle de sport',       group: 'sport', emoji: '💪' },
  { value: 'terrain_football', label: 'Terrain de football',  group: 'sport', emoji: '🥅' },
  { value: 'multisports',      label: 'Multisports',          group: 'sport', emoji: '🏀' },
  { value: 'fitness',          label: 'Fitness',              group: 'sport', emoji: '🏋️' },

  // Commerce
  { value: 'mall',         label: 'Centre commercial', group: 'commerce', emoji: '🛍️' },
  { value: 'supermarche',  label: 'Supermarché',       group: 'commerce', emoji: '🛒' },
  { value: 'boutique',     label: 'Boutique',          group: 'commerce', emoji: '🏪' },

  // Éducation
  { value: 'maternelle',             label: 'Maternelle',             group: 'education', emoji: '🧸' },
  { value: 'primaire',               label: 'Primaire',               group: 'education', emoji: '✏️' },
  { value: 'college',                label: 'Collège',                group: 'education', emoji: '📚' },
  { value: 'lycee',                  label: 'Lycée',                  group: 'education', emoji: '🎓' },
  { value: 'universite',             label: 'Université',             group: 'education', emoji: '🏛️' },
  { value: 'grande_ecole',           label: 'Grande école',           group: 'education', emoji: '🎓' },
  { value: 'formation',              label: 'Centre de formation',    group: 'education', emoji: '📖' },
  { value: 'bibliotheque',           label: 'Bibliothèque',           group: 'education', emoji: '📚' },
  { value: 'residence_universitaire',label: 'Résidence universitaire',group: 'education', emoji: '🏘️' },

  // Santé
  { value: 'hopital',     label: 'Hôpital',     group: 'sante', emoji: '🏥' },
  { value: 'clinique',    label: 'Clinique',    group: 'sante', emoji: '💉' },
  { value: 'pharmacie',   label: 'Pharmacie',   group: 'sante', emoji: '💊' },
  { value: 'laboratoire', label: 'Laboratoire', group: 'sante', emoji: '🧪' },

  // Services
  { value: 'banque',      label: 'Banque',                 group: 'services', emoji: '🏦' },
  { value: 'assurance',   label: 'Assurance',              group: 'services', emoji: '📋' },
  { value: 'immobilier',  label: 'Agence immobilière',     group: 'services', emoji: '🏢' },
  { value: 'voyage',      label: 'Agence de voyage',       group: 'services', emoji: '✈️' },
  { value: 'comptable',   label: 'Cabinet comptable',      group: 'services', emoji: '🧾' },
  { value: 'juridique',   label: 'Cabinet juridique',      group: 'services', emoji: '⚖️' },

  // Tourisme
  { value: 'site_touristique',  label: 'Site touristique',     group: 'tourisme', emoji: '📸' },
  { value: 'musee',             label: 'Musée',                group: 'tourisme', emoji: '🖼️' },
  { value: 'monument',          label: 'Monument',             group: 'tourisme', emoji: '🗿' },
  { value: 'reserve_naturelle', label: 'Réserve naturelle',    group: 'tourisme', emoji: '🌿' },
  { value: 'attraction',        label: 'Attraction touristique', group: 'tourisme', emoji: '🎢' },

  // Autres
  { value: 'entreprise', label: 'Entreprise',  group: 'autres', emoji: '🏢' },
  { value: 'autre',      label: 'Autre',       group: 'autres', emoji: '📍' },
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
