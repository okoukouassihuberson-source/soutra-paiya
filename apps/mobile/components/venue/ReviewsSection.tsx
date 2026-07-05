// ============================================================================
// ReviewsSection — composition complète du bloc "Avis" de la fiche
// établissement : répartition des notes, tri, liste paginée, CTA, sheets.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useAuth } from '@/lib/auth-context';
import { RatingDistribution } from './RatingDistribution';
import { ReviewCard } from './ReviewCard';
import { ReviewFormSheet } from './ReviewFormSheet';
import { ReviewReportSheet } from './ReviewReportSheet';
import {
  getVenueReviewStats,
  listVenueReviews,
  deleteReview,
  toggleReviewHelpful,
  type Review,
  type ReviewStats,
  type ReviewSort,
} from '@/lib/reviews';

interface Props {
  venueId: string;
  venueName: string;
}

const SORT_OPTIONS: { key: ReviewSort; label: string }[] = [
  { key: 'recent', label: 'Récents' },
  { key: 'helpful', label: 'Utiles' },
  { key: 'rating_high', label: 'Note ↑' },
  { key: 'rating_low', label: 'Note ↓' },
];

const PAGE_SIZE = 10;

export function ReviewsSection({ venueId, venueName }: Props) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuth();

  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);

  const loadFirstPage = useCallback(async (nextSort: ReviewSort) => {
    setLoading(true);
    try {
      const [nextStats, firstPage] = await Promise.all([
        getVenueReviewStats(venueId),
        listVenueReviews(venueId, nextSort, PAGE_SIZE, 0),
      ]);
      setStats(nextStats);
      setReviews(firstPage);
      setHasMore(firstPage.length === PAGE_SIZE);
    } catch {
      // Section non bloquante — la fiche reste utilisable si les avis échouent à charger.
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    void loadFirstPage(sort);
  }, [loadFirstPage, sort]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await listVenueReviews(venueId, sort, PAGE_SIZE, reviews.length);
      setReviews((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch {
      // silencieux — l'utilisateur peut retenter via le bouton
    } finally {
      setLoadingMore(false);
    }
  };

  const handleToggleHelpful = async (reviewId: string) => {
    // Optimistic update, aligné sur le pattern toggleFavorite de venue/[id].tsx.
    setReviews((prev) => prev.map((r) => (
      r.id === reviewId
        ? { ...r, iVotedHelpful: !r.iVotedHelpful, helpfulCount: r.helpfulCount + (r.iVotedHelpful ? -1 : 1) }
        : r
    )));
    try {
      const result = await toggleReviewHelpful(reviewId);
      setReviews((prev) => prev.map((r) => (
        r.id === reviewId ? { ...r, iVotedHelpful: result.voted, helpfulCount: result.count } : r
      )));
    } catch {
      // rollback
      setReviews((prev) => prev.map((r) => (
        r.id === reviewId
          ? { ...r, iVotedHelpful: !r.iVotedHelpful, helpfulCount: r.helpfulCount + (r.iVotedHelpful ? -1 : 1) }
          : r
      )));
    }
  };

  const handleDelete = (reviewId: string) => {
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    deleteReview(reviewId)
      .then(() => void loadFirstPage(sort))
      .catch(() => {
        Alert.alert('Erreur', "Impossible de supprimer l'avis.");
        void loadFirstPage(sort);
      });
  };

  const alreadyReviewed = user?.id ? reviews.some((r) => r.isMine) : false;

  return (
    <View style={s.wrap}>
      <Text style={s.sectionTitle}>Avis</Text>

      {loading ? (
        <ActivityIndicator color={c.primary[500]} style={{ marginVertical: spacing.lg }} />
      ) : (
        <>
          {stats && <RatingDistribution stats={stats} />}

          <Pressable
            style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.9 }]}
            onPress={() => { setEditingReview(null); setFormOpen(true); }}
          >
            <Ionicons name="star-outline" size={16} color="#fff" />
            <Text style={s.ctaText}>{alreadyReviewed ? 'Gérer mon avis' : 'Laisser un avis'}</Text>
          </Pressable>

          {reviews.length > 0 && (
            <View style={s.chips}>
              {SORT_OPTIONS.map((opt) => {
                const active = sort === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setSort(opt.key)}
                    style={[s.chip, active && s.chipActive]}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {reviews.length === 0 ? (
            <Text style={s.emptyText}>Aucun avis pour l'instant. Sois le premier à en laisser un !</Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              {reviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  onToggleHelpful={handleToggleHelpful}
                  onEdit={(rev) => { setEditingReview(rev); setFormOpen(true); }}
                  onDelete={handleDelete}
                  onReport={(id) => setReportingReviewId(id)}
                />
              ))}
              {hasMore && (
                <Pressable style={s.loadMoreBtn} onPress={loadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <ActivityIndicator color={c.primary[500]} />
                  ) : (
                    <Text style={s.loadMoreText}>Voir plus d'avis</Text>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </>
      )}

      <ReviewFormSheet
        visible={formOpen}
        onClose={() => { setFormOpen(false); setEditingReview(null); }}
        venueId={venueId}
        venueName={venueName}
        editingReview={editingReview}
        onSubmitted={() => void loadFirstPage(sort)}
      />

      <ReviewReportSheet
        visible={!!reportingReviewId}
        onClose={() => setReportingReviewId(null)}
        reviewId={reportingReviewId ?? ''}
      />
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginTop: spacing.xl },
    sectionTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginBottom: spacing.sm },
    ctaBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500], borderRadius: radius.full,
      paddingVertical: spacing.md, marginBottom: spacing.md,
    },
    ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
      borderRadius: radius.full, borderWidth: 1, borderColor: c.neutral[200],
      backgroundColor: c.light,
    },
    chipActive: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    chipText: { fontSize: typography.fontSize.xs, fontWeight: '600', color: c.neutral[600] },
    chipTextActive: { color: '#fff' },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', paddingVertical: spacing.lg },
    loadMoreBtn: { alignItems: 'center', paddingVertical: spacing.md },
    loadMoreText: { color: c.primary[600], fontWeight: '700', fontSize: typography.fontSize.sm },
  });
}
