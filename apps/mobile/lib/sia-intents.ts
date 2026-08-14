/**
 * SIA — Soutra Intelligent Assistant : intent parser local.
 *
 * Détecte les commandes de navigation côté client AVANT d'envoyer au LLM.
 * Évite l'aller-retour cloud pour "SIA ouvre mon wallet" → routage instant.
 *
 * Si aucun intent ne matche, on retombe sur le LLM (askAssistant) qui
 * répond en conversation naturelle.
 *
 * Patterns FR + français ivoirien : "ouvre", "montre", "affiche", "va dans",
 * "amène-moi", + variantes phonétiques courantes.
 */

export type SiaIntent =
  | { kind: 'navigate'; pathname: string; label: string; spoken: string }
  | { kind: 'unknown' };

/**
 * Vocabulaire des destinations connues. Chaque entrée mappe une liste de
 * mots-clés (lower-case, sans accents) vers une route expo-router + un
 * libellé court pour le retour vocal / textuel.
 */
const ROUTES: { keywords: string[]; pathname: string; label: string }[] = [
  // Wallet / Paiya-Pay
  {
    keywords: ['wallet', 'portefeuille', 'porte feuille', 'paiya-pay', 'paiya pay', 'mon argent', 'mon solde', 'solde'],
    pathname: '/(tabs)/wallet',
    label: 'Wallet',
  },
  // Fidélité
  {
    keywords: ['fidelite', 'fidélité', 'mes gains', 'mes recompenses', 'mes récompenses', 'mes points', 'mon niveau', 'mon classement'],
    pathname: '/loyalty',
    label: 'Fidélité',
  },
  // Explore
  {
    keywords: ['explore', 'explorer', 'la carte', 'la map', 'autour de moi', 'restaurants', 'restos', 'maquis', 'hotels', 'hôtels'],
    pathname: '/(tabs)/explore',
    label: 'Explorer',
  },
  // Tickets / réservations
  {
    keywords: ['tickets', 'mes tickets', 'mes reservations', 'mes réservations', 'mes billets', 'activites', 'activités', 'mes activités'],
    pathname: '/(tabs)/activity',
    label: 'Activités',
  },
  // Profile
  {
    keywords: ['profil', 'profile', 'mon profil', 'mon compte', 'compte'],
    pathname: '/(tabs)/profile',
    label: 'Profil',
  },
  // Settings / paramètres
  {
    keywords: ['parametres', 'paramètres', 'reglages', 'réglages', 'settings'],
    pathname: '/settings',
    label: 'Paramètres',
  },
  // Send / envoyer
  {
    keywords: ['envoyer', 'envoie', 'envoi de l argent', 'envoi d argent', 'transferer', 'transférer'],
    pathname: '/send',
    label: 'Envoyer',
  },
  // Request / demander
  {
    keywords: ['demander', 'demande de l argent', 'demande d argent', 'requests', 'mes demandes'],
    pathname: '/requests',
    label: 'Demandes',
  },
  // Scan QR
  {
    keywords: ['scan', 'scanner', 'qr code', 'qr', 'code qr'],
    pathname: '/scan',
    label: 'Scanner QR',
  },
  // Recharge
  {
    keywords: ['recharger', 'recharge', 'creditcard', 'top up', 'topup', 'mettre de l argent'],
    pathname: '/recharge',
    label: 'Recharger',
  },
  // Withdraw / retrait
  {
    keywords: ['retirer', 'retrait', 'withdraw'],
    pathname: '/withdraw',
    label: 'Retrait',
  },
  // Split bill
  {
    keywords: ['split', 'split bill', 'partager addition', 'partager la note', 'partager le ticket'],
    pathname: '/splits',
    label: 'Split Bill',
  },
  // Orders / commandes boutique
  {
    keywords: ['commandes', 'mes commandes', 'orders'],
    pathname: '/orders',
    label: 'Mes commandes',
  },
  // Hotel bookings / nuits
  {
    keywords: ['mes nuits', 'mes hotels', 'mes hôtels', 'mes reservations hotel', 'mes réservations hôtel', 'hotel bookings'],
    pathname: '/hotel-bookings',
    label: 'Mes nuits',
  },
  // Trending
  {
    keywords: ['trending', 'tendances', 'tendance', 'populaires', 'top'],
    pathname: '/trending',
    label: 'Tendances',
  },
  // Favorites
  {
    keywords: ['favoris', 'favorites', 'mes favoris', 'sauvegardes', 'sauvegardés'],
    pathname: '/favorites',
    label: 'Favoris',
  },
];

/** Normalise une chaîne pour le matching : lowercase + sans accents + sans ponctuation. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verbes d'action qui suggèrent un intent navigate (vs question d'info). */
const NAV_VERBS = [
  'ouvre', 'ouvrir', 'va', 'vas', 'va dans', 'aller dans',
  'montre', 'montrer', 'affiche', 'afficher',
  'amene', 'amene moi', 'amener', 'emmene', 'emmene moi',
  'ouvre moi', 'montre moi', 'affiche moi',
  'lance', 'lancer',
];

/**
 * Parse le texte transcrit ou tapé. Retourne :
 *   - { kind: 'navigate', pathname, label } si match d'un intent connu
 *   - { kind: 'unknown' } sinon (l'appelant doit fallback sur le LLM)
 *
 * Match strict : on exige que le mot-clé apparaisse dans le texte normalisé.
 * Si plusieurs routes matchent, on prend la première (ordre dans ROUTES = priorité).
 */
export function parseSiaIntent(text: string): SiaIntent {
  const norm = normalize(text);
  if (norm.length === 0) return { kind: 'unknown' };

  // Heuristique : la requête doit contenir un verbe d'action ou commencer par
  // un mot-clé direct, sinon on considère que c'est une question (ex:
  // "qu'est-ce que la fidélité ?" ne doit PAS naviguer).
  const hasNavVerb = NAV_VERBS.some((v) => norm.includes(v));

  for (const route of ROUTES) {
    for (const kw of route.keywords) {
      const kwNorm = normalize(kw);
      if (!norm.includes(kwNorm)) continue;
      // Cas 1 : verbe de nav explicite → c'est bien une commande
      if (hasNavVerb) {
        return {
          kind: 'navigate',
          pathname: route.pathname,
          label: route.label,
          spoken: `J'ouvre ${route.label} pour toi.`,
        };
      }
      // Cas 2 : la requête EST quasi-uniquement le mot-clé ("wallet", "fidélité")
      // → on assume que c'est une commande implicite.
      if (norm === kwNorm || norm.startsWith('sia ' + kwNorm) || norm.startsWith('soutra ' + kwNorm)) {
        return {
          kind: 'navigate',
          pathname: route.pathname,
          label: route.label,
          spoken: `J'ouvre ${route.label} pour toi.`,
        };
      }
    }
  }

  return { kind: 'unknown' };
}
