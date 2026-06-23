/**
 * Module Profile Cover — upload de la photo de couverture (PR4 audit UX).
 *
 * Pattern miroir de profile-photo.ts mais :
 *   - aspect [16, 9] (paysage) au lieu de [1, 1] (carré)
 *   - path `<user_id>/cover-<timestamp>.<ext>`
 *   - update `profiles.cover_url` (colonne ajoutée migration 0064)
 *   - taille max 8 Mo (la cover est plus large que l'avatar)
 *
 * Bucket : `social-media` (déjà ouvert au user via le path <user_id>/...).
 */

import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from './supabase';

const COVER_MAX_BYTES = 8 * 1024 * 1024;

export async function pickCoverFromGallery(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission requise', 'Autorise l\'accès à tes photos pour choisir une couverture.');
    return null;
  }
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: 0.65,
    allowsEditing: true,
    aspect: [16, 9],
  });
  if (r.canceled || !r.assets[0]) return null;
  return validateOrAlert(r.assets[0]);
}

export async function pickCoverFromCamera(): Promise<ImagePicker.ImagePickerAsset | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission requise', 'Autorise la caméra pour prendre une couverture.');
    return null;
  }
  const r = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true,
    quality: 0.65,
    allowsEditing: true,
    aspect: [16, 9],
  });
  if (r.canceled || !r.assets[0]) return null;
  return validateOrAlert(r.assets[0]);
}

function validateOrAlert(asset: ImagePicker.ImagePickerAsset): ImagePicker.ImagePickerAsset | null {
  if (asset.fileSize && asset.fileSize > COVER_MAX_BYTES) {
    Alert.alert('Image trop lourde', 'Choisis une image de moins de 8 Mo.');
    return null;
  }
  if (!asset.base64) {
    Alert.alert('Erreur', 'Impossible de lire l\'image. Réessaie.');
    return null;
  }
  return asset;
}

/** Upload la couverture et met à jour `profiles.cover_url`. Renvoie l'URL publique. */
export async function uploadCover(userId: string, asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (!asset.base64) throw new Error('Asset sans base64.');
  const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/cover-${Date.now()}.${ext}`;
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
    .update({ cover_url: url })
    .eq('id', userId);
  if (updErr) throw new Error(updErr.message);

  return url;
}

/** Retire la couverture (null en base, fichier physique préservé). */
export async function removeCover(userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('profiles')
    .update({ cover_url: null })
    .eq('id', userId);
  if (error) throw new Error(error.message);
}
