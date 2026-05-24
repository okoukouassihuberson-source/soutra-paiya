/**
 * Module Notifications — push Expo (migration 0029 + Edge Function send-push).
 *
 * À appeler dès que l'utilisateur est connecté : `registerForPush()`.
 * Et au logout : `unregisterForPush()`.
 *
 * Le token Expo Push est récupéré via expo-notifications, puis enregistré
 * côté serveur via la RPC `register_push_token` (SECURITY DEFINER).
 *
 * En Expo Go SDK 53+, les push notifications natives ne fonctionnent plus —
 * il faut un dev build. On loggue un avertissement clair plutôt que de
 * faire crasher l'app.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Comportement par défaut : on affiche la notif même si l'app est ouverte
// (bannière + son), au lieu de la masquer comme c'est le défaut Expo.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let lastRegisteredToken: string | null = null;

export async function registerForPush(): Promise<{ ok: boolean; reason?: string; token?: string }> {
  if (!Device.isDevice) {
    return { ok: false, reason: 'Émulateur — les push notifications nécessitent un vrai téléphone.' };
  }

  // Demande permission (idempotent : retourne 'granted' si déjà accordée).
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'Permission refusée.' };
  }

  // Android : canal de notif obligatoire pour les notifs avec son.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6A1A',
    });
  }

  // En Expo Go SDK 53+, getExpoPushTokenAsync échoue avec un message clair.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;

  let tokenData;
  try {
    tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
  } catch (err: unknown) {
    const msg = (err instanceof Error ? err.message : String(err)) || '';
    if (/Expo Go/i.test(msg)) {
      return { ok: false, reason: 'Expo Go ne supporte plus les push notifications natives. Lance un dev build.' };
    }
    return { ok: false, reason: msg || 'Impossible d\'obtenir le token push.' };
  }

  const token = tokenData.data;
  if (!token) return { ok: false, reason: 'Token vide.' };

  // Enregistre côté serveur (SECURITY DEFINER, attaché au caller).
  const { error } = await (supabase as any).rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS,
  });
  if (error) {
    console.warn('[push] register_push_token failed:', error);
    return { ok: false, reason: error.message };
  }

  lastRegisteredToken = token;
  return { ok: true, token };
}

export async function unregisterForPush(): Promise<void> {
  if (!lastRegisteredToken) return;
  await (supabase as any).rpc('unregister_push_token', { p_token: lastRegisteredToken });
  lastRegisteredToken = null;
}
