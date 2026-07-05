import { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatRelativeDate, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { StarRatingInput } from './StarRatingInput';
import { Lightbox, type MediaItem } from './Lightbox';
import type { Review } from '@/lib/reviews';

interface Props {
  review: Review;
  onToggleHelpful: (reviewId: string) => void;
  onEdit?: (review: Review) => void;
  onDelete?: (reviewId: string) => void;
  onReport?: (reviewId: string) => void;
}

export function ReviewCard({ review, onToggleHelpful, onEdit, onDelete, onReport }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const media: MediaItem[] = review.photos.map((url) => ({ url, kind: 'image' }));
  const initial = (review.fullName ?? '?').trim().charAt(0).toUpperCase();

  const confirmDelete = () => {
    setMenuOpen(false);
    Alert.alert('Supprimer ton avis ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => onDelete?.(review.id) },
    ]);
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        {review.avatarUrl ? (
          <Image source={{ uri: review.avatarUrl }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{review.fullName ?? 'Utilisateur'}</Text>
          <Text style={s.date}>{formatRelativeDate(review.createdAt)}</Text>
        </View>
        <Pressable hitSlop={8} onPress={() => setMenuOpen((v) => !v)}>
          <Ionicons name="ellipsis-horizontal" size={18} color={c.neutral[500]} />
        </Pressable>
      </View>

      {menuOpen && (
        <View style={s.menu}>
          {review.isMine ? (
            <>
              <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); onEdit?.(review); }}>
                <Ionicons name="create-outline" size={16} color={c.dark} />
                <Text style={s.menuItemText}>Modifier</Text>
              </Pressable>
              <Pressable style={s.menuItem} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={16} color={c.danger} />
                <Text style={[s.menuItemText, { color: c.danger }]}>Supprimer</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={s.menuItem} onPress={() => { setMenuOpen(false); onReport?.(review.id); }}>
              <Ionicons name="flag-outline" size={16} color={c.neutral[600]} />
              <Text style={s.menuItemText}>Signaler</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={{ marginVertical: spacing.xs }}>
        <StarRatingInput value={review.rating} readOnly size={16} />
      </View>

      {review.body && <Text style={s.body}>{review.body}</Text>}

      {media.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {media.map((m, i) => (
              <Pressable key={i} onPress={() => setLightboxIndex(i)}>
                <Image source={{ uri: m.url }} style={s.photo} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      <Pressable style={s.helpfulBtn} onPress={() => onToggleHelpful(review.id)} hitSlop={6}>
        <Ionicons
          name={review.iVotedHelpful ? 'thumbs-up' : 'thumbs-up-outline'}
          size={16}
          color={review.iVotedHelpful ? c.primary[600] : c.neutral[500]}
        />
        <Text style={[s.helpfulText, review.iVotedHelpful && { color: c.primary[600] }]}>
          Utile{review.helpfulCount > 0 ? ` (${review.helpfulCount})` : ''}
        </Text>
      </Pressable>

      <Lightbox
        visible={lightboxIndex !== null}
        media={media}
        initialIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.neutral[100],
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.neutral[100] },
    avatarFallback: { alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.neutral[600] },
    name: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    date: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 1 },
    menu: {
      alignSelf: 'flex-end',
      backgroundColor: c.light,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.neutral[200],
      paddingVertical: 4,
      marginTop: 4,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
    menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    menuItemText: { fontSize: typography.fontSize.sm, color: c.dark },
    body: { fontSize: typography.fontSize.sm, color: c.neutral[700], lineHeight: 20, marginTop: 2 },
    photo: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: c.neutral[100] },
    helpfulBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
    helpfulText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: c.neutral[500] },
  });
}
