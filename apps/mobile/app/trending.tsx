import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  typography, radius, spacing, formatXOF,
  categoryLabel, categoryEmoji, type ColorPalette,
} from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import {
  getTrendingVenues, getActivePromotions, getCurrentEvents,
  type TrendingVenue, type ActivePromotion, type CurrentEvent,
} from '@/lib/trending';

type TabKey = 'trending' | 'promos' | 'events';

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap; emoji: string }[] = [
  { key: 'trending', label: 'Tendance',   icon: 'flame',      emoji: '🔥' },
  { key: 'promos',   label: 'Promos',     icon: 'pricetag',   emoji: '🎉' },
  { key: 'events',   label: 'Événements', icon: 'calendar',   emoji: '📅' },
];

/**
 * Module "Ça bouge maintenant".
 *
 *   🔥 Tendance     — get_trending_venues : top venues classés par
 *                     trend_score (activité 24h normalisée + boost ouvert
 *                     + popularity_score)
 *   🎉 Promos       — get_active_promotions : codes promos actifs joints
 *                     au venue, triés par discount_pct desc
 *   📅 Événements   — get_current_events : events en cours OU démarrent
 *                     dans les 24h
 *
 * GPS best-effort : si refusé/indisponible, on tombe sur le centre Abidjan
 * côté serveur. Pull-to-refresh pour recharger.
 */
