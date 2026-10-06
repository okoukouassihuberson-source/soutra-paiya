import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Switch, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CONTINENTS, spacing, typography, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { useI18n, type TKey } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Banner, Btn, Chips, DateField, Field, ImageField } from '@/components/organizer/OrgUi';
import { EMPTY_TRIP, loadTripForm, orgError, saveTrip, type TripFormValues } from '@/lib/organizer';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** /organizer-trip[?id=…] — création / modification d'un brouillon de voyage (la publication reste validée par l'équipe). */
export default function OrganizerTripScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const { t } = useI18n();
  const s = useMemo(() => makeStyles(c), [c]);
  const [v, setV] = useState<TripFormValues>(EMPTY_TRIP);
  const [pkgs, setPkgs] = useState<{ id: string; name: string }[]>([]);
  const [i18n, setI18n] = useState<any>({});
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof TripFormValues>(k: K) => (val: TripFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const intl = v.scope === 'international';

  useEffect(() => {
    if (!id) return;
    loadTripForm(id).then((r) => {
      if (!r) setErr(t('org.tripForm.notFound')); else { setV(r.values); setPkgs(r.existingPackages); setI18n(r.i18n); }
      setLoading(false);
    }).catch(() => { setErr(t('org.tripForm.notFound')); setLoading(false); });
  }, [id, t]);

  function validate(): string | null {
    const f = 'org.tripForm.';
    if (v.title.trim().length < 2) return t(`${f}vTitle` as TKey);
    if (!v.starts_on || !v.ends_on || v.ends_on < v.starts_on) return t(`${f}vDates` as TKey);
    if (!(Number(v.base_price_xof) >= 0) || v.base_price_xof === '') return t(`${f}vPrice` as TKey);
    if (!(Number(v.seats_total) >= 1)) return t(`${f}vSeats` as TKey);
    const dep = Number(v.deposit_pct || 100);
    if (!(dep >= 10 && dep <= 100)) return t(`${f}vDeposit` as TKey);
    if (intl && (!v.country.trim() || !/^[A-Za-z]{2}$/.test(v.country_code.trim()) || !v.continent)) return t(`${f}vCountry` as TKey);
    if ((v.departure_time && !TIME_RE.test(v.departure_time)) || (v.return_time && !TIME_RE.test(v.return_time))) return t(`${f}vTime` as TKey);
    return null;
  }

  async function save() {
    if (!user?.id) return;
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    try {
      await saveTrip(user.id, v, id, pkgs, i18n);
      router.back();
    } catch (e: any) { setErr(orgError(e?.message)); } finally { setBusy(false); }
  }

  if (loading) return <SafeAreaView style={s.safe} edges={['top']}><ScreenHeader title={t('org.tripForm.titleEdit')} /><View style={s.center}><ActivityIndicator color={c.primary[500]} /></View></SafeAreaView>;
  const L = (k: string) => t(`org.tripForm.${k}` as TKey);
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={id ? L('titleEdit') : L('titleNew')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
          <Chips disabled={!!id} value={v.scope} onChange={(x) => set('scope')(x)} options={[{ value: 'national', label: L('national') }, { value: 'international', label: L('international') }]} />
          <View style={s.switchRow}><Text style={s.switchLabel}>{L('circuit')}</Text><Switch value={v.is_circuit} onValueChange={set('is_circuit')} trackColor={{ true: c.primary[500], false: c.neutral[300] }} /></View>

          <Field label={L('name')} value={v.title} onChange={set('title')} maxLength={200} />
          <Field label={L('summary')} value={v.summary} onChange={set('summary')} maxLength={500} />
          <Field label={L('city')} value={v.city} onChange={set('city')} />
          {user?.id && <ImageField label={L('cover')} userId={user.id} urls={v.cover_url ? [v.cover_url] : []} onChange={(u) => set('cover_url')(u[0] ?? '')} />}
          {intl && (<>
            <Field label={L('country')} value={v.country} onChange={set('country')} />
            <Field label={L('countryCode')} value={v.country_code} onChange={(x) => set('country_code')(x.slice(0, 2))} />
            <Text style={s.label}>{L('continent')}</Text>
            <View style={{ marginBottom: spacing.md }}><Chips value={v.continent} onChange={set('continent')} options={CONTINENTS.map((k) => ({ value: k.value, label: t(`org.continents.${k.value}` as TKey) }))} /></View>
          </>)}
          <DateField label={L('startsOn')} value={v.starts_on} onChange={set('starts_on')} />
          <DateField label={L('endsOn')} value={v.ends_on} onChange={set('ends_on')} />
          <Field label={L('price')} value={v.base_price_xof} onChange={(x) => set('base_price_xof')(x.replace(/\D/g, ''))} keyboard="number-pad" />
          <Field label={L('seats')} value={v.seats_total} onChange={(x) => set('seats_total')(x.replace(/\D/g, ''))} keyboard="number-pad" />
          <Field label={L('deposit')} value={v.deposit_pct} onChange={(x) => set('deposit_pct')(x.replace(/\D/g, ''))} keyboard="number-pad" />
          <Field label={L('departurePoint')} value={v.departure_point} onChange={set('departure_point')} />
          <Field label={L('departureTime')} value={v.departure_time} onChange={set('departure_time')} placeholder="07:30" keyboard="numbers-and-punctuation" maxLength={5} />
          <Field label={L('returnTime')} value={v.return_time} onChange={set('return_time')} placeholder="19:00" keyboard="numbers-and-punctuation" maxLength={5} />
          <Field label={L('transport')} value={v.transport} onChange={set('transport')} />
          <Field label={L('lodging')} value={v.lodging} onChange={set('lodging')} />
          <Field label={L('meals')} value={v.meals} onChange={set('meals')} />
          {intl && (<>
            <Field label={L('flight')} value={v.flight_info} onChange={set('flight_info')} />
            <Field label={L('hotel')} value={v.hotel_info} onChange={set('hotel_info')} />
            <Field label={L('visa')} value={v.visa_info} onChange={set('visa_info')} />
            <Field label={L('insurance')} value={v.insurance_info} onChange={set('insurance_info')} />
          </>)}
          <Field label={L('description')} value={v.description} onChange={set('description')} multiline />
          <Field label={L('activities')} value={v.activities} onChange={set('activities')} multiline />
          <Field label={L('inclusions')} value={v.inclusions} onChange={set('inclusions')} multiline />
          <Field label={L('exclusions')} value={v.exclusions} onChange={set('exclusions')} multiline />
          <Field label={L('conditions')} value={v.conditions} onChange={set('conditions')} multiline />
          <Field label={L('days')} value={v.days} onChange={set('days')} multiline placeholder={L('daysPh')} />
          <Field label={L('packages')} value={v.packages} onChange={set('packages')} multiline placeholder={L('packagesPh')} />
          <Field label={L('phone')} value={v.contact_phone} onChange={set('contact_phone')} keyboard="phone-pad" />
          <Field label={L('whatsapp')} value={v.contact_whatsapp} onChange={set('contact_whatsapp')} keyboard="phone-pad" />

          {err && <Banner ok={false} text={err} />}
          <Btn kind="primary" busy={busy} label={id ? L('save') : L('saveNew')} onPress={save} />
          <Text style={s.hint}>{id ? L('hintEdit') : L('hintNew')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    label: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[600], marginBottom: 6 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.md },
    switchLabel: { fontSize: typography.fontSize.sm, color: c.dark, flex: 1, paddingRight: spacing.md },
    hint: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: spacing.md, textAlign: 'center' },
  });
}
