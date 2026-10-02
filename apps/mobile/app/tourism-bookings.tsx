import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert, Image, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { radius, spacing, typography, formatXOF, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { BookingPay } from '@/components/tourism/BookingPay';
import { BOOKING_STATUS, QR_ACTIVITY_PREFIX, QR_TRIP_PREFIX, cancelBooking, listMyBookings, submitActivityReview, type MyBooking } from '@/lib/tourism';

/** /tourism-bookings — mes voyages et activités : paiement, billet QR, annulation. */
export default function TourismBookingsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [items, setItems] = useState<MyBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setItems([]); setLoading(false); setRefreshing(false); return; }
    setItems(await listMyBookings(user.id).catch(() => []));
    setLoading(false); setRefreshing(false);
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);

  const cancel = (b: MyBooking) => Alert.alert('Annuler la réservation ?', 'Les places seront libérées.', [
    { text: 'Non', style: 'cancel' },
    { text: 'Annuler la réservation', style: 'destructive', onPress: async () => { try { await cancelBooking(b.kind, b.id); load(); } catch (e: any) { Alert.alert('Annulation impossible', e?.message ?? 'Réessayez.'); } } },
  ]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Mes voyages et activités" subtitle={`${items.length} réservation${items.length > 1 ? 's' : ''}`} />
      {loading ? <View style={s.center}><ActivityIndicator color={c.primary[500]} /></View> : (
        <ScrollView contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: spacing['2xl'] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {items.length === 0 && (
            <View style={s.emptyWrap}>
              <Text style={s.empty}>Aucune réservation pour le moment.</Text>
              <Pressable onPress={() => router.push('/voyages')} style={s.cta}><Text style={s.ctaText}>Découvrir les voyages</Text></Pressable>
            </View>
          )}
          {items.map((b) => {
            const st = b.kind === 'trip' && b.status === 'confirmed' && b.paid_xof < b.total_xof
              ? { label: 'Acompte payé · solde à régler', color: '#f59e0b' }
              : BOOKING_STATUS[b.status] ?? { label: b.status, color: '#737373' };
            const expanded = open === `${b.kind}-${b.id}`;
            const expired = !!b.expires_at && b.status === 'pending' && b.paid_xof === 0 && new Date(b.expires_at).getTime() < Date.now();
            const ticket = (b.status === 'confirmed' || b.status === 'paid' || b.status === 'used') && b.qr_token;
            const canPay = !expired && (b.status === 'pending' || (b.kind === 'trip' && b.status === 'confirmed' && b.paid_xof < b.total_xof));
            return (
              <View key={`${b.kind}-${b.id}`} style={s.card}>
                <Pressable onPress={() => setOpen(expanded ? null : `${b.kind}-${b.id}`)} accessibilityRole="button" accessibilityState={{ expanded }} style={s.row}>
                  {b.cover_url ? <Image source={{ uri: b.cover_url }} style={s.thumb} /> : <View style={[s.thumb, { backgroundColor: c.neutral[100] }]} />}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.kicker}>{b.kind === 'trip' ? 'Voyage' : 'Activité'} · {b.reference}</Text>
                    <Text style={s.title} numberOfLines={2}>{b.title}</Text>
                    {b.when ? <Text style={s.meta}>{new Date(b.when).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Abidjan' })}</Text> : null}
                    <Text style={[s.status, { color: expired ? '#737373' : st.color }]}>{expired ? 'Expirée' : st.label}</Text>
                  </View>
                </Pressable>
                {expanded && (
                  <View style={s.detail}>
                    <Text style={s.meta}>{b.participants} participant{b.participants > 1 ? 's' : ''} · payé {formatXOF(b.paid_xof)} / {formatXOF(b.total_xof)}</Text>
                    {b.discount_xof > 0 && <Text style={[s.meta, { color: '#059669' }]}>Réduction appliquée : −{formatXOF(b.discount_xof)}</Text>}
                    {ticket ? (
                      <View style={s.qr}>
                        <QRCode value={`${b.kind === 'trip' ? QR_TRIP_PREFIX : QR_ACTIVITY_PREFIX}${b.qr_token}`} size={200} />
                        <Text style={s.meta}>Présentez ce code à l’organisateur.</Text>
                      </View>
                    ) : null}
                    {b.kind === 'activity' && !b.reviewed && (b.status === 'used' || (b.status === 'paid' && !!b.when && new Date(b.when) < new Date())) && (
                      <ReviewBox c={c} onSend={async (rating, comment) => { try { await submitActivityReview(b.id, rating, comment); load(); } catch (e: any) { Alert.alert('Avis', e?.message ?? 'Réessayez.'); } }} />
                    )}
                    {b.kind === 'activity' && b.reviewed && <Text style={[s.meta, { color: '#059669' }]}>Merci pour votre avis !</Text>}
                    {canPay && <BookingPay kind={b.kind} bookingId={b.id} total={b.total_xof} paid={b.paid_xof} depositPct={b.deposit_pct} onDone={load} />}
                    {b.status === 'pending' && b.paid_xof === 0 && !expired && (
                      <Pressable onPress={() => cancel(b)}><Text style={s.cancel}>Annuler la réservation</Text></Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.neutral[50] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    emptyWrap: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
    empty: { textAlign: 'center', color: c.neutral[600], fontWeight: '700' },
    cta: { paddingHorizontal: 20, minHeight: 46, borderRadius: radius.md, backgroundColor: c.primary[500], alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: '#fff', fontWeight: '800' },
    card: { marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, backgroundColor: c.light, borderWidth: 1, borderColor: c.neutral[200], overflow: 'hidden' },
    row: { flexDirection: 'row', gap: 12, padding: spacing.md },
    thumb: { width: 72, height: 72, borderRadius: radius.md },
    kicker: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: c.neutral[500] },
    title: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    meta: { fontSize: typography.fontSize.sm, color: c.neutral[600] },
    status: { fontSize: 12, fontWeight: '800' },
    detail: { padding: spacing.md, gap: spacing.md, borderTopWidth: 1, borderTopColor: c.neutral[200] },
    qr: { alignItems: 'center', gap: 8, padding: spacing.md, backgroundColor: '#fff', borderRadius: radius.md },
    cancel: { textAlign: 'center', color: c.neutral[500], textDecorationLine: 'underline', fontWeight: '600' },
  });
}

/** Note de 1 à 5 + commentaire (activité vécue). */
function ReviewBox({ c, onSend }: { c: ColorPalette; onSend: (rating: number, comment: string) => Promise<void> }) {
  const s = useMemo(() => makeStyles(c), [c]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.title}>Votre avis</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${n} étoile${n > 1 ? 's' : ''}`} accessibilityState={{ selected: rating === n }}>
            <Text style={{ fontSize: 30, color: n <= rating ? '#d97706' : c.neutral[300] }}>★</Text>
          </Pressable>
        ))}
      </View>
      <TextInput value={comment} onChangeText={setComment} multiline maxLength={1000} placeholder="Racontez votre expérience (optionnel)" placeholderTextColor={c.neutral[400]}
                 style={{ borderWidth: 1, borderColor: c.neutral[300], borderRadius: radius.md, padding: 10, minHeight: 70, color: c.dark, backgroundColor: c.light, textAlignVertical: 'top' }} />
      <Pressable disabled={busy || rating === 0} onPress={async () => { setBusy(true); await onSend(rating, comment); setBusy(false); }} accessibilityRole="button"
                 style={[s.cta, (busy || rating === 0) && { opacity: 0.5 }]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Publier mon avis</Text>}
      </Pressable>
    </View>
  );
}
