import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ACTIVITY_CATEGORIES, spacing, typography, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { useI18n, type TKey } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Banner, Btn, Chips, Field, ImageField } from '@/components/organizer/OrgUi';
import { EMPTY_ACTIVITY, loadActivityForm, orgError, saveActivity, type ActivityFormValues } from '@/lib/organizer';

/** /organizer-activity[?id=…] — création / modification d'un brouillon d'activité. */
export default function OrganizerActivityScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const { t } = useI18n();
  const s = useMemo(() => makeStyles(c), [c]);
  const [v, setV] = useState<ActivityFormValues>(EMPTY_ACTIVITY);
  const [i18n, setI18n] = useState<any>({});
  const [loading, setLoading] = useState(!!id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof ActivityFormValues>(k: K) => (val: ActivityFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const digits = (k: keyof ActivityFormValues) => (x: string) => set(k)(x.replace(/\D/g, '') as never);

  useEffect(() => {
    if (!id) return;
    loadActivityForm(id).then((r) => {
      if (!r) setErr(t('org.actForm.notFound')); else { setV(r.values); setI18n(r.i18n); }
      setLoading(false);
    }).catch(() => { setErr(t('org.actForm.notFound')); setLoading(false); });
  }, [id, t]);

  function validate(): string | null {
    if (v.title.trim().length < 2) return t('org.actForm.vTitle');
    if (v.price_xof === '' || !(Number(v.price_xof) >= 0)) return t('org.actForm.vPrice');
    const d = Number(v.duration_minutes);
    if (!(d >= 15 && d <= 20160)) return t('org.actForm.vDuration');
    return null;
  }
  async function save() {
    if (!user?.id) return;
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    try { await saveActivity(user.id, v, id, i18n); router.back(); } catch (e: any) { setErr(orgError(e?.message)); } finally { setBusy(false); }
  }

  const L = (k: string) => t(`org.actForm.${k}` as TKey);
  if (loading) return <SafeAreaView style={s.safe} edges={['top']}><ScreenHeader title={L('titleEdit')} /><View style={s.center}><ActivityIndicator color={c.primary[500]} /></View></SafeAreaView>;
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={id ? L('titleEdit') : L('titleNew')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
          <Field label={L('name')} value={v.title} onChange={set('title')} maxLength={200} />
          <Field label={L('summary')} value={v.summary} onChange={set('summary')} maxLength={500} />
          <Text style={s.label}>{L('category')}</Text>
          <View style={{ marginBottom: spacing.md }}>
            <Chips value={v.category} onChange={set('category')} options={ACTIVITY_CATEGORIES.map((k) => ({ value: k.key, label: `${k.emoji} ${t(`cat.${k.key}` as TKey)}` }))} />
          </View>
          <Field label={L('city')} value={v.city} onChange={set('city')} />
          <Field label={L('address')} value={v.address} onChange={set('address')} />
          <Field label={L('lat')} value={v.latitude} onChange={set('latitude')} keyboard="numbers-and-punctuation" />
          <Field label={L('lng')} value={v.longitude} onChange={set('longitude')} keyboard="numbers-and-punctuation" />
          <Field label={L('price')} value={v.price_xof} onChange={digits('price_xof')} keyboard="number-pad" />
          <Field label={L('duration')} value={v.duration_minutes} onChange={digits('duration_minutes')} keyboard="number-pad" />
          <Field label={L('minAge')} value={v.min_age} onChange={digits('min_age')} keyboard="number-pad" />
          <Field label={L('minPart')} value={v.min_participants} onChange={digits('min_participants')} keyboard="number-pad" />
          <Field label={L('maxGroup')} value={v.max_group_size} onChange={digits('max_group_size')} keyboard="number-pad" />
          <Field label={L('languages')} value={v.languages} onChange={set('languages')} />
          {user?.id && <ImageField label={L('cover')} userId={user.id} urls={v.cover_url ? [v.cover_url] : []} onChange={(u) => set('cover_url')(u[0] ?? '')} />}
          {user?.id && <ImageField multiple label={L('gallery')} userId={user.id} urls={v.gallery} onChange={set('gallery')} />}
          <Field label={L('description')} value={v.description} onChange={set('description')} multiline />
          <Field label={L('includes')} value={v.includes} onChange={set('includes')} multiline />
          <Field label={L('excludes')} value={v.excludes} onChange={set('excludes')} multiline />
          <Field label={L('conditions')} value={v.conditions} onChange={set('conditions')} multiline />
          <Field label={L('phone')} value={v.contact_phone} onChange={set('contact_phone')} keyboard="phone-pad" />
          <Field label={L('whatsapp')} value={v.contact_whatsapp} onChange={set('contact_whatsapp')} keyboard="phone-pad" />
          {err && <Banner ok={false} text={err} />}
          <Btn kind="primary" busy={busy} label={id ? L('save') : L('saveNew')} onPress={save} />
          {!id && <Text style={s.hint}>{L('hintNew')}</Text>}
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
    hint: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: spacing.md, textAlign: 'center' },
  });
}