export default function Trending() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('trending');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Données par tab — état séparé pour ne pas refetch les autres quand on switch.
  const [trending, setTrending] = useState<TrendingVenue[] | null>(null);
  const [promos, setPromos]     = useState<ActivePromotion[] | null>(null);
  const [events, setEvents]     = useState<CurrentEvent[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {/* tolérant */}
    })();
    return () => { active = false; };
  }, []);

  const load = useCallback(async (k: TabKey) => {
    setLoading(true);
    try {
      if (k === 'trending') {
        const data = await getTrendingVenues({ lat: coords?.lat, lng: coords?.lng, radiusKm: 50, limit: 30 });
        setTrending(data);
      } else if (k === 'promos') {
        const data = await getActivePromotions({ lat: coords?.lat, lng: coords?.lng, radiusKm: 50, limit: 50 });
        setPromos(data);
      } else {
        const data = await getCurrentEvents({ limit: 50, includeUpcomingHours: 48 });
        setEvents(data);
      }
    } catch (err: any) {
      console.error('[trending]', k, err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [coords?.lat, coords?.lng]);

  useEffect(() => { load(tab); }, [load, tab]);

  const onRefresh = () => { setRefreshing(true); load(tab); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Ça bouge maintenant 🔥" subtitle="Le pouls de la ville en temps réel" />

      {/* Tabs */}
      <View style={s.tabsRow}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[s.tab, active && s.tabActive]}
            >
              <Text style={[s.tabText, active && s.tabTextActive]}>{t.emoji} {t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={120} borderRadius={radius.lg} />
            ))}
          </View>
        ) : tab === 'trending' ? (
          <TrendingList data={trending ?? []} c={c} onPress={(id) => router.push({ pathname: '/venue/[id]', params: { id } })} />
        ) : tab === 'promos' ? (
          <PromosList data={promos ?? []} c={c} onPress={(id) => router.push({ pathname: '/venue/[id]', params: { id } })} />
        ) : (
          <EventsList data={events ?? []} c={c} onPress={(venueId) => venueId && router.push({ pathname: '/venue/[id]', params: { id: venueId } })} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================================
// Tab 1 — Trending
// ============================================================================
function TrendingList({ data, c, onPress }: { data: TrendingVenue[]; c: ColorPalette; onPress: (id: string) => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  if (data.length === 0) {
    return <EmptyState c={c} title="Aucune tendance pour l'instant" hint="Les venues qui prennent vie apparaîtront ici dès qu'il y aura de l'activité." />;
  }
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>
      {data.map((v, idx) => (
        <Pressable
          key={v.id}
          onPress={() => onPress(v.id)}
          style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }]}
        >
          <View style={s.cardHero}>
            {v.cover_url ? (
              <Image source={{ uri: v.cover_url }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={s.cardHeroFallback}>{categoryEmoji(v.category)}</Text>
            )}
            {/* Rank pill */}
            <View style={s.rankPill}>
              <Text style={s.rankPillText}>#{idx + 1}</Text>
            </View>
            {/* Trend score + flame */}
            <View style={s.trendPill}>
              <Ionicons name="flame" size={12} color="#fff" />
              <Text style={s.trendPillText}>{v.trend_score}</Text>
            </View>
            {/* Open now badge */}
            {v.is_open_now === true && (
              <View style={s.openBadge}>
                <View style={s.openDot} />
                <Text style={s.openBadgeText}>OUVERT</Text>
              </View>
            )}
          </View>
          <View style={s.cardBody}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.cardName} numberOfLines={1}>{v.name}</Text>
              {v.active_promo_count > 0 && (
                <View style={s.promoBadge}>
                  <Text style={s.promoBadgeText}>-%</Text>
                </View>
              )}
              {v.happening_event_count > 0 && (
                <View style={[s.promoBadge, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[s.promoBadgeText, { color: '#d97706' }]}>EVT</Text>
                </View>
              )}
            </View>
            <Text style={s.cardMeta} numberOfLines={1}>
              {categoryLabel(v.category)}
              {v.district ? ` · ${v.district}` : v.city ? ` · ${v.city}` : ''}
            </Text>
            <View style={s.cardStatsRow}>
              {v.rating_avg != null && v.rating_avg > 0 && (
                <Text style={s.statStar}>★ {Number(v.rating_avg).toFixed(1)}</Text>
              )}
              <Text style={s.statSubtle}>{v.activity_24h} vues 24h</Text>
              {v.distance_km != null && (
                <Text style={s.statSubtle}>
                  {v.distance_km < 1 ? `${Math.round(v.distance_km * 1000)} m` : `${v.distance_km.toFixed(1)} km`}
                </Text>
              )}
              {v.avg_price_xof != null && (
                <Text style={s.statPrice}>{formatXOF(v.avg_price_xof)}</Text>
              )}
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ============================================================================
// Tab 2 — Promos
// ============================================================================
function PromosList({ data, c, onPress }: { data: ActivePromotion[]; c: ColorPalette; onPress: (venueId: string) => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  if (data.length === 0) {
    return <EmptyState c={c} title="Aucune promo active" hint="Reviens plus tard, les établissements publient leurs promotions au fil de la journée." />;
  }
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>
      {data.map((p) => (
        <Pressable
          key={p.promo_id}
          onPress={() => onPress(p.venue_id)}
          style={({ pressed }) => [s.promoCard, pressed && { opacity: 0.9 }]}
        >
          <View style={s.discountBig}>
            <Text style={s.discountBigPct}>-{p.discount_pct}%</Text>
            <Text style={s.discountBigCode} numberOfLines={1}>{p.code}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.cardName} numberOfLines={1}>{p.venue_name}</Text>
            <Text style={s.cardMeta} numberOfLines={1}>
              {categoryEmoji(p.venue_category)} {categoryLabel(p.venue_category)}
              {p.venue_district ? ` · ${p.venue_district}` : p.venue_city ? ` · ${p.venue_city}` : ''}
            </Text>
            <View style={s.cardStatsRow}>
              {p.is_open_now === true && (
                <View style={s.miniOpen}>
                  <View style={s.openDot} />
                  <Text style={s.miniOpenText}>Ouvert</Text>
                </View>
              )}
              {p.distance_km != null && (
                <Text style={s.statSubtle}>
                  {p.distance_km < 1 ? `${Math.round(p.distance_km * 1000)} m` : `${p.distance_km.toFixed(1)} km`}
                </Text>
              )}
              {p.valid_until && (
                <Text style={s.statSubtle}>Jusqu'au {new Date(p.valid_until).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</Text>
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.neutral[400]} />
        </Pressable>
      ))}
    </View>
  );
}

// ============================================================================
// Tab 3 — Events
// ============================================================================
function EventsList({ data, c, onPress }: { data: CurrentEvent[]; c: ColorPalette; onPress: (venueId: string | null) => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  if (data.length === 0) {
    return <EmptyState c={c} title="Aucun événement en cours" hint="Les soirées, concerts et grands événements apparaîtront ici quand ils démarrent." />;
  }
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md }}>
      {data.map((e) => (
        <Pressable
          key={e.event_id}
          onPress={() => onPress(e.venue_id)}
          style={({ pressed }) => [s.eventCard, pressed && { opacity: 0.9 }]}
        >
          <View style={s.eventHero}>
            {e.cover_url ? (
              <Image source={{ uri: e.cover_url }} style={{ width: '100%', height: '100%' }} />
            ) : (
              <Text style={s.cardHeroFallback}>🎉</Text>
            )}
            {e.is_happening ? (
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveBadgeText}>EN COURS</Text>
              </View>
            ) : (
              <View style={[s.liveBadge, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                <Ionicons name="time-outline" size={11} color="#fff" />
                <Text style={s.liveBadgeText}>BIENTÔT</Text>
              </View>
            )}
          </View>
          <View style={s.cardBody}>
            <Text style={s.cardName} numberOfLines={2}>{e.title}</Text>
            <Text style={s.cardMeta} numberOfLines={1}>
              {e.venue_name ? `📍 ${e.venue_name}` : e.city ? `📍 ${e.city}` : '📍 Lieu à confirmer'}
            </Text>
            <View style={s.cardStatsRow}>
              <Text style={s.statSubtle}>
                {e.is_happening ? `Jusqu'à ${formatTimeFR(e.ends_at)}` : `Démarre ${formatRelativeFR(e.starts_at)}`}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyState({ c, title, hint }: { c: ColorPalette; title: string; hint: string }) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name="flame-outline" size={36} color={c.primary[400]} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyText}>{hint}</Text>
    </View>
  );
}

// ============================================================================
// Helpers date
// ============================================================================
function formatTimeFR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeFR(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((d - now) / 60000);
  if (diffMin <= 0) return "à l'instant";
  if (diffMin < 60) return `dans ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `dans ${h} h`;
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },

    tabsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.neutral[100],
    },
    tab: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: c.neutral[50],
      borderWidth: 1,
      borderColor: c.neutral[100],
      alignItems: 'center',
    },
    tabActive: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    tabText: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.dark },
    tabTextActive: { color: '#fff' },

    // -------- card commune (trending) --------
    card: {
      borderRadius: radius.lg,
      backgroundColor: '#fff',
      borderWidth: 1,
      borderColor: c.neutral[100],
      overflow: 'hidden',
    },
    cardHero: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: c.neutral[100],
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardHeroFallback: { fontSize: 64 },
    rankPill: {
      position: 'absolute', top: spacing.sm, left: spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.65)',
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    rankPillText: { color: '#fff', fontSize: typography.fontSize.xs, fontWeight: '800' },
    trendPill: {
      position: 'absolute', top: spacing.sm, right: spacing.sm,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#FF6B1A',
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    trendPillText: { color: '#fff', fontSize: typography.fontSize.xs, fontWeight: '800' },
    openBadge: {
      position: 'absolute', bottom: spacing.sm, left: spacing.sm,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(22,163,74,0.95)',
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
    openBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
    cardBody: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: 4,
    },
    cardName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, flex: 1 },
    cardMeta: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    cardStatsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    statStar: { fontSize: typography.fontSize.xs, color: c.warning, fontWeight: '700' },
    statSubtle: { fontSize: typography.fontSize.xs, color: c.neutral[600], fontWeight: '600' },
    statPrice: { fontSize: typography.fontSize.xs, color: c.dark, fontWeight: '700' },

    promoBadge: {
      paddingHorizontal: 6, paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: '#fce7f3',
    },
    promoBadgeText: { fontSize: 9, fontWeight: '800', color: '#be185d', letterSpacing: 0.3 },

    // -------- promos card --------
    promoCard: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      padding: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: '#fff',
      borderWidth: 1, borderColor: c.neutral[100],
    },
    discountBig: {
      width: 80, height: 80,
      borderRadius: radius.md,
      backgroundColor: c.primary[500],
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 4,
    },
    discountBigPct: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -1 },
    discountBigCode: { color: '#fff', fontSize: 10, fontWeight: '700', opacity: 0.9, maxWidth: 70 },

    miniOpen: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    miniOpenText: { fontSize: typography.fontSize.xs, color: '#16a34a', fontWeight: '700' },

    // -------- event card --------
    eventCard: {
      borderRadius: radius.lg,
      backgroundColor: '#fff',
      borderWidth: 1, borderColor: c.neutral[100],
      overflow: 'hidden',
    },
    eventHero: {
      width: '100%',
      aspectRatio: 16 / 9,
      backgroundColor: c.neutral[100],
      position: 'relative',
      alignItems: 'center', justifyContent: 'center',
    },
    liveBadge: {
      position: 'absolute', top: spacing.sm, left: spacing.sm,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#dc2626',
      borderRadius: radius.full,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
    liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

    // -------- empty state --------
    empty: {
      marginHorizontal: spacing.lg,
      marginTop: spacing.xl,
      padding: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: c.neutral[50],
      alignItems: 'center',
    },
    emptyIcon: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginBottom: 4 },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[500], textAlign: 'center', maxWidth: 320, lineHeight: 19 },
  });
}
