import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, Image, Modal, Alert,
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
 * /hotel-bookings — mes réservations hôtel mobile.
 * Pattern miroir de /orders mais pour room_bookings :
 *   - List via RPC list_my_room_bookings (RLS = self)
 *   - Modal détail avec timeline workflow
 *   - CTA "Payer maintenant" → Edge Function paystack-pay-booking
 *   - Annulation possible si status in (pending, confirmed)
 */

type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'refunded';
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

interface Booking {
  booking_id: string;
  booking_number: string;
  venue_id: string;
  venue_name: string;
  venue_cover: string | null;
  room_id: string;
  room_name: string;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  total_xof: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  created_at: string;
}

const STATUS_META: Record<BookingStatus, { label: string; color: string; icon: string }> = {
  pending:     { label: 'En attente paiement', color: '#f59e0b', icon: 'time-outline' },
  confirmed:   { label: 'Confirmée',           color: '#3b82f6', icon: 'checkmark-circle-outline' },
  checked_in:  { label: 'Arrivé',              color: '#6366f1', icon: 'log-in-outline' },
  checked_out: { label: 'Séjour terminé',      color: '#059669', icon: 'checkmark-done-outline' },
  cancelled:   { label: 'Annulée',             color: '#737373', icon: 'close-circle-outline' },
  refunded:    { label: 'Remboursée',          color: '#a855f7', icon: 'refresh-circle-outline' },
};

export default function HotelBookingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setBookings([]); setLoading(false); setRefreshing(false); return; }
    try {
      const { data, error } = await (supabase.rpc as any)('list_my_room_bookings', { p_limit: 100 });
      if (error) {
        console.error('[hotel-bookings] load:', error);
        setBookings([]);
      } else {
        setBookings((data as Booking[]) ?? []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Mes réservations" />
        <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Mes réservations"
        subtitle={`${bookings.length} réservation${bookings.length > 1 ? 's' : ''}`}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {bookings.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="bed-outline" size={56} color={c.neutral[400]} />
            <Text style={s.emptyTitle}>Aucune réservation pour l&apos;instant</Text>
            <Text style={s.emptyBody}>
              Explore les hôtels et réserve ta première chambre.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/explore')} style={s.cta}>
              <Ionicons name="compass" size={18} color="#fff" />
              <Text style={s.ctaText}>Explorer</Text>
            </Pressable>
          </View>
        ) : (
          bookings.map((b) => (
            <BookingCard key={b.booking_id} c={c} booking={b} onPress={() => setSelected(b)} />
          ))
        )}
      </ScrollView>

      <BookingDetailModal booking={selected} onClose={() => setSelected(null)} onChanged={load} />
    </SafeAreaView>
  );
}

/* ─────────────────────────────────────────────────── *
 *  BOOKING CARD                                       *
 * ─────────────────────────────────────────────────── */

function BookingCard({ c, booking, onPress }: { c: ColorPalette; booking: Booking; onPress: () => void }) {
  const s = useMemo(() => makeStyles(c), [c]);
  const meta = STATUS_META[booking.status];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
    >
      <View style={s.cardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.cardNumber}>{booking.booking_number}</Text>
          <Text style={s.cardVenue} numberOfLines={1}>{booking.venue_name}</Text>
          <Text style={s.cardRoom} numberOfLines={1}>{booking.room_name}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: meta.color + '20' }]}>
          <Ionicons name={meta.icon as any} size={12} color={meta.color} />
          <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <View style={s.cardFooter}>
        <Text style={s.cardMeta}>
          {formatDateRange(booking.check_in_date, booking.check_out_date)} · {booking.nights_count} nuit{booking.nights_count > 1 ? 's' : ''}
        </Text>
        <Text style={s.cardTotal}>{formatXOF(booking.total_xof)}</Text>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────── *
 *  BOOKING DETAIL MODAL                               *
 * ─────────────────────────────────────────────────── */

