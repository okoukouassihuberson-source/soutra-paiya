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

import { tr, type TKey } from '@/lib/i18n';

export type SiaIntent =
  | { kind: 'navigate'; pathname: string; label: string; spoken: string }
  | { kind: 'unknown' };

/**
 * Vocabulaire des destinations connues. Chaque entrée mappe une liste de
 * mots-clés (lower-case, sans accents) vers une route expo-router + un
 * libellé court pour le retour vocal / textuel.
 */
const ROUTES: { keywords: string[]; pathname: string; id: string }[] = [
  // Wallet / Paiya-Pay
  {
    keywords: ['wallet', 'portefeuille', 'porte feuille', 'paiya-pay', 'paiya pay', 'mon argent', 'mon solde', 'solde', 'my wallet', 'balance'],
    pathname: '/(tabs)/wallet',
    id: 'wallet',
  },
  // Fidélité
  {
    keywords: ['fidelite', 'fidélité', 'mes gains', 'mes recompenses', 'mes récompenses', 'mes points', 'mon niveau', 'mon classement', 'loyalty', 'my points', 'my rewards', 'my level'],
    pathname: '/loyalty',
    id: 'loyalty',
  },
  // Explore
  {
    keywords: ['explore', 'explorer', 'la carte', 'la map', 'autour de moi', 'restaurants', 'restos', 'maquis', 'hotels', 'hôtels'],
    pathname: '/(tabs)/explore',
    id: 'explore',
  },
  // Tickets / réservations
  {
    keywords: ['tickets', 'mes tickets', 'mes reservations', 'mes réservations', 'mes billets', 'my bookings'],
    pathname: '/(tabs)/tickets',
    id: 'tickets',
  },
  // Profile
  {
    keywords: ['profil', 'profile', 'mon profil', 'mon compte', 'compte'],
    pathname: '/(tabs)/profile',
    id: 'profile',
  },
  // Settings / paramètres
  {
    keywords: ['parametres', 'paramètres', 'reglages', 'réglages', 'settings'],
    pathname: '/settings',
    id: 'settings',
  },
  // Send / envoyer
  {
    keywords: ['envoyer', 'envoie', 'envoi de l argent', 'envoi d argent', 'transferer', 'transférer', 'send money'],
    pathname: '/send',
    id: 'send',
  },
  // Request / demander
  {
    keywords: ['demander', 'demande de l argent', 'demande d argent', 'requests', 'mes demandes', 'request money', 'my requests'],
    pathname: '/requests',
    id: 'requests',
  },
  // Scan QR
  {
    keywords: ['scan', 'scanner', 'qr code', 'qr', 'code qr'],
    pathname: '/scan',
    id: 'scan',
  },
  // Recharge
  {
    keywords: ['recharger', 'recharge', 'creditcard', 'top up', 'topup', 'mettre de l argent', 'add money'],
    pathname: '/recharge',
    id: 'recharge',
  },
  // Withdraw / retrait
  {
    keywords: ['retirer', 'retrait', 'withdraw'],
    pathname: '/withdraw',
    id: 'withdraw',
  },
  // Split bill
  {
    keywords: ['split', 'split bill', 'partager addition', 'partager la note', 'partager le ticket'],
    pathname: '/splits',
    id: 'splits',
  },
  // Orders / commandes boutique
  {
    keywords: ['commandes', 'mes commandes', 'orders', 'my orders'],
    pathname: '/orders',
    id: 'orders',
  },
  // Hotel bookings / nuits
  {
    keywords: ['mes nuits', 'mes hotels', 'mes hôtels', 'mes reservations hotel', 'mes réservations hôtel', 'hotel bookings', 'my stays', 'my nights'],
    pathname: '/hotel-bookings',
    id: 'hotelBookings',
  },
  // Trending
  {
    keywords: ['trending', 'tendances', 'tendance', 'populaires', 'top', 'what is trending'],
    pathname: '/trending',
    id: 'trending',
  },
  // Favorites
  {
    keywords: ['favoris', 'favorites', 'mes favoris', 'sauvegardes', 'sauvegardés', 'my favourites', 'saved'],
    pathname: '/favorites',
    id: 'favorites',
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
  'open', 'show', 'show me', 'display', 'go to', 'take me to', 'launch',
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
          label: tr(`sia.route.${route.id}` as TKey),
          spoken: tr('sia.opening', { label: tr(`sia.route.${route.id}` as TKey) }),
        };
      }
      // Cas 2 : la requête EST quasi-uniquement le mot-clé ("wallet", "fidélité")
      // → on assume que c'est une commande implicite.
      if (norm === kwNorm || norm.startsWith('sia ' + kwNorm) || norm.startsWith('soutra ' + kwNorm)) {
        return {
          kind: 'navigate',
          pathname: route.pathname,
          label: tr(`sia.route.${route.id}` as TKey),
          spoken: tr('sia.opening', { label: tr(`sia.route.${route.id}` as TKey) }),
        };
      }
    }
  }

  return { kind: 'unknown' };
}
