import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createSupabase } from '@soutra/shared';

const url = Constants.expoConfig?.extra?.supabaseUrl as string;
const anonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

if (!url || !anonKey) {
  throw new Error('Supabase URL/anonKey manquant dans app.json > extra');
}

export const supabase = createSupabase({
  url,
  anonKey,
  storage: AsyncStorage,
  detectSessionInUrl: false,
});