function BookingDetailModal({
  booking, onClose, onChanged,
}: { booking: Booking | null; onClose: () => void; onChanged: () => void }) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handlePay = useCallback(async () => {
    if (!booking) return;
    setPaying(true);
    try {
      const { data, error } = await (supabase.functions as any).invoke('paystack-pay-booking', {
        body: { booking_id: booking.booking_id },
      });
      if (error) {
        Alert.alert('Erreur', error.message || 'Impossible de démarrer le paiement');
        return;
      }
      const url = (data as any)?.authorization_url;
      if (!url) {
        Alert.alert('Erreur', 'Réponse Paystack invalide');
        return;
      }
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: '#FF6B1A',
        toolbarColor: '#0E1116',
      });
      // Au retour, on rafraîchit pour récupérer le nouveau statut
      onChanged();
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setPaying(false);
    }
  }, [booking, onChanged]);

  const handleCancel = useCallback(async () => {
    if (!booking) return;
    Alert.alert(
      'Annuler la réservation',
      'Cette action est définitive. Continuer ?',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            const { error } = await (supabase.rpc as any)('update_room_booking_status', {
              p_booking_id: booking.booking_id,
              p_status: 'cancelled',
              p_reason: 'Annulée par le client',
            });
            setCancelling(false);
            if (error) {
              Alert.alert('Erreur', error.message || 'Annulation impossible');
              return;
            }
            onClose();
            onChanged();
          },
        },
      ],
    );
  }, [booking, onClose, onChanged]);

  if (!booking) return null;
  const meta = STATUS_META[booking.status];
  const canPay = booking.status === 'pending' && booking.payment_status === 'pending';
  const canCancel = booking.status === 'pending' || booking.status === 'confirmed';

  const steps: { label: string; date: string | null; done: boolean }[] = [
    { label: 'Réservation créée', date: booking.created_at, done: true },
    {
      label: 'Paiement confirmé',
      date: null,
      done: booking.payment_status === 'paid'
        || ['confirmed', 'checked_in', 'checked_out'].includes(booking.status),
    },
    { label: 'Arrivée (check-in)', date: null, done: ['checked_in', 'checked_out'].includes(booking.status) },
    { label: 'Séjour terminé',     date: null, done: booking.status === 'checked_out' },
  ];
  if (booking.status === 'cancelled') {
    steps.push({ label: 'Annulée', date: null, done: true });
  }

  return (
    <Modal visible={!!booking} onRequestClose={onClose} animationType="slide" transparent>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={s.modalNumber}>{booking.booking_number}</Text>
            <View style={[s.statusPill, { backgroundColor: meta.color + '20', alignSelf: 'flex-start', marginTop: spacing.xs }]}>
              <Ionicons name={meta.icon as any} size={14} color={meta.color} />
              <Text style={[s.statusText, { color: meta.color, fontSize: typography.fontSize.sm }]}>{meta.label}</Text>
            </View>

            <View style={s.modalVenue}>
              {booking.venue_cover ? (
                <Image source={{ uri: booking.venue_cover }} style={s.modalVenueImg} />
              ) : (
                <View style={[s.modalVenueImg, { backgroundColor: c.neutral[200] }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.modalVenueName}>{booking.venue_name}</Text>
                <Text style={s.modalRoomName}>{booking.room_name}</Text>
              </View>
            </View>

            {/* Détails séjour */}
            <Text style={s.sectionTitle}>Séjour</Text>
            <Row label="Check-in" value={formatDateLongFR(booking.check_in_date)} />
            <Row label="Check-out" value={formatDateLongFR(booking.check_out_date)} />
            <Row label="Durée" value={`${booking.nights_count} nuit${booking.nights_count > 1 ? 's' : ''}`} />
            <Row label="Invités" value={`${booking.guests_count}`} />
            <Row label="Total" value={formatXOF(booking.total_xof)} bold />

            {/* Timeline */}
            <Text style={s.sectionTitle}>Suivi</Text>
            <View style={s.timeline}>
              {steps.map((step, i) => (
                <View key={i} style={s.tlStep}>
                  <View style={[s.tlDot, step.done && s.tlDotDone]}>
                    {step.done && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tlLabel, step.done && s.tlLabelDone]}>{step.label}</Text>
                    {step.date && (
                      <Text style={s.tlDate}>
                        {new Date(step.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* CTA Payer si réservation non payée */}
            {canPay && (
              <Pressable
                onPress={handlePay}
                disabled={paying}
                style={({ pressed }) => [
                  s.payBtn,
                  paying && { opacity: 0.6 },
                  pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Ionicons name="card" size={20} color="#fff" />
                <Text style={s.payBtnText}>
                  {paying ? 'Démarrage Paystack…' : `Payer maintenant · ${formatXOF(booking.total_xof)}`}
                </Text>
              </Pressable>
            )}

            {canCancel && (
              <Pressable
                onPress={handleCancel}
                disabled={cancelling}
                style={({ pressed }) => [s.cancelBookBtn, (cancelling || pressed) && { opacity: 0.7 }]}
              >
                <Text style={s.cancelBookBtnText}>
                  {cancelling ? 'Annulation…' : 'Annuler la réservation'}
                </Text>
              </Pressable>
            )}

            <Pressable onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>Fermer</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: bold ? c.dark : c.neutral[600], fontWeight: bold ? '800' : '500', fontSize: typography.fontSize.sm }}>
        {label}
      </Text>
      <Text style={{ color: bold ? c.dark : c.neutral[700], fontWeight: bold ? '800' : '600', fontSize: typography.fontSize.sm, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

function formatDateRange(checkIn: string, checkOut: string): string {
  const ci = new Date(checkIn);
  const co = new Date(checkOut);
  const fmt: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  return `${ci.toLocaleDateString('fr-FR', fmt)} → ${co.toLocaleDateString('fr-FR', fmt)}`;
}
function formatDateLongFR(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm, marginTop: spacing['2xl'] },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark, marginTop: spacing.sm },
    emptyBody: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center', paddingHorizontal: spacing.lg },
    cta: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
      borderRadius: radius.full, marginTop: spacing.md,
    },
    ctaText: { color: '#fff', fontWeight: '700' },

    card: {
      backgroundColor: '#fff', borderRadius: radius.lg,
      marginHorizontal: spacing.md, marginTop: spacing.md,
      padding: spacing.md,
      borderWidth: 1, borderColor: c.neutral[200],
    },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardNumber: { fontFamily: 'monospace', fontSize: typography.fontSize.xs, color: c.neutral[600], fontWeight: '700' },
    cardVenue: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark, marginTop: 2 },
    cardRoom: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2 },
    cardFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: spacing.sm, paddingTop: spacing.sm,
      borderTopWidth: 1, borderTopColor: c.neutral[100],
    },
    cardMeta: { fontSize: typography.fontSize.xs, color: c.neutral[500], flex: 1 },
    cardTotal: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark, fontVariant: ['tabular-nums'] },

    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
    statusText: { fontSize: 11, fontWeight: '700' },

    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: c.light, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', paddingTop: spacing.sm },
    modalHandle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: c.neutral[300], marginBottom: spacing.sm },
    modalContent: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
    modalNumber: { fontFamily: 'monospace', fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },

    modalVenue: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },
    modalVenueImg: { width: 48, height: 48, borderRadius: radius.md },
    modalVenueName: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    modalRoomName: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2 },

    sectionTitle: {
      fontSize: 11, color: c.neutral[600], fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 0.8,
      marginTop: spacing.lg, marginBottom: spacing.xs,
    },

    timeline: { marginTop: spacing.xs },
    tlStep: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 6 },
    tlDot: {
      width: 20, height: 20, borderRadius: 10,
      borderWidth: 2, borderColor: c.neutral[300],
      backgroundColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
    },
    tlDotDone: { backgroundColor: c.success[600], borderColor: c.success[600] },
    tlLabel: { fontSize: typography.fontSize.sm, color: c.neutral[500], fontWeight: '600' },
    tlLabelDone: { color: c.dark, fontWeight: '700' },
    tlDate: { fontSize: 11, color: c.neutral[500], marginTop: 2 },

    payBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md + 2, borderRadius: radius.full,
      marginTop: spacing.xl,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    payBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base, fontVariant: ['tabular-nums'] },

    cancelBookBtn: {
      marginTop: spacing.sm,
      paddingVertical: spacing.md, borderRadius: radius.full,
      alignItems: 'center',
      borderWidth: 1, borderColor: c.neutral[300],
    },
    cancelBookBtnText: { color: c.danger ?? '#ef4444', fontWeight: '700' },

    closeBtn: { marginTop: spacing.sm, paddingVertical: spacing.sm, alignItems: 'center' },
    closeBtnText: { color: c.neutral[600], fontWeight: '600' },
  });
}
