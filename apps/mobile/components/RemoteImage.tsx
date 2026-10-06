import { memo, useState } from 'react';
import { View, Image, ActivityIndicator, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/theme';

/**
 * Image distante avec états chargement / succès / erreur :
 *  - fond neutre + indicateur pendant le chargement (pas de « trou » blanc) ;
 *  - icône de repli si l'URL est absente ou si le téléchargement échoue (jamais d'écran cassé) ;
 *  - `resizeMethod="resize"` : Android décode l'image à la taille affichée (RAM bien plus faible que la taille d'origine) ;
 *  - `fadeDuration` réduit pour économiser le CPU sur les téléphones modestes.
 */
function RemoteImageBase({ uri, style, resizeMode = 'cover', alt }: { uri?: string | null; style?: StyleProp<ImageStyle>; resizeMode?: 'cover' | 'contain'; alt?: string }) {
  const c = useColors();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const bad = !uri || state === 'error';
  return (
    <View style={[style as any, styles.box, { backgroundColor: c.neutral[100] }]}>
      {!bad && (
        <Image source={{ uri: uri! }} resizeMode={resizeMode} resizeMethod="resize" fadeDuration={120} accessibilityLabel={alt} accessible={!!alt}
          style={StyleSheet.absoluteFill} onLoad={() => setState('ok')} onError={() => setState('error')} />
      )}
      {!bad && state === 'loading' && <ActivityIndicator size="small" color={c.neutral[400]} />}
      {bad && <Ionicons name="image-outline" size={28} color={c.neutral[400]} accessibilityElementsHidden importantForAccessibility="no" />}
    </View>
  );
}
export const RemoteImage = memo(RemoteImageBase);
const styles = StyleSheet.create({ box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });
