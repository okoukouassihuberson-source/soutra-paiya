import { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { Lightbox, type MediaItem } from './Lightbox';
import { VideoPreview } from './VideoPreview';

interface Props {
  /** Cover photo principale (premium en haut). Si absente, on prend la première de gallery. */
  cover?: string | null;
  /** Galerie photos secondaires. */
  gallery?: string[] | null;
  /** Galerie vidéos (mp4/mov/webm). Placées après les images dans le carousel. */
  videos?: string[] | null;
}

/**
 * Galerie premium inspirée d'Airbnb/Booking.
 *
 *   ┌────────────────────────────────┐
 *   │                                │
 *   │     PHOTO PRINCIPALE (16:9)    │  ← tap → lightbox index 0
 *   │                                │
 *   ├──────────┬──────────┬──────────┤
 *   │  THUMB 1 │ ▶ VIDEO  │ +N items │  ← tap → lightbox index correspondant
 *   └──────────┴──────────┴──────────┘
 *
 * Détection vidéo : extension .mp4/.mov/.webm/.m4v/.avi ⇒ MediaItem kind=video.
 * Les vidéos sont placées en queue de liste pour préserver la photo principale
 * comme hero. Sur les vignettes vidéo, un overlay ▶ centré identifie le format.
 *
 * Toutes les tuiles sont tappables → ouvrent un Lightbox plein écran avec
 * swipe horizontal, pinch-to-zoom sur images, controls natifs sur vidéos.
 */
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  return !!url && VIDEO_EXT.test(url);
}

export function Gallery({ cover, gallery, videos }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  // Construit la liste finale typée :
  //   - cover en premier (si elle existe et n'est pas vidéo) → image
  //   - gallery (déduplique cover)                            → image
  //   - videos                                                 → video
  // Tolérant : si la cover est par erreur une vidéo, on la garde mais marquée
  // kind=video (la hero affichera l'icône play et le tap ouvre la vidéo).
  const allMedia = useMemo<MediaItem[]>(() => {
    const list: MediaItem[] = [];
    if (cover) list.push({ url: cover, kind: isVideoUrl(cover) ? 'video' : 'image' });
    if (gallery) {
      for (const url of gallery) {
        if (url && url !== cover) list.push({ url, kind: isVideoUrl(url) ? 'video' : 'image' });
      }
    }
    if (videos) {
      for (const url of videos) {
        if (url && url !== cover) list.push({ url, kind: 'video' });
      }
    }
    return list;
  }, [cover, gallery, videos]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (allMedia.length === 0) return null;

  const hero = allMedia[0];
  const thumbs = allMedia.slice(1, 4);
  const remaining = Math.max(0, allMedia.length - 4);
  const photoCount = allMedia.filter((m) => m.kind === 'image').length;
  const videoCount = allMedia.filter((m) => m.kind === 'video').length;

  return (
    <>
      <View style={s.wrap}>
        {/* Hero */}
        <Pressable
          onPress={() => setLightboxIndex(0)}
          style={({ pressed }) => [s.heroBox, pressed && { opacity: 0.92 }]}
          accessibilityRole="imagebutton"
          accessibilityLabel="Voir les médias en plein écran"
        >
          {hero.kind === 'image' ? (
            <Image source={{ uri: hero.url }} style={s.heroImg} />
          ) : (
            <VideoPreview uri={hero.url} style={s.heroImg} badgeSize={20} />
          )}
          {allMedia.length > 1 && (
            <View style={s.counterPill}>
              <Ionicons name={videoCount > 0 ? 'film' : 'images'} size={13} color="#fff" />
              <Text style={s.counterPillText}>
                {photoCount > 0 ? `${photoCount}` : ''}
                {photoCount > 0 && videoCount > 0 ? ' · ' : ''}
                {videoCount > 0 ? `▶ ${videoCount}` : ''}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Row de thumbs sous le hero (si > 1 média) */}
        {thumbs.length > 0 && (
          <View style={s.thumbRow}>
            {thumbs.map((m, idx) => {
              const absoluteIndex = idx + 1; // hero était à 0
              const isLast = idx === thumbs.length - 1;
              const showRemaining = isLast && remaining > 0;
              return (
                <Pressable
                  key={m.url + idx}
                  onPress={() => setLightboxIndex(absoluteIndex)}
                  style={({ pressed }) => [s.thumbBox, pressed && { opacity: 0.85 }]}
                >
                  {m.kind === 'image' ? (
                    <Image source={{ uri: m.url }} style={s.thumbImg} />
                  ) : (
                    <VideoPreview uri={m.url} style={s.thumbImg} badgeSize={12} />
                  )}
                  {/* Mini badge ▶ sur les thumbnails vidéo (au-dessus de la photo si jamais) */}
                  {m.kind === 'video' && !showRemaining && (
                    <View style={s.videoBadge}>
                      <Ionicons name="play" size={10} color="#fff" />
                    </View>
                  )}
                  {showRemaining && (
                    <View style={s.thumbOverlay}>
                      <Text style={s.thumbOverlayText}>+{remaining}</Text>
                      <Text style={s.thumbOverlaySub}>médias</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
            {/* Pad les colonnes manquantes pour aligner le grid si on a < 3 thumbs */}
            {Array.from({ length: Math.max(0, 3 - thumbs.length) }).map((_, i) => (
              <View key={`pad-${i}`} style={s.thumbBoxPlaceholder} />
            ))}
          </View>
        )}
      </View>

      <Lightbox
        visible={lightboxIndex !== null}
        media={allMedia}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}

const screenW = Dimensions.get('window').width;
const HORIZONTAL_PADDING = spacing.lg * 2;
const THUMB_GAP = spacing.xs;
const THUMB_WIDTH = (screenW - HORIZONTAL_PADDING - THUMB_GAP * 2) / 3;

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: THUMB_GAP, marginHorizontal: spacing.lg },

    heroBox: {
      position: 'relative',
      width: '100%',
      aspectRatio: 16 / 9,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: c.neutral[100],
    },
    heroImg: { width: '100%', height: '100%' },

    videoHero: {
      width: '100%',
      height: '100%',
      backgroundColor: '#0a0a0a',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    videoHeroHint: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    counterPill: {
      position: 'absolute',
      bottom: spacing.sm,
      right: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    counterPillText: {
      color: '#fff',
      fontSize: typography.fontSize.xs,
      fontWeight: '700',
      letterSpacing: 0.3,
    },

    thumbRow: {
      flexDirection: 'row',
      gap: THUMB_GAP,
    },
    thumbBox: {
      position: 'relative',
      width: THUMB_WIDTH,
      height: THUMB_WIDTH,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: c.neutral[100],
    },
    thumbBoxPlaceholder: {
      width: THUMB_WIDTH,
      height: 0,
    },
    thumbImg: { width: '100%', height: '100%' },
    thumbVideoFallback: {
      width: '100%', height: '100%',
      backgroundColor: '#0a0a0a',
      alignItems: 'center', justifyContent: 'center',
    },
    videoBadge: {
      position: 'absolute', top: 6, right: 6,
      width: 18, height: 18, borderRadius: 9,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center', justifyContent: 'center',
    },
    thumbOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbOverlayText: {
      color: '#fff',
      fontSize: typography.fontSize.lg,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    thumbOverlaySub: {
      color: 'rgba(255,255,255,0.85)',
      fontSize: typography.fontSize.xs,
      fontWeight: '600',
      marginTop: 1,
    },
  });
}
