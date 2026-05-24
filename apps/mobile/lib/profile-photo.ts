/**
 * Module Profile Photo — upload de l'avatar utilisateur.
 *
 * On utilise le bucket `social-media` existant (créé pour les posts du
 * feed, RLS via `can_write_social_media` SECURITY DEFINER). Le path
 * commence par `<user_id>/` -> le user n'a accès qu'à son propre dossier,
 * ce qui couvre l'avatar aussi.
 *
 * Convention de path : `<user_id>/avatar-<timestamp>.<ext>`. Le timestamp
 * casse le cache CDN au remplacement (l'URL change -> l'image refresh).
 */

import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from './supabase';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo après compression

/** Demande la permission galerie et ouvre le picker. Renvoie l'asset ou null si annulé / refusé. */
export async function pickAvatarFromGallery(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission requise', 'Autorise l\'accès à tes photos pour choisir un avatar.');
    return null;
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: 0.6,
    allowsEditing: true,
    aspect: [1, 1], // recadrage carré -> compatible avec l'affichage rond
  });
  if (r.canceled || !r.assets[0]) return null;
  return validateOrAlert(r.assets[0]);
}

/** Demande la permission caméra et ouvre l'appareil photo. */
export async function pickAvatarFromCamera(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission requise', 'Autorise la caméra pour prendre un avatar.');
    return null;
  }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: 0.6,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (r.canceled || !r.assets[0]) return null;
  return validateOrAlert(r.assets[0]);
}

function validateOrAlert(asset: ImagePicker.ImagePickerAsset): ImagePicker.ImagePickerAsset | null {
  if (asset.fileSize && asset.fileSize > AVATAR_MAX_BYTES) {
    Alert.alert('Image trop lourde', 'Choisis une image de moins de 5 Mo.');
    return null;
  }
  if (!asset.base64) {
    Alert.alert('Erreur', 'Impossible de lire l\'image. Réessaie.');
    return null;
  }
  return asset;
}

/** Upload l'avatar et met à jour `profiles.avatar_url`. Renvoie l'URL publique. */
export async function uploadAvatar(userId: string, asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (!asset.base64) throw new Error('Asset sans base64.');
  const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const buf = decode(asset.base64);

  const { error: upErr } = await supabase.storage
    .from('social-media')
    .upload(path, buf, {
      contentType: asset.mimeType || `image/${ext}`,
      upsert: false,
    });
  if (upErr) throw new Error(upErr.message);

  const url = supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl;

  const { error: updErr } = await (supabase as any)
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId);
  if (updErr) throw new Error(updErr.message);

  return url;
}

/** Retire l'avatar (null en base ; on ne supprime pas le fichier physique pour rester simple). */
export async function removeAvatar(userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
