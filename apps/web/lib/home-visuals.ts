// Visuels éditoriaux de la page d'accueil. UNIQUE endroit à modifier pour remplacer
// les photos : mettre ici des clichés ivoiriens (Supabase Storage ou /public) à la place
// des visuels de démonstration Unsplash. Les textes sont dans le dictionnaire (home2.*).

const u = (id: string, w = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

/** Diaporama du hero (l'ordre définit le défilé). `key` → home2.slide.<key>.{name,tags}. */
export const HERO_SLIDES = [
  { key: 'assinie', image: u('photo-1507525428034-b723cf961d3e'), city: 'Assinie' },
  { key: 'bassam', image: u('photo-1516026672322-bc52d61a55d5'), city: 'Grand-Bassam' },
  { key: 'abidjan', image: u('photo-1555939594-58d7cb561ad1'), city: 'Abidjan' },
  { key: 'sanpedro', image: u('photo-1488646953014-85cb44e25828'), city: 'San Pedro' },
  { key: 'man', image: u('photo-1530053969600-caed2596d242'), city: 'Man' },
] as const;

/** « Que voulez-vous vivre ? » — `cats` = clés TOURISM_CATEGORIES regroupées sous la carte. */
export const VIBES = [
  { key: 'beach', emoji: '🏖️', href: '/explorer?cat=plages', image: u('photo-1507525428034-b723cf961d3e', 900), venueCats: ['beach'] },
  { key: 'food', emoji: '🍽️', href: '/explorer?cat=restaurants', image: u('photo-1414235077428-338989a2e8c0', 900), venueCats: ['restaurant', 'maquis', 'cafe'] },
  { key: 'stay', emoji: '🏨', href: '/explorer?cat=hotels', image: u('photo-1566073771259-6a8506099945', 900), venueCats: ['hotel', 'resort', 'auberge', 'residence_meublee', 'villa'] },
  { key: 'culture', emoji: '🎭', href: '/explorer?cat=sites', image: u('photo-1516026672322-bc52d61a55d5', 900), venueCats: ['musee', 'monument', 'attraction', 'site_touristique'] },
  { key: 'nature', emoji: '🌿', href: '/activites', image: u('photo-1530053969600-caed2596d242', 900), venueCats: ['parc', 'reserve_naturelle'] },
  { key: 'nightlife', emoji: '🎉', href: '/explorer?cat=evenements', image: u('photo-1492684223066-81342ee5ff30', 900), venueCats: ['event_space', 'club', 'bar', 'lounge'] },
] as const;

/** Destinations vedettes de secours (si aucune destination publiée en base). */
export const FALLBACK_DESTINATIONS = [
  { key: 'assinie', city: 'Assinie', image: u('photo-1507525428034-b723cf961d3e', 800) },
  { key: 'bassam', city: 'Grand-Bassam', image: u('photo-1516026672322-bc52d61a55d5', 800) },
  { key: 'abidjan', city: 'Abidjan', image: u('photo-1555939594-58d7cb561ad1', 800) },
  { key: 'sanpedro', city: 'San Pedro', image: u('photo-1488646953014-85cb44e25828', 800) },
  { key: 'man', city: 'Man', image: u('photo-1530053969600-caed2596d242', 800) },
  { key: 'yakro', city: 'Yamoussoukro', image: u('photo-1436491865332-7a61a109cc05', 800) },
] as const;
