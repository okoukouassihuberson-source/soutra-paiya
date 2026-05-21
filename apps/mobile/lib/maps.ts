/**
 * Helpers pour ouvrir l'app GPS native du téléphone vers une coordonnée.
 *
 * Stratégie : on tente les schemes natifs (Google Maps navigation Android,
 * Apple Maps iOS) en priorité, puis le scheme `geo:` standard Android,
 * puis l'URL web Google Maps en dernier recours (universel, fonctionne
 * dans n'importe quel navigateur).
 *
 * Pas de Directions API custom : c'est cher, ça nécessite une clé, et
 * l'app native fait mieux (trafic réel, GPS intégré, voix, mode hors-ligne…).
 */

import { Platform, Linking, Alert } from 'react-native';

export type DirectionsTarget = {
  lat: number;
  lng: number;
  label?: string;
};

async function tryOpen(url: string): Promise<boolean> {
  try {
    const can = await Linking.canOpenURL(url);
    if (!can) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function openDirections({ lat, lng, label }: DirectionsTarget): Promise<void> {
  const safeLabel = (label || 'Destination').replace(/[^\w\s.\-,'éèêëàâäîïôöùûüç]/gi, '').slice(0, 60);

  if (Platform.OS === 'ios') {
    // 1) Apple Maps avec destination directe.
    if (await tryOpen(`maps://?daddr=${lat},${lng}&dirflg=d`)) return;
    // 2) Google Maps (si installée).
    if (await tryOpen(`comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`)) return;
    // 3) Page web Apple Maps (fallback universel iOS/Safari).
    if (await tryOpen(`https://maps.apple.com/?daddr=${lat},${lng}`)) return;
  } else {
    // Android : on tente le scheme navigation Google Maps puis le geo: standard.
    if (await tryOpen(`google.navigation:q=${lat},${lng}&mode=d`)) return;
    if (await tryOpen(`geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(safeLabel)})`)) return;
  }

  // Fallback universel : URL web Google Maps Directions.
  // Fonctionne sur n'importe quel device avec un navigateur.
  if (await tryOpen(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)) return;

  Alert.alert('Itinéraire indisponible', 'Aucune application de cartographie installée sur ce téléphone.');
}

/**
 * Ouvre le dialer du téléphone avec le numéro pré-rempli.
 */
export async function dialPhone(phone: string): Promise<void> {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) {
    Alert.alert('Numéro invalide', 'Le numéro de téléphone est vide ou invalide.');
    return;
  }
  if (!(await tryOpen(`tel:${cleaned}`))) {
    Alert.alert('Appel indisponible', 'Impossible d\'ouvrir le composeur sur ce téléphone.');
  }
}

/**
 * Ouvre WhatsApp avec un message pré-rempli optionnel. Accepte un numéro avec
 * ou sans le `+`, avec ou sans espaces.
 */
export async function openWhatsApp(phone: string, message?: string): Promise<void> {
  const cleaned = phone.replace(/[^\d]/g, ''); // wa.me veut le numéro SANS « + »
  if (!cleaned) {
    Alert.alert('Numéro invalide', 'Le numéro WhatsApp est vide.');
    return;
  }
  const qs = message ? `?text=${encodeURIComponent(message)}` : '';
  // Scheme app dédié si installé, sinon page web (qui propose d'installer / d'ouvrir).
  if (await tryOpen(`whatsapp://send?phone=${cleaned}${message ? `&text=${encodeURIComponent(message)}` : ''}`)) return;
  if (await tryOpen(`https://wa.me/${cleaned}${qs}`)) return;
  Alert.alert('WhatsApp indisponible', 'Impossible d\'ouvrir WhatsApp sur ce téléphone.');
}
