import { useEffect, useState } from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

/**
 * Preview vidéo en auto-play silencieux pour Gallery (hero + thumbs).
 *
 * Pattern miroir d'Instagram/Booking/Airbnb :
 *   • muted (pas de son par défaut, évite les surprises sonores)
 *   • loop (boucle infinie)
 *   • playsInline (iOS — ne passe pas en plein écran tout seul)
 *   • contentFit cover (remplit le container, recadrage centré)
 *   • overlay sans-bruit en bas à droite pour indiquer que c'est une
 *     vidéo (signal visuel discret)
 *
 * Le son réel + controls + plein écran restent disponibles dans le
 * Lightbox au tap.
 */
interface Props {
  uri: string;
  style?: StyleProp<ViewStyle>;
  /** Taille de l'icône muted (par défaut 18 pour le hero, 12 pour les thumbs). */
  badgeSize?: number;
}

export function VideoPreview({ uri, style, badgeSize = 18 }: Props) {
  const [hasError, setHasError] = useState(false);

  // useVideoPlayer est stable tant que `uri` ne change pas. Le callback
  // d'initialisation configure mute + loop + lance la lecture.
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  // Détecte les erreurs de lecture (URL invalide / format non supporté)
  // pour basculer en placeholder play-icon (fallback gracieux, jamais
  // d'écran noir + bouton mort).
  useEffect(() => {
    const sub = player.addListener?.('statusChange', (status: any) => {
      if (status?.status === 'error' || status?.error) {
        setHasError(true);
      }
    });
    return () => {
      try { sub?.remove?.(); } catch { /* listener déjà retiré */ }
    };
  }, [player]);

  if (hasError) {
    return (
      <View style={[styles.fallback, style]}>
        <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.95)" />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, style]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {/* Badge "muet" en bas à droite — signal Instagram-like */}
      <View style={styles.mutedBadge}>
        <Ionicons name="volume-mute" size={badgeSize - 4} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
  },
  video: { width: '100%', height: '100%' },
  mutedBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
