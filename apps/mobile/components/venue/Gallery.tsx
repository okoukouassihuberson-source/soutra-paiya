import { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { Lightbox } from './Lightbox';

interface Props {
  /** Cover photo principale (premium en haut). Si absente, on prend la première de gallery. */
  cover?: string | null;
  /** Galerie photos secondaires. */
  gallery?: string[] | null;
}

/**
 * Galerie premium inspirée d'Airbnb/Booking.
 *
 *   ┌────────────────────────────────┐
 *   │                                │
 *   │     PHOTO PRINCIPALE (16:9)    │  ← tap → lightbox index 0
 *   │                                │
 *   ├──────────┬──────────┬──────────┤
 *   │  THUMB 1 │  THUMB 2 │ +N photos│  ← tap → lightbox index correspondant
 *   └──────────┴──────────┴──────────┘
 *
 * Sur mobile portrait, la photo principale fait 100% de la largeur,
 * ratio 16:9. Les 3 thumbnails en dessous font ~1/3 de la largeur
 * chacune, ratio 1:1. La 3e tuile affiche le compteur "+N photos"
 * en overlay s'il reste plus de 3 photos après la principale.
 *
 * Toutes les images sont tappables → ouvrent un Lightbox plein écran
 * (Modal) avec swipe horizontal, pinch-to-zoom et double-tap zoom.
 */
export function Gallery({ cover, gallery }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  // Construit la liste finale : cover en premier (dedupé), puis gallery.
  const allImages = useMemo(() => {
    const list: string[] = [];
    if (cover) list.push(cover);
    if (gallery) for (const url of gallery) if (url !== cover) list.push(url);
    return list;
  }, [cover, gallery]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (allImages.length === 0) return null;

  const heroUrl = allImages[0];
  const thumbs = allImages.slice(1, 4);
  const remaining = Math.max(0, allImages.length - 4);

  return (
    <>
      <View style={s.wrap}>
        {/* Hero */}
        <Pressable
          onPress={() => setLightboxIndex(0)}
          style={({ pressed }) => [s.heroBox, pressed && { opacity: 0.92 }]}
          accessibilityRole="imagebutton"
          accessibilityLabel="Voir les photos en plein écran"
        >
          <Image source={{ uri: heroUrl }} style={s.heroImg} />
          {allImages.length > 1 && (
            <View style={s.counterPill}>
              <Ionicons name="images" size={13} color="#fff" />
              <Text style={s.counterPillText}>{allImages.length}</Text>
            </View>
          )}
        </Pressable>

        {/* Row de thumbs sous le hero (si > 1 image) */}
        {thumbs.length > 0 && (
          <View style={s.thumbRow}>
            {thumbs.map((url, idx) => {
              const absoluteIndex = idx + 1; // cover était à 0
              const isLast = idx === thumbs.length - 1;
              const showRemaining = isLast && remaining > 0;
              return (
                <Pressable
                  key={url + idx}
                  onPress={() => setLightboxIndex(absoluteIndex)}
                  style={({ pressed }) => [s.thumbBox, pressed && { opacity: 0.85 }]}
                >
                  <Image source={{ uri: url }} style={s.thumbImg} />
                  {showRemaining && (
                    <View style={s.thumbOverlay}>
                      <Text style={s.thumbOverlayText}>+{remaining}</Text>
                      <Text style={s.thumbOverlaySub}>photos</Text>
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
        images={allImages}
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
