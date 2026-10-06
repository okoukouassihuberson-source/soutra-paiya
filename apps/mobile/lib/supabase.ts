import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createSupabase } from '@soutra/shared';
import { fetchWithTimeout } from './net';

const url = (Constants.expoConfig?.extra?.supabaseUrl as string | undefined) ?? '';
const anonKey = (Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined) ?? '';

/**
 * Faux si l'URL / la clé publique manquent (app.json > extra). On ne lève PAS d'exception à l'import :
 * ce fichier est importé par presque tous les écrans, une exception ferait planter toute l'application au
 * démarrage. Le layout racine affiche à la place un écran « configuration incomplète ».
 */
export const supabaseConfigured = !!url && !!anonKey;

export const supabase = createSupabase({
  url: supabaseConfigured ? url : 'https://not-configured.invalid',
  anonKey: supabaseConfigured ? anonKey : 'not-configured',
  storage: AsyncStorage,
  detectSessionInUrl: false,
  fetch: fetchWithTimeout,   // délai d'attente : jamais de chargement infini sur réseau instable
});
