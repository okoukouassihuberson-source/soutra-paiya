import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { TabHeader } from '@/components/TabHeader';
import { Skeleton } from '@/components/Skeleton';

interface Reservation {
  id: string;
  venue_id: string;
  date_time: string;
  party_size: number;
  deposit_xof: number;
  status: string;
  qr_code: string;
  notes: string | null;
  created_at: string;
  venue: {
    id: string;
    name: string;
    cover_url: string | null;
    city: string | null;
    district: string | null;
  } | null;
}

export default function Tickets() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReservations = useCallback(async () => {
    if (!user?.id) {
      setReservations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select(`
          id, venue_id, date_time, party_size, deposit_xof, status, qr_code, notes, created_at,
          venue:venues(id, name, cover_url, city, district)
        `)
        .eq('user_id', user.id)
        .order('date_time', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[tickets] load error:', error);
        Alert.alert('Erreur', `Impossible de charger les réservations : ${error.message}`);
        setReservations([]);
      } else {
        setReservations((data ?? []) as unknown as Reservation[]);
      }
    } catch (err: any) {
      console.error('[tickets] unexpected:', err);
      Alert.alert('Erreur', err?.message ?? 'Erreur inattendue');
      setReservations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    loadReservations();
  }, [authLoading, loadReservations]);

  // Split à venir / passées : seuil = maintenant.
  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: Reservation[] = [];
    const dn: Reservation[] = [];
    for (const r of reservations) {
      const ts = new Date(r.date_time).getTime();
      if (ts >= now && r.status !== 'cancelled' && r.status !== 'refunded') up.push(r);
      else dn.push(r);
    }
    // À venir : ordre chronologique (la plus proche en premier).
    up.sort((a, b) => +new Date(a.date_time) - +new Date(b.date_time));
    return { upcoming: up, past: dn };
  }, [reservations]);

  const subtitle = reservations.length === 0
    ? 'Aucune réservation pour l\'instant'
    : `${upcoming.length} à venir · ${past.length} dans l'historique`;

  if (authLoading || loading) {
    return (
      <SafeAreaView style={s.safe}>
        <TabHeader subtitle="Chargement…" />
        <View style={{ paddingTop: spacing.md }}>
          <View style={s.skeletonSection}>
            <Skeleton width={140} height={18} />
          </View>
          <TicketSkeleton />
          <TicketSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  if (!reservations.length) {
    return (
      <SafeAreaView style={s.safe}>
        <TabHeader subtitle={subtitle} />
        <ScrollView
          contentContainerStyle={s.emptyBody}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReservations(); }} />}
        >
          <View style={s.emptyIconWrap}>
            <Ionicons name="ticket-outline" size={56} color={colors.primary[400]} />
          </View>
          <Text style={s.emptyTitle}>Pas encore de réservation</Text>
          <Text style={s.emptyText}>
            Réserve une table dans un maquis, restaurant ou bar — tes billets apparaîtront ici.
          </Text>
          <Pressable
            style={({ pressed }) => [s.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
            onPress={() => router.push('/(tabs)/explore')}
          >
            <Ionicons name="compass" size={18} color="#fff" />
            <Text style={s.ctaText}>Explorer les lieux</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <TabHeader subtitle={subtitle} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReservations(); }} />}
      >
        {upcoming.length > 0 && (
          <>
            <View style={s.sectionTitleRow}>
              <View style={[s.sectionAccent, { backgroundColor: colors.primary[500] }]} />
              <Text style={s.sectionTitle}>À venir</Text>
              <Text style={s.sectionCount}>{upcoming.length}</Text>
            </View>
            {upcoming.map((r) => (
              <ReservationCard key={r.id} reservation={r} onPress={() => openDetail(r, router)} />
            ))}
          </>
        )}

        {past.length > 0 && (
          <>
            <View style={s.sectionTitleRow}>
              <View style={[s.sectionAccent, { backgroundColor: colors.neutral[400] }]} />
              <Text style={s.sectionTitle}>Historique</Text>
              <Text style={s.sectionCount}>{past.length}</Text>
            </View>
            {past.map((r) => (
              <ReservationCard key={r.id} reservation={r} muted onPress={() => openDetail(r, router)} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function openDetail(r: Reservation, _router: ReturnType<typeof useRouter>) {
  // Pas d'écran de détail dédié pour l'instant -> on garde l'Alert comme
  // avant. Quand on créera /ticket/[id], il suffira de remplacer ici.
  Alert.alert(
    r.venue?.name ?? 'Réservation',
    `Statut : ${statusMeta(r.status).label}\n` +
    `Date : ${new Date(r.date_time).toLocaleString('fr-FR')}\n` +
    `Personnes : ${r.party_size}\n` +
    `Dépôt : ${formatXOF(r.deposit_xof)}\n` +
    `QR : ${r.qr_code.slice(0, 8)}…`
  );
}

function ReservationCard({ reservation, onPress, muted }: { reservation: Reservation; onPress: () => void; muted?: boolean }) {
  const dateTime = new Date(reservation.date_time);
  const { color: statusColor, label: statusLabel, icon: statusIcon } = statusMeta(reservation.status);
  const dateLabel = relativeDateTime(dateTime);

  return (
    <Pressable
      style={({ pressed }) => [
        s.card,
        muted && s.cardMuted,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
      ]}
      onPress={onPress}
    >
      <View style={s.thumbWrap}>
        {reservation.venue?.cover_url ? (
          <Image source={{ uri: reservation.venue.cover_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbPlaceholder]}>
            <Ionicons name="restaurant" size={28} color={colors.neutral[400]} />
          </View>
        )}
      </View>
      <View style={s.cardBody}>
        <Text style={s.venueName} numberOfLines={1}>{reservation.venue?.name ?? 'Lieu inconnu'}</Text>
        <View style={s.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.neutral[500]} />
          <Text style={s.metaText}>{dateLabel}</Text>
        </View>
        <View style={s.metaRow}>
          <Ionicons name="people-outline" size={13} color={colors.neutral[500]} />
          <Text style={s.metaText}>{reservation.party_size} personne{reservation.party_size > 1 ? 's' : ''}</Text>
          {reservation.venue?.district ? (
            <>
              <Text style={s.metaSep}>·</Text>
              <Ionicons name="location-outline" size={13} color={colors.neutral[500]} />
              <Text style={s.metaText} numberOfLines={1}>{reservation.venue.district}</Text>
            </>
          ) : null}
        </View>
        <View style={s.footerRow}>
          <View style={[s.statusBadge, { backgroundColor: statusColor + '1A', borderColor: statusColor + '40' }]}>
            <Ionicons name={statusIcon} size={11} color={statusColor} />
            <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          <Text style={s.deposit}>{formatXOF(reservation.deposit_xof)}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} style={s.chev} />
    </Pressable>
  );
}

function TicketSkeleton() {
  return (
    <View style={s.card}>
      <Skeleton width={88} height={88} borderRadius={12} />
      <View style={s.cardBody}>
        <Skeleton width="70%" height={18} />
        <Skeleton width="50%" height={12} style={{ marginTop: 10 }} />
        <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

function relativeDateTime(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Aujourd'hui à ${time}`;
  if (isTomorrow) return `Demain à ${time}`;
  const diffDays = Math.round((d.getTime() - now.getTime()) / (24 * 3600 * 1000));
  if (diffDays > 1 && diffDays <= 7) return `Dans ${diffDays} jours à ${time}`;
  if (diffDays < -1 && diffDays >= -7) return `Il y a ${Math.abs(diffDays)} jours`;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${time}`;
}

function statusMeta(status: string): { color: string; label: string; icon: keyof typeof Ionicons.glyphMap } {
  switch (status) {
    case 'pending': return { color: colors.warning, label: 'En attente', icon: 'time-outline' };
    case 'confirmed': return { color: colors.success, label: 'Confirmée', icon: 'checkmark-circle' };
    case 'arrived': return { color: colors.primary[600], label: 'Arrivé', icon: 'walk' };
    case 'no_show': return { color: colors.danger, label: 'No show', icon: 'alert-circle' };
    case 'cancelled': return { color: colors.danger, label: 'Annulée', icon: 'close-circle' };
    case 'refunded': return { color: colors.neutral[500], label: 'Remboursée', icon: 'arrow-undo' };
    default: return { color: colors.neutral[500], label: status, icon: 'help-circle' };
  }
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  skeletonSection: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  emptyBody: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIconWrap: { width: 112, height: 112, borderRadius: 56, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, marginBottom: spacing.xs },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.neutral[500], textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  cta: {
    marginTop: spacing.xl,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full,
    shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  sectionAccent: { width: 4, height: 18, borderRadius: 2 },
  sectionTitle: { flex: 1, fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  sectionCount: { fontSize: typography.fontSize.xs, fontWeight: '700', color: colors.neutral[500], backgroundColor: colors.neutral[100], paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  card: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    padding: spacing.md, gap: spacing.md,
    backgroundColor: '#fff', borderRadius: radius.lg,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  cardMuted: { opacity: 0.78 },
  thumbWrap: { width: 88, height: 88 },
  thumb: { width: 88, height: 88, borderRadius: 12, backgroundColor: colors.neutral[100] },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 4 },
  venueName: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: typography.fontSize.xs, color: colors.neutral[600] },
  metaSep: { color: colors.neutral[400], marginHorizontal: 4 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  deposit: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.primary[600] },
  chev: { marginLeft: -spacing.sm },
});
