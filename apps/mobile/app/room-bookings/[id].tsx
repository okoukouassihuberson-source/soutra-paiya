import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator,
  Image, Alert, Share,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * /room-bookings/[id] — détail d'une réservation chambre.
 *
 * Voucher complet : QR code (booking_number), dates, total, statut, contact.
 * Actions : Payer (si pending), Annuler, Partager, Itinéraire (futur).
 */

type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'refunded';

interface BookingDetail {
  id: string;
  booking_number: string;
  user_id: string;
  room_id: string;
  venue_id: string;
  check_in_date: string;
  check_out_date: string;
  nights_count: number;
  guests_count: number;
  unit_price_xof: number;
  total_xof: number;
  status: BookingStatus;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  payment_status: string;
  payment_provider: string | null;
  payment_ref: string | null;
  created_at: string;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  venue: { name: string; cover_url: string | null; address: string | null; phone: string | null } | null;
  room: { name: string; room_type: string | null; photos: string[] | null; amenities: string[] | null } | null;
}

const STATUS_META: Record<BookingStatus, { label: string; color: string; icon: string }> = {
  pending:      { label: 'En attente de paiement', color: '#f59e0b', icon: 'time-outline' },
  confirmed:    { label: 'Confirmée',              color: '#3b82f6', icon: 'checkmark-circle-outline' },
  checked_in:   { label: 'Check-in effectué',      color: '#10b981', icon: 'key-outline' },
  checked_out:  { label: 'Séjour terminé',         color: '#059669', icon: 'checkmark-done-outline' },
  cancelled:    { label: 'Annulée',                color: '#737373', icon: 'close-circle-outline' },
  refunded:     { label: 'Remboursée',             color: '#a855f7', icon: 'refresh-circle-outline' },
};

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function RoomBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!id || !user?.id) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from('room_bookings')
        .select(`
          id, booking_number, user_id, room_id, venue_id,
          check_in_date, check_out_date, nights_count, guests_count,
          unit_price_xof, total_xof, status,
          contact_name, contact_phone, notes,
          payment_status, payment_provider, payment_ref,
          created_at, confirmed_at, checked_in_at, checked_out_at, cancelled_at, cancellation_reason,
          venue:venues(name, cover_url, address, phone),
          room:rooms(name, room_type, photos, amenities)
        `)
        .eq('id', id)
        .maybeSingle();
      if (error || !data) {
        console.error('[room-booking-detail] load:', error);
        setBooking(null);
      } else {
        setBooking({ ...(data as any) });
      }
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Real-time sync sur ce booking précis
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`room-booking-${id}`)
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'room_bookings', filter: `id=eq.${id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { try { (supabase as any).removeChannel(channel); } catch { /* */ } };
  }, [id, load]);

  const handlePay = useCallback(async () => {
    if (!booking) return;
    setPaying(true);
    try {
      const { data, error } = await (supabase.functions as any).invoke(
        'paystack-pay-room-booking',
        { body: { booking_id: booking.id } },
      );
      if (error) throw error;
      const url = (data as any)?.authorization_url;
      if (!url) throw new Error('Lien de paiement indisponible');
      await WebBrowser.openBrowserAsync(url);
      void load();
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Paiement impossible');
    } finally {
      setPaying(false);
    }
  }, [booking, load]);

  const handleCancel = useCallback(async () => {
    if (!booking) return;
    Alert.alert(
      'Annuler la réservation',
      `Tu vas annuler ${booking.booking_number}. Cette action est définitive.`,
      [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Annuler', style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.rpc as any)('update_room_booking_status', {
                p_booking_id: booking.id,
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
  }, [booking, load]);

  const handleShare = useCallback(async () => {
    if (!booking) return;
    const checkIn = new Date(booking.check_in_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    try {
      await Share.share({
        message: `📍 Réservation ${booking.booking_number}\n${booking.room?.name || ''} chez ${booking.venue?.name || ''}\n🗓️ ${checkIn} (${booking.nights_count} nuit${booking.nights_count > 1 ? 's' : ''})\nTotal : ${formatXOF(booking.total_xof)}\n\nVia Soutra-Playce 🛏️`,
        title: 'Ma réservation',
      });
    } catch { /* user cancelled */ }
  }, [booking]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Réservation" />
        <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Réservation" />
        <View style={s.center}>
          <Ionicons name="alert-circle-outline" size={48} color={c.neutral[400]} />
          <Text style={s.errText}>Réservation introuvable</Text>
        </View>
      </SafeAreaView>
    );
  }

  const meta = STATUS_META[booking.status];
  const canPay = booking.status === 'pending' && booking.payment_status === 'pending';
  const canCancel = (booking.status === 'pending' || booking.status === 'confirmed')
    && new Date(booking.check_in_date).getTime() > Date.now();
  const showQR = booking.status === 'confirmed' || booking.status === 'checked_in';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={booking.booking_number} subtitle={booking.venue?.name ?? ''} />

      <ScrollView contentContainerStyle={s.scrollContent}>
        {/* Hero venue */}
        {booking.venue?.cover_url ? (
          <Image source={{ uri: booking.venue.cover_url }} style={s.hero} />
        ) : (
          <View style={[s.hero, s.heroPlaceholder]}>
            <Ionicons name="bed-outline" size={48} color={c.neutral[400]} />
          </View>
        )}

        <View style={s.body}>
          {/* Status banner */}
          <View style={[s.statusBanner, { backgroundColor: meta.color + '15', borderColor: meta.color + '55' }]}>
            <Ionicons name={meta.icon as any} size={22} color={meta.color} />
            <Text style={[s.statusBannerText, { color: meta.color }]}>{meta.label}</Text>
          </View>

          {/* QR voucher (visible quand confirmé/check-in) */}
          {showQR && (
            <View style={s.qrCard}>
              <Text style={s.qrTitle}>🎫 Voucher</Text>
              <Text style={s.qrSub}>Présente ce QR à l&apos;accueil de l&apos;hôtel</Text>
              <View style={s.qrWrap}>
                <QRCode
                  value={JSON.stringify({
                    t: 'soutra_booking',
                    id: booking.id,
                    n: booking.booking_number,
                  })}
                  size={180}
                  backgroundColor="#fff"
                  color={c.dark}
                />
              </View>
              <Text style={s.qrNumber}>{booking.booking_number}</Text>
            </View>
          )}

          {/* Venue + room */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Hébergement</Text>
            <View style={s.venueRow}>
              <View style={s.venueIcon}>
                <Ionicons name="business" size={20} color={c.primary[500]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.venueName}>{booking.venue?.name}</Text>
                <Text style={s.roomLabel}>
                  {booking.room?.room_type ? `${booking.room.room_type} · ` : ''}{booking.room?.name}
                </Text>
              </View>
            </View>
            {booking.venue?.address && (
              <View style={s.infoRow}>
                <Ionicons name="location-outline" size={16} color={c.neutral[500]} />
                <Text style={s.infoText}>{booking.venue.address}</Text>
              </View>
            )}
            {booking.venue?.phone && (
              <Pressable
                style={s.infoRow}
                onPress={() => { /* dialPhone helper si dispo */ }}
              >
                <Ionicons name="call-outline" size={16} color={c.neutral[500]} />
                <Text style={s.infoText}>{booking.venue.phone}</Text>
              </Pressable>
            )}
          </View>

          {/* Séjour */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Séjour</Text>
            <View style={s.stayBox}>
              <View style={s.stayCol}>
                <Text style={s.stayLabel}>Arrivée</Text>
                <Text style={s.stayDate}>{fmtDateFull(booking.check_in_date)}</Text>
                <Text style={s.stayHint}>à partir de 14h00</Text>
              </View>
              <View style={s.stayDivider} />
              <View style={s.stayCol}>
                <Text style={s.stayLabel}>Départ</Text>
                <Text style={s.stayDate}>{fmtDateFull(booking.check_out_date)}</Text>
                <Text style={s.stayHint}>avant 12h00</Text>
              </View>
            </View>
            <View style={s.stayMeta}>
              <View style={s.metaPill}>
                <Ionicons name="moon-outline" size={14} color={c.neutral[600]} />
                <Text style={s.metaText}>{booking.nights_count} nuit{booking.nights_count > 1 ? 's' : ''}</Text>
              </View>
              <View style={s.metaPill}>
                <Ionicons name="people-outline" size={14} color={c.neutral[600]} />
                <Text style={s.metaText}>{booking.guests_count} pers.</Text>
              </View>
            </View>
          </View>

          {/* Équipements */}
          {booking.room?.amenities && booking.room.amenities.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Équipements de la chambre</Text>
              <View style={s.amenityRow}>
                {booking.room.amenities.map((a) => (
                  <View key={a} style={s.amenityPill}>
                    <Text style={s.amenityText}>{a}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          {booking.notes && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Tes notes</Text>
              <Text style={s.noteText}>{booking.notes}</Text>
            </View>
          )}

          {/* Récap prix */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Récapitulatif</Text>
            <View style={s.priceCard}>
              <View style={s.priceRow}>
                <Text style={s.priceLine}>
                  {formatXOF(booking.unit_price_xof)} × {booking.nights_count} nuit{booking.nights_count > 1 ? 's' : ''}
                </Text>
                <Text style={s.priceLine}>{formatXOF(booking.total_xof)}</Text>
              </View>
              <View style={s.priceTotal}>
                <Text style={s.priceTotalLabel}>Total</Text>
                <Text style={s.priceTotalAmt}>{formatXOF(booking.total_xof)}</Text>
              </View>
              {booking.payment_status === 'paid' && booking.payment_ref && (
                <View style={s.paymentInfo}>
                  <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                  <Text style={s.paymentText}>Payé · Réf. {booking.payment_ref.slice(-12)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Cancellation */}
          {booking.cancellation_reason && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Motif d&apos;annulation</Text>
              <Text style={s.noteText}>{booking.cancellation_reason}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={s.actions}>
            {canPay && (
              <Pressable
                onPress={handlePay}
                disabled={paying}
                style={({ pressed }) => [s.primaryBtn, pressed && { opacity: 0.9 }, paying && { opacity: 0.7 }]}
              >
                {paying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="card" size={18} color="#fff" />
                    <Text style={s.primaryBtnText}>Payer · {formatXOF(booking.total_xof)}</Text>
                  </>
                )}
              </Pressable>
            )}
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [s.secondaryBtn, pressed && { opacity: 0.9 }]}
            >
              <Ionicons name="share-outline" size={18} color={c.primary[600]} />
              <Text style={s.secondaryBtnText}>Partager</Text>
            </Pressable>
            {canCancel && (
              <Pressable
                onPress={handleCancel}
                style={({ pressed }) => [s.dangerBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={s.dangerBtnText}>Annuler la réservation</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    errText: { fontSize: typography.fontSize.base, color: c.neutral[600], marginTop: spacing.sm },
    scrollContent: { paddingBottom: spacing['2xl'] },

    hero: { width: '100%', height: 160 },
    heroPlaceholder: { backgroundColor: c.neutral[100], alignItems: 'center', justifyContent: 'center' },

    body: { padding: spacing.md, gap: spacing.lg },

    statusBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      padding: spacing.md, borderRadius: radius.lg, borderWidth: 1,
    },
    statusBannerText: { fontSize: typography.fontSize.base, fontWeight: '800' },

    qrCard: {
      backgroundColor: '#fff',
      borderRadius: radius.xl,
      padding: spacing.lg,
      alignItems: 'center',
      borderWidth: 2, borderColor: c.primary[200],
      shadowColor: c.primary[500], shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5,
    },
    qrTitle: { fontSize: typography.fontSize.xl, fontWeight: '900', color: c.dark, marginBottom: 4 },
    qrSub: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginBottom: spacing.lg, textAlign: 'center' },
    qrWrap: { padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.lg },
    qrNumber: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark, marginTop: spacing.md, letterSpacing: 1 },

    section: { gap: spacing.sm },
    sectionTitle: { fontSize: 11, color: c.neutral[600], fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },

    venueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
    venueIcon: {
      width: 40, height: 40, borderRadius: radius.full,
      backgroundColor: c.primary[50],
      alignItems: 'center', justifyContent: 'center',
    },
    venueName: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.dark },
    roomLabel: { fontSize: typography.fontSize.sm, color: c.neutral[600] },

    infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
    infoText: { fontSize: typography.fontSize.sm, color: c.neutral[700], flex: 1 },

    stayBox: {
      flexDirection: 'row',
      backgroundColor: '#fff',
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      padding: spacing.md,
    },
    stayCol: { flex: 1, alignItems: 'center', gap: 4 },
    stayDivider: { width: 1, backgroundColor: c.neutral[200], marginHorizontal: spacing.sm },
    stayLabel: { fontSize: 10, color: c.neutral[500], fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
    stayDate: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, textAlign: 'center' },
    stayHint: { fontSize: 10, color: c.neutral[500] },
    stayMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, justifyContent: 'center' },
    metaPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: spacing.md, paddingVertical: 6,
      backgroundColor: c.neutral[100], borderRadius: radius.full,
    },
    metaText: { fontSize: typography.fontSize.xs, color: c.neutral[700], fontWeight: '600' },

    amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    amenityPill: { backgroundColor: c.neutral[100], paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
    amenityText: { fontSize: typography.fontSize.xs, color: c.neutral[700], fontWeight: '600' },

    noteText: { fontSize: typography.fontSize.sm, color: c.neutral[700], lineHeight: 20, padding: spacing.md, backgroundColor: c.neutral[100], borderRadius: radius.md },

    priceCard: { backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: c.neutral[200], padding: spacing.md },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
    priceLine: { fontSize: typography.fontSize.sm, color: c.neutral[700] },
    priceTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.neutral[200] },
    priceTotalLabel: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    priceTotalAmt: { fontSize: typography.fontSize.lg, fontWeight: '900', color: c.primary[600], fontVariant: ['tabular-nums'] },
    paymentInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
    paymentText: { fontSize: 11, color: '#10b981', fontWeight: '700' },

    actions: { gap: spacing.sm, marginTop: spacing.md },
    primaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500],
      paddingVertical: spacing.md + 2, borderRadius: radius.full,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    secondaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[50],
      paddingVertical: spacing.md, borderRadius: radius.full,
      borderWidth: 1, borderColor: c.primary[200],
    },
    secondaryBtnText: { color: c.primary[600], fontWeight: '700', fontSize: typography.fontSize.sm },
    dangerBtn: {
      paddingVertical: spacing.md, alignItems: 'center',
    },
    dangerBtnText: { color: c.danger ?? '#ef4444', fontWeight: '700', fontSize: typography.fontSize.sm },
  });
}
