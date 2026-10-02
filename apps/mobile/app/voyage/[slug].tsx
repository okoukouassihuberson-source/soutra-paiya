import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, Image, TextInput, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { radius, spacing, typography, seatsLeft, formatTripDates, formatXOF, type Trip, type TripItineraryDay, type TripPackage, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { OfferCardMobile, PriceBox, PromoBox, Stepper, usePricePreview } from '@/components/tourism/TourismUi';
import { BookingPay } from '@/components/tourism/BookingPay';
import { createTripBooking, getTrip, listOffersForTarget, type BookingResult, type Offer } from '@/lib/tourism';

/** /voyage/[slug] — fiche voyage, offres, réservation avec code promo et paiement. */
export default function TripScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [data, setData] = useState<{ trip: Trip; days: TripItineraryDay[]; packages: TripPackage[] } | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [pkg, setPkg] = useState<string | null>(null);
  const [n, setN] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<BookingResult | null>(null);

  useEffect(() => {
    (async () => {
      const r = await getTrip(String(slug)).catch(() => null);
      setData(r);
      if (r) { setPkg(r.packages[0]?.id ?? null); listOffersForTarget('trip', r.trip.id).then(setOffers).catch(() => {}); }
    })();
  }, [slug]);

  const trip = data?.trip;
  const left = trip ? seatsLeft(trip) : 0;
  const preview = usePricePreview('trip', trip?.id ?? null, n, pkg, code);
  const unit = data?.packages.find((p) => p.id === pkg)?.price_xof ?? trip?.base_price_xof ?? 0;

  const reserve = useCallback(async () => {
    if (!trip) return;
    if (!user) { router.push('/(auth)/login'); return; }
    setBusy(true);
    try { setBooking(await createTripBooking({ tripId: trip.id, participants: n, packageId: pkg, phone, code })); }
    catch (e: any) { Alert.alert('Réservation impossible', e?.message ?? 'Réessayez.'); }
    finally { setBusy(false); }
  }, [trip, user, router, n, pkg, phone, code]);

  if (data === undefined) return <SafeAreaView style={s.safe}><ScreenHeader title="Voyage" /><View style={s.center}><ActivityIndicator color={c.primary[500]} /></View></SafeAreaView>;
  if (!data || !trip) return <SafeAreaView style={s.safe}><ScreenHeader title="Voyage" /><Text style={s.empty}>Ce voyage n’est plus disponible.</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={trip.title} subtitle={formatTripDates(trip.starts_on, trip.ends_on)} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
        {trip.cover_url ? <Image source={{ uri: trip.cover_url }} style={s.cover} /> : null}
        <View style={s.section}>
          <Text style={s.kicker}>{[trip.city, trip.scope === 'national' ? 'Côte d’Ivoire' : trip.country].filter(Boolean).join(' · ')} · {trip.duration_days} jour{trip.duration_days > 1 ? 's' : ''}</Text>
          {trip.summary ? <Text style={s.body}>{trip.summary}</Text> : null}
          {trip.description ? <Text style={s.body}>{trip.description}</Text> : null}
          <Text style={s.meta}>{left === 0 ? 'Complet' : `${left} place${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}`}</Text>
          {trip.departure_point ? <Text style={s.meta}>Départ : {trip.departure_point}{trip.departure_time ? ` à ${trip.departure_time.slice(0, 5)}` : ''}</Text> : null}
        </View>

        {offers.length > 0 && (<><Text style={s.h2}>🏷️ Offres disponibles</Text>{offers.map((o) => <OfferCardMobile key={o.id} offer={o} />)}</>)}

        {trip.inclusions.length > 0 && <View style={s.section}><Text style={s.h3}>Inclus</Text>{trip.inclusions.map((x) => <Text key={x} style={s.body}>✓ {x}</Text>)}</View>}
        {trip.exclusions.length > 0 && <View style={s.section}><Text style={s.h3}>Non inclus</Text>{trip.exclusions.map((x) => <Text key={x} style={s.body}>✗ {x}</Text>)}</View>}
        {data.days.length > 0 && (
          <View style={s.section}>
            <Text style={s.h3}>Programme</Text>
            {data.days.map((d) => (
              <View key={d.id} style={s.day}><Text style={s.dayNum}>Jour {d.day_number}</Text><Text style={s.h4}>{d.title}</Text>{d.description ? <Text style={s.body}>{d.description}</Text> : null}</View>
            ))}
          </View>
        )}

        {left > 0 && !booking && (
          <View style={[s.section, s.form]}>
            <Text style={s.h3}>Réserver</Text>
            {data.packages.map((p) => (
              <Pressable key={p.id} onPress={() => setPkg(p.id)} accessibilityRole="radio" accessibilityState={{ selected: pkg === p.id }} style={[s.pkg, pkg === p.id && s.pkgOn]}>
                <View style={{ flex: 1 }}><Text style={s.h4}>{p.name}</Text><Text style={s.meta}>{p.includes.join(' + ')}</Text></View>
                <Text style={s.h4}>{formatXOF(p.price_xof)}</Text>
              </Pressable>
            ))}
            <Stepper label="Participants" value={n} min={1} max={Math.min(50, left)} onChange={setN} />
            <View style={{ gap: 6 }}><Text style={s.label}>Téléphone (optionnel)</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} /></View>
            <PromoBox applied={code} onApply={setCode} preview={preview} />
            <PriceBox preview={preview} fallback={unit * n} />
            <Pressable disabled={busy} onPress={reserve} accessibilityRole="button" style={[s.cta, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{user ? 'Réserver' : 'Se connecter pour réserver'}</Text>}
            </Pressable>
          </View>
        )}
        {left === 0 && !booking && <Text style={s.empty}>Voyage complet</Text>}

        {booking && (
          <View style={[s.section, s.form]}>
            <Text style={s.h3}>Réservation {booking.reference} enregistrée</Text>
            <Text style={s.body}>Total : {formatXOF(booking.total_xof)}{booking.discount_xof ? ` (réduction de ${formatXOF(booking.discount_xof)} appliquée)` : ''}. Payez dans les 24 h pour garantir vos places.</Text>
            <BookingPay kind="trip" bookingId={booking.id} total={booking.total_xof} paid={0} depositPct={trip.deposit_pct} onDone={() => router.replace('/tourism-bookings')} />
            <Pressable onPress={() => router.replace('/tourism-bookings')}><Text style={s.link}>Payer plus tard</Text></Pressable>
          </View>
        )}

        {trip.contact_whatsapp ? <Pressable onPress={() => Linking.openURL(`https://wa.me/${trip.contact_whatsapp!.replace(/\D/g, '')}`)}><Text style={s.link}>Contacter l’organisateur sur WhatsApp</Text></Pressable> : null}
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
    h4: { fontSize: typography.fontSize.sm, fontWeight: '800', color: c.dark },
    day: { borderLeftWidth: 2, borderLeftColor: c.primary[200], paddingLeft: 12, gap: 2, marginTop: 6 },
    dayNum: { fontSize: 11, fontWeight: '800', color: c.primary[600], textTransform: 'uppercase' },
    pkg: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[300] },
    pkgOn: { borderColor: c.primary[500], backgroundColor: c.primary[50] },
    label: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    input: { borderWidth: 1, borderColor: c.neutral[300], borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, color: c.dark, backgroundColor: c.light },
    cta: { minHeight: 50, borderRadius: radius.md, backgroundColor: c.primary[500], alignItems: 'center', justifyContent: 'center' },
    ctaText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    link: { textAlign: 'center', color: c.primary[600], fontWeight: '700', padding: spacing.md, textDecorationLine: 'underline' },
  });
}
