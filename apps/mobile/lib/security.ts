// ============================================================================
// Sécurité — PIN de paiement (hashé serveur) + déverrouillage biométrique.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from './supabase';

const BIOMETRIC_KEY = 'soutra.biometricEnabled';

// --- PIN de paiement --------------------------------------------------------

// L'utilisateur courant a-t-il défini un PIN ?
export async function hasPaymentPin(): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('has_payment_pin');
  if (error) {
    console.error('[security] has_payment_pin:', error);
    return false;
  }
  return data === true;
}

// Définit / met à jour le PIN (le hashage bcrypt se fait côté serveur).
export async function setPaymentPin(pin: string): Promise<void> {
  const { error } = await (supabase as any).rpc('set_payment_pin', { p_pin: pin });
  if (error) {
    if (/INVALID_PIN/i.test(error.message || '')) {
      throw new Error('Le PIN doit comporter exactement 4 chiffres.');
    }
    throw new Error(error.message || "Impossible d'enregistrer le PIN.");
  }
}

// Vérifie le PIN saisi auprès du serveur.
export async function verifyPaymentPin(pin: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('verify_payment_pin', {
    p_pin: pin,
  });
  if (error) {
    console.error('[security] verify_payment_pin:', error);
    return false;
  }
  return data === true;
}

// --- Biométrie --------------------------------------------------------------

// L'appareil dispose-t-il d'une biométrie configurée (empreinte / visage) ?
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIOMETRIC_KEY)) === '1';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_KEY, on ? '1' : '0');
}

// Lance l'authentification biométrique. Renvoie true si elle réussit.
export async function authenticateBiometric(): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirme ton identité',
      cancelLabel: 'Utiliser le PIN',
      disableDeviceFallback: true,
    });
    return res.success;
  } catch {
    return false;
  }
}
