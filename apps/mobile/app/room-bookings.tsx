import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, Image, Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * /room-bookings — mes réservations chambres (mobile).
 *
 * Liste les bookings du user via RPC list_my_room_bookings (migration 0059).
 * Segments : Toutes | À venir | Terminées. Tap → /room-bookings/[id].
 *
 * Bouton "Payer" inline pour les pending (déclenche paystack-pay-room-booking).
 * Real-time : channel postgres_changes sur room_bookings where user_id = self.
 */

type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'refunded';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

interface RoomBooking {
  booking_id: string;
  booking_number: string;
  venue_id: string;
  venue_name: string;
  venue_cover: string | null;
  room_id: string;
  room_name: string;
  check_in_date: string;  // YYYY-MM-DD
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  total_xof: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  created_at: string;
}

const STATUS_META: Record<BookingStatus, { label: string; color: string; icon: string }> = {
  pending:      { label: 'En attente',  color: '#f59e0b', icon: 'time-outline' },
  confirmed:    { label: 'Confirmée',   color: '#3b82f6', icon: 'checkmark-circle-outline' },
  checked_in:   { label: 'Check-in',    color: '#10b981', icon: 'key-outline' },
  checked_out:  { label: 'Terminée',    color: '#059669', icon: 'checkmark-done-outline' },
  cancelled:    { label: 'Annulée',     color: '#737373', icon: 'close-circle-outline' },
  refunded:     { label: 'Remboursée',  color: '#a855f7', icon: 'refresh-circle-outline' },
};

type Segment = 'all' | 'upcoming' | 'past';

