import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, Image, TextInput, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { radius, spacing, typography, formatDuration, formatSlot, formatXOF, activityCategoryLabel, type Activity, type ActivitySlot, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { OfferCardMobile, PriceBox, PromoBox, Stepper, usePricePreview } from '@/components/tourism/TourismUi';
import { BookingPay } from '@/components/tourism/BookingPay';
import { createActivityBooking, getActivity, listOffersForTarget, type ActivityReview, type BookingResult, type Offer } from '@/lib/tourism';

/** /activite/[slug] — fiche activité, créneaux, offres, réservation avec code promo et paiement. */
export default function ActivityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [data, setData] = useState<{ activity: Activity; slots: ActivitySlot[]; reviews: ActivityReview[] } | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [n, setN] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<BookingResult | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getActivity(String(slug)).catch(() => null);
      setData(r);
      if (r) { setSlotId(r.slots[0]?.id ?? null); listOffersForTarget('activity', r.activity.id).then(setOffers).catch(() => {}); }
    })();
  }, [slug]);

  const a = data?.activity;
  const slot = data?.slots.find((x) => x.id === slotId);
  const maxN = a && slot ? Math.max(1, Math.min(a.max_group_size, slot.capacity - slot.booked)) : 1;
  const preview = usePricePreview('activity', slotId, n, null, code);
  const unit = slot?.price_xof ?? a?.price_xof ?? 0;

  const reserve = useCallback(async () => {
    if (!slotId) return;
    if (!user) { router.push('/(auth)/login'); return; }
    setBusy(true);
    try { setBooking(await createActivityBooking({ slotId, participants: n, phone, code })); }
    catch (e: any) { Alert.alert('Réservation impossible', e?.message ?? 'Réessayez.'); }
    finally { setBusy(false); }
  }, [slotId, user, router, n, phone, code]);

  if (data === undefined) return <SafeAreaView style={s.safe}><ScreenHeader title="Activité" /><View style={s.center}><ActivityIndicator color={c.primary[500]} /></View></SafeAreaView>;
  if (!data || !a) return <SafeAreaView style={s.safe}><ScreenHeader title="Activité" /><Text style={s.empty}>Cette activité n’est plus disponible.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={a.title} subtitle={`${activityCategoryLabel(a.category)} · ${formatDuration(a.duration_minutes)}`} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
        {a.cover_url ? <Image source={{ uri: a.cover_url }} style={s.cover} /> : null}
        <View style={s.section}>
          <Text style={s.kicker}>{[a.city, a.address].filter(Boolean).join(' · ')}</Text>
          {a.summary ? <Text style={s.body}>{a.summary}</Text> : null}
          {a.description ? <Text style={s.body}>{a.description}</Text> : null}
          {a.min_age > 0 ? <Text style={s.meta}>Âge minimum : {a.min_age} ans</Text> : null}
          {a.rating_count > 0 ? <Text style={s.meta}>★ {Number(a.rating_avg).toFixed(1)} sur 5 ({a.rating_count} avis)</Text> : null}
        </View>

        {offers.length > 0 && (<><Text style={s.h2}>🏷️ Offres disponibles</Text>{offers.map((o) => <OfferCardMobile key={o.id} offer={o} />)}</>)}

        <View style={s.section}>
          <Text style={s.h3}>Avis{a.rating_count > 0 ? ` · ★ ${Number(a.rating_avg).toFixed(1)} (${a.rating_count})` : ''}</Text>
          {data.reviews.length === 0 ? <Text style={s.meta}>Pas encore d’avis. Les avis sont déposés par les voyageurs ayant réalisé l’activité.</Text> : data.reviews.map((r) => (
            <View key={r.id} style={s.review}>
              <Text style={s.reviewHead}>{r.author || 'Voyageur'} <Text style={{ color: '#d97706' }} accessibilityLabel={`${r.rating} sur 5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text></Text>
              {r.comment ? <Text style={s.body}>{r.comment}</Text> : null}
            </View>
          ))}
        </View>

        {a.includes.length > 0 && <View style={s.section}><Text style={s.h3}>Inclus</Text>{a.includes.map((x) => <Text key={x} style={s.body}>✓ {x}</Text>)}</View>}

        {!booking && (data.slots.length === 0 ? <Text style={s.empty}>Aucun créneau disponible pour le moment.</Text> : (
          <View style={[s.section, s.form]}>
            <Text style={s.h3}>Choisissez un créneau</Text>
            <View style={s.slots}>
              {data.slots.map((x) => (
                <Pressable key={x.id} onPress={() => { setSlotId(x.id); setN(1); }} accessibilityRole="radio" accessibilityState={{ selected: slotId === x.id }} style={[s.slot, slotId === x.id && s.slotOn]}>
                  <Text style={[s.slotText, slotId === x.id && { color: '#fff' }]}>{formatSlot(x.starts_at)}</Text>
                  <Text style={[s.slotSub, slotId === x.id && { color: '#fff' }]}>{x.capacity - x.booked} pl.</Text>
                </Pressable>
              ))}
            </View>
            <Stepper label="Participants" value={n} min={1} max={maxN} onChange={setN} />
            <View style={{ gap: 6 }}><Text style={s.label}>Téléphone (optionnel)</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} /></View>
            <PromoBox applied={code} onApply={setCode} preview={preview} />
            <PriceBox preview={preview} fallback={unit * n} />
            <Pressable disabled={busy || !slotId} onPress={reserve} accessibilityRole="button" style={[s.cta, (busy || !slotId) && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{user ? 'Réserver' : 'Se connecter pour réserver'}</Text>}
            </Pressable>
          </View>
        ))}

        {booking && (
          <View style={[s.section, s.form]}>
            <Text style={s.h3}>Réservation {booking.reference} enregistrée</Text>
            <Text style={s.body}>Total : {formatXOF(booking.total_xof)}{booking.discount_xof ? ` (réduction de ${formatXOF(booking.discount_xof)} appliquée)` : ''}. Payez dans l’heure pour garantir vos places.</Text>
            <BookingPay kind="activity" bookingId={booking.id} total={booking.total_xof} paid={0} depositPct={100} onDone={() => router.replace('/tourism-bookings')} />
            <Pressable onPress={() => router.replace('/tourism-bookings')}><Text style={s.link}>Payer plus tard</Text></Pressable>
          </View>
        )}

        {a.contact_whatsapp ? <Pressable onPress={() => Linking.openURL(`https://wa.me/${a.contact_whatsapp!.replace(/\D/g, '')}`)}><Text style={s.link}>Contacter l’organisateur sur WhatsApp</Text></Pressable> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.neutral[50] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    empty: { textAlign: 'center', color: c.neutral[600], padding: spacing.xl, fontWeight: '700' },
    cover: { width: '100%', height: 220, backgroundColor: c.neutral[100] },
    section: { padding: spacing.md, gap: 6 },
    form: { margin: spacing.md, borderRadius: radius.lg, backgroundColor: c.light, borderWidth: 1, borderColor: c.neutral[200], gap: spacing.md },
    kicker: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: c.neutral[500] },
    body: { fontSize: typography.fontSize.sm, color: c.neutral[700], lineHeight: 20 },
    meta: { fontSize: typography.fontSize.sm, color: c.neutral[600] },
    h2: { fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark, marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.sm },
    h3: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark },
    review: { padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[200], backgroundColor: c.light, gap: 4 },
    reviewHead: { fontSize: 13, fontWeight: '800', color: c.dark },
    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slot: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[300] },
    slotOn: { backgroundColor: c.primary[500], borderColor: c.primary[500] },
    slotText: { fontSize: 13, fontWeight: '700', color: c.dark, textTransform: 'capitalize' },
    slotSub: { fontSize: 11, color: c.neutral[500] },
    label: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    input: { borderWidth: 1, borderColor: c.neutral[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: c.dark, backgroundColor: c.light },
    cta: { minHeight: 50, borderRadius: radius.md, backgroundColor: c.primary[500], alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    link: { textAlign: 'center', color: c.primary[600], fontWeight: '700', padding: spacing.md, textDecorationLine: 'underline' },
  });
}
