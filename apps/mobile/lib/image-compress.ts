import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import type { ImagePickerAsset } from 'expo-image-picker';

/**
 * Réduit une photo AVANT envoi : côté le plus long limité à `maxSide` px, JPEG qualité `quality`, base64 produit
 * à partir de l'image réduite. Une photo de 12 Mpx (4–6 Mo) devient ~150–400 Ko : 10 à 20 fois moins de données
 * mobiles à envoyer et bien moins de mémoire (le sélecteur ne génère plus de base64 pleine taille).
 * Les photos déjà petites ne sont pas agrandies. En cas d'échec de la réduction, on retombe sur l'original.
 */
export async function compressAsset(asset: ImagePickerAsset, opts: { maxSide?: number; quality?: number } = {}): Promise<ImagePickerAsset> {
  const maxSide = opts.maxSide ?? 1280;
  const quality = opts.quality ?? 0.7;
  try {
    const w = asset.width || 0, h = asset.height || 0;
    const actions: ImageManipulator.Action[] = [];
    if (Math.max(w, h) > maxSide) actions.push({ resize: w >= h ? { width: maxSide } : { height: maxSide } });
    const out = await ImageManipulator.manipulateAsync(asset.uri, actions, { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (!out.base64) throw new Error('no-base64');
    return { ...asset, uri: out.uri, width: out.width, height: out.height, base64: out.base64, mimeType: 'image/jpeg', fileSize: Math.round(out.base64.length * 0.75) };
  } catch (err) {
    if (__DEV__) console.warn('[image] réduction impossible, original conservé :', (err as Error)?.message);
    if (asset.base64) return asset;
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    return { ...asset, base64 };
  }
}