function isUpcoming(b: RoomBooking): boolean {
  if (b.status === 'cancelled' || b.status === 'refunded' || b.status === 'checked_out') return false;
  return new Date(b.check_out_date).getTime() >= Date.now();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function RoomBookingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [segment, setSegment] = useState<Segment>('all');
  const [payingId, setPayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setBookings([]); setLoading(false); setRefreshing(false); return; }
    try {
      const { data, error } = await (supabase.rpc as any)('list_my_room_bookings', { p_limit: 100 });
      if (error) {
        console.error('[room-bookings] load:', error);
        setBookings([]);
      } else {
        setBookings((data as RoomBooking[]) ?? []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // Real-time : maj instantanée des bookings du user (confirmation paiement,
  // check-in, annulation par merchant, etc.)
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`my-room-bookings-${user.id}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'room_bookings', filter: `user_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { try { (supabase as any).removeChannel(channel); } catch { /* unsubscribed */ } };
  }, [user?.id, load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const filtered = useMemo(() => {
    if (segment === 'upcoming') return bookings.filter(isUpcoming);
    if (segment === 'past') return bookings.filter((b) => !isUpcoming(b));
    return bookings;
  }, [bookings, segment]);

  const handlePay = useCallback(async (b: RoomBooking) => {
    setPayingId(b.booking_id);
    try {
      const { data, error } = await (supabase.functions as any).invoke(
        'paystack-pay-room-booking',
        { body: { booking_id: b.booking_id } },
      );
      if (error) throw error;
      const url = (data as any)?.authorization_url;
      if (!url) throw new Error('Lien de paiement indisponible');
      await WebBrowser.openBrowserAsync(url);
      void load();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Paiement impossible');
    } finally {
      setPayingId(null);
    }
  }, [load]);

  const handleCancel = useCallback(async (b: RoomBooking) => {
    Alert.alert(
      'Annuler la réservation',
      `Tu vas annuler ${b.booking_number}. Cette action est définitive.`,
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Annuler', style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.rpc as any)('update_room_booking_status', {
                p_booking_id: b.booking_id,
                p_status: 'cancelled',
                p_reason: 'Annulation client',
              });
              if (error) throw error;
              void load();
            } catch (err: any) {
              Alert.alert('Erreur', err?.message || 'Annulation impossible');
            }
          },
        },
      ],
    );
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Mes nuitées" />
        <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Mes nuitées"
        subtitle={bookings.length > 0 ? `${bookings.length} réservation${bookings.length > 1 ? 's' : ''}` : undefined}
      />

      {/* Segments */}
      <View style={s.segments}>
        {(['all', 'upcoming', 'past'] as Segment[]).map((seg) => (
          <Pressable
            key={seg}
            onPress={() => setSegment(seg)}
            style={[s.segment, segment === seg && s.segmentActive]}
          >
            <Text style={[s.segmentText, segment === seg && s.segmentTextActive]}>
              {seg === 'all' ? 'Toutes' : seg === 'upcoming' ? 'À venir' : 'Passées'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="bed-outline" size={56} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Aucune réservation</Text>
            <Text style={s.emptyBody}>
              Tes prochaines nuitées s&apos;afficheront ici. Parcours nos hôtels !
            </Text>
            <Pressable
              style={({ pressed }) => [s.emptyCta, pressed && { opacity: 0.9 }]}
              onPress={() => router.push('/(tabs)/explore' as any)}
            >
              <Text style={s.emptyCtaText}>Explorer les hôtels</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.list}>
            {filtered.map((b) => (
              <BookingCard
                key={b.booking_id}
                c={c}
                booking={b}
                paying={payingId === b.booking_id}
                onTap={() => router.push({ pathname: '/room-bookings/[id]', params: { id: b.booking_id } })}
                onPay={() => handlePay(b)}
                onCancel={() => handleCancel(b)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BookingCard({ c, booking, paying, onTap, onPay, onCancel }: {
  c: ColorPalette;
  booking: RoomBooking;
  paying: boolean;
  onTap: () => void;
  onPay: () => void;
  onCancel: () => void;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  const meta = STATUS_META[booking.status];
  const canPay = booking.status === 'pending' && booking.payment_status === 'pending';
  const canCancel = (booking.status === 'pending' || booking.status === 'confirmed')
    && new Date(booking.check_in_date).getTime() > Date.now();

  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.97, transform: [{ scale: 0.998 }] }]}
    >
      <View style={s.cardHeader}>
        <View style={s.cardCover}>
          {booking.venue_cover ? (
            <Image source={{ uri: booking.venue_cover }} style={s.cardCoverImg} />
          ) : (
            <View style={[s.cardCoverImg, s.cardCoverPlaceholder]}>
              <Ionicons name="business-outline" size={20} color={c.neutral[400]} />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardVenue} numberOfLines={1}>{booking.venue_name}</Text>
          <Text style={s.cardRoom} numberOfLines={1}>{booking.room_name}</Text>
          <Text style={s.cardNumber}>{booking.booking_number}</Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: meta.color + '22', borderColor: meta.color + '55' }]}>
          <Ionicons name={meta.icon as any} size={12} color={meta.color} />
          <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={s.datesRow}>
        <View style={s.dateBlock}>
          <Text style={s.dateLabel}>Arrivée</Text>
          <Text style={s.dateValue}>{fmtDateShort(booking.check_in_date)}</Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={c.neutral[400]} />
        <View style={s.dateBlock}>
          <Text style={s.dateLabel}>Départ</Text>
          <Text style={s.dateValue}>{fmtDateShort(booking.check_out_date)}</Text>
        </View>
        <View style={s.dateBlock}>
          <Text style={s.dateLabel}>Durée</Text>
          <Text style={s.dateValue}>{booking.nights_count} n.</Text>
        </View>
      </View>

      <View style={s.cardFooter}>
        <View>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.totalAmt}>{formatXOF(booking.total_xof)}</Text>
        </View>
        <View style={s.cardActions}>
          {canPay && (
            <Pressable
              onPress={onPay}
              disabled={paying}
              style={({ pressed }) => [s.payBtn, pressed && { opacity: 0.9 }, paying && { opacity: 0.7 }]}
            >
              {paying ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="card" size={14} color="#fff" />
                  <Text style={s.payBtnText}>Payer</Text>
                </>
              )}
            </Pressable>
          )}
          {canCancel && !canPay && (
            <Pressable onPress={onCancel} hitSlop={6} style={s.cancelBtn}>
              <Text style={s.cancelBtnText}>Annuler</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: spacing['2xl'] },

    segments: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: c.light,
      borderBottomWidth: 1, borderBottomColor: c.neutral[200],
    },
    segment: {
      paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
      borderRadius: radius.full,
      backgroundColor: c.neutral[100],
    },
    segmentActive: { backgroundColor: c.primary[500] },
    segmentText: { fontSize: typography.fontSize.sm, color: c.neutral[600], fontWeight: '600' },
    segmentTextActive: { color: '#fff', fontWeight: '700' },

    empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing['2xl'] },
    emptyTitle: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg },
    emptyCta: {
      marginTop: spacing.lg,
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
      borderRadius: radius.full,
    },
    emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.sm },

    list: { padding: spacing.md, gap: spacing.md },
    card: {
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      padding: spacing.md,
      gap: spacing.md,
    },

    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    cardCover: { width: 48, height: 48, borderRadius: radius.md, overflow: 'hidden' },
    cardCoverImg: { width: '100%', height: '100%' },
    cardCoverPlaceholder: { backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },
    cardVenue: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    cardRoom: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    cardNumber: { fontSize: 10, color: c.neutral[500], fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },

    statusBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: spacing.sm, paddingVertical: 4,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    statusText: { fontSize: 10, fontWeight: '800' },

    datesRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
      backgroundColor: c.neutral[100],
      borderRadius: radius.md,
    },
    dateBlock: { alignItems: 'center', flex: 1 },
    dateLabel: { fontSize: 9, color: c.neutral[500], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    dateValue: { fontSize: typography.fontSize.sm, color: c.dark, fontWeight: '700', marginTop: 2 },

    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    totalLabel: { fontSize: 10, color: c.neutral[500], fontWeight: '700', textTransform: 'uppercase' },
    totalAmt: { fontSize: typography.fontSize.lg, fontWeight: '900', color: c.primary[600], fontVariant: ['tabular-nums'] },

    cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    payBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderRadius: radius.full,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
    },
    payBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.sm },
    cancelBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    cancelBtnText: { color: c.danger ?? '#ef4444', fontWeight: '700', fontSize: typography.fontSize.sm },
  });
}
