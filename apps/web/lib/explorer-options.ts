// Constantes pures (importables côté client ET serveur — pas de dépendance next/headers).

export const EXPLORER_AMENITIES = [
  { key: 'wifi', label: 'Wi-Fi' }, { key: 'parking', label: 'Parking' }, { key: 'climatisation', label: 'Climatisation' },
  { key: 'piscine', label: 'Piscine' }, { key: 'restaurant', label: 'Restaurant' }, { key: 'bar', label: 'Bar' },
  { key: 'vue_mer', label: 'Vue mer' }, { key: 'petit_dej', label: 'Petit-déjeuner' },
  { key: 'accessible', label: 'Accessibilité' }, { key: 'animaux', label: 'Animaux acceptés' },
] as const;

export const EXPLORER_SORTS = [
  { key: 'rating', label: 'Mieux notés' }, { key: 'price_asc', label: 'Prix croissant' },
  { key: 'price_desc', label: 'Prix décroissant' }, { key: 'new', label: 'Nouveautés' }, { key: 'distance', label: 'Distance' },
] as const;

