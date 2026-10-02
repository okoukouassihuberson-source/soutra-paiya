import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, Image, TextInput, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { radius, spacing, typography, seatsLeft, formatTripDates, formatXOF, type Trip, type TripItineraryDay, type TripPackage, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
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
  const { t, tn, intl, field, list } = useI18n();
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
    catch (e: any) { Alert.alert(t('detail.bookFail'), e?.message ?? t('detail.retry')); }
    finally { setBusy(false); }
  }, [trip, user, router, n, pkg, phone, code]);

  if (data === undefined) return <SafeAreaView style={s.safe}><ScreenHeader title={t('detail.tripTitle')} /><View style={s.center}><ActivityIndicator color={c.primary[500]} /></View></SafeAreaView>;
  if (!data || !trip) return <SafeAreaView style={s.safe}><ScreenHeader title={t('detail.tripTitle')} /><Text style={s.empty}>{t('detail.tripGone')}</Text></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={field(trip as any, 'title') ?? trip.title} subtitle={formatTripDates(trip.starts_on, trip.ends_on, intl)} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
        {trip.cover_url ? <Image source={{ uri: trip.cover_url }} style={s.cover} /> : null}
        <View style={s.section}>
          <Text style={s.kicker}>{[trip.city, trip.scope === 'national' ? t('trips.country') : trip.country].filter(Boolean).join(' · ')} · {tn('detail.daysCount', trip.duration_days)}</Text>
          {field(trip as any, 'summary') ? <Text style={s.body}>{field(trip as any, 'summary')}</Text> : null}
          {field(trip as any, 'description') ? <Text style={s.body}>{field(trip as any, 'description')}</Text> : null}
          <Text style={s.meta}>{left === 0 ? t('detail.full') : tn('detail.seatsLeft', left)}</Text>
          {trip.departure_point ? <Text style={s.meta}>{trip.departure_time ? t('detail.departureAt', { place: trip.departure_point, time: trip.departure_time.slice(0, 5) }) : t('detail.departure', { place: trip.departure_point })}</Text> : null}
        </View>

        {offers.length > 0 && (<><Text style={s.h2}>{t('detail.offers')}</Text>{offers.map((o) => <OfferCardMobile key={o.id} offer={o} />)}</>)}

        {list(trip as any, 'inclusions').length > 0 && <View style={s.section}><Text style={s.h3}>{t('detail.included')}</Text>{list(trip as any, 'inclusions').map((x) => <Text key={x} style={s.body}>✓ {x}</Text>)}</View>}
        {list(trip as any, 'exclusions').length > 0 && <View style={s.section}><Text style={s.h3}>{t('detail.excluded')}</Text>{list(trip as any, 'exclusions').map((x) => <Text key={x} style={s.body}>✗ {x}</Text>)}</View>}
        {data.days.length > 0 && (
          <View style={s.section}>
            <Text style={s.h3}>{t('detail.program')}</Text>
            {data.days.map((d) => (
              <View key={d.id} style={s.day}><Text style={s.dayNum}>{t('detail.day', { n: d.day_number })}</Text><Text style={s.h4}>{field(d as any, 'title') ?? d.title}</Text>{field(d as any, 'description') ? <Text style={s.body}>{field(d as any, 'description')}</Text> : null}</View>
            ))}
          </View>
        )}

        {left > 0 && !booking && (
          <View style={[s.section, s.form]}>
            <Text style={s.h3}>{t('detail.book')}</Text>
            {data.packages.map((p) => (
              <Pressable key={p.id} onPress={() => setPkg(p.id)} accessibilityRole="radio" accessibilityState={{ selected: pkg === p.id }} style={[s.pkg, pkg === p.id && s.pkgOn]}>
                <View style={{ flex: 1 }}><Text style={s.h4}>{field(p as any, 'name') ?? p.name}</Text><Text style={s.meta}>{list(p as any, 'includes').join(' + ')}</Text></View>
                <Text style={s.h4}>{formatXOF(p.price_xof)}</Text>
              </Pressable>
            ))}
            <Stepper label={t('detail.participants')} value={n} min={1} max={Math.min(50, left)} onChange={setN} />
            <View style={{ gap: 6 }}><Text style={s.label}>{t('detail.phone')}</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={s.input} /></View>
            <PromoBox applied={code} onApply={setCode} preview={preview} />
            <PriceBox preview={preview} fallback={unit * n} />
            <Pressable disabled={busy} onPress={reserve} accessibilityRole="button" style={[s.cta, busy && { opacity: 0.6 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>{user ? t('detail.book') : t('detail.bookLogin')}</Text>}
            </Pressable>
          </View>
        )}
        {left === 0 && !booking && <Text style={s.empty}>{t('trips.full')}</Text>}

        {booking && (
          <View style={[s.section, s.form]}>
            <Text style={s.h3}>{t('detail.bookingSaved', { ref: booking.reference })}</Text>
            <Text style={s.body}>{t('detail.total', { total: formatXOF(booking.total_xof) })}{booking.discount_xof ? t('detail.discountApplied', { amount: formatXOF(booking.discount_xof) }) : ''}{t('detail.payWithin24')}</Text>
            <BookingPay kind="trip" bookingId={booking.id} total={booking.total_xof} paid={0} depositPct={trip.deposit_pct} onDone={() => router.replace('/tourism-bookings')} />
            <Pressable onPress={() => router.replace('/tourism-bookings')}><Text style={s.link}>{t('detail.payLater')}</Text></Pressable>
          </View>
        )}

        {trip.contact_whatsapp ? <Pressable onPress={() => Linking.openURL(`https://wa.me/${trip.contact_whatsapp!.replace(/\D/g, '')}`)}><Text style={s.link}>{t('detail.whatsapp')}</Text></Pressable> : null}
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
