import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { formatXOF, radius, spacing, typography, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useI18n, type TKey } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Banner, Btn, DateField, Field, Pill } from '@/components/organizer/OrgUi';
import { orgTones } from '@/lib/organizer-theme';
import { MAX_GENERATED_SLOTS, deleteSlot, generateSlots, listSlots, toggleSlot, type OrgSlot } from '@/lib/organizer';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** /organizer-slots?id=… — créneaux d'une activité : génération par plage de dates / horaires, fermeture, suppression. */
export default function OrganizerSlotsScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const c = useColors();
  const { t, intl } = useI18n();
  const k = useMemo(() => orgTones(c), [c]);
  const s = useMemo(() => makeStyles(c, k), [c, k]);
  const [slots, setSlots] = useState<OrgSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [times, setTimes] = useState('');
  const [capacity, setCapacity] = useState('10');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState<number[]>([]);

  const load = useCallback(async () => { try { setSlots(await listSlots(id)); } catch { /* liste vide */ } setLoading(false); }, [id]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const ts = times.split(/[,\s]+/).filter((x) => TIME_RE.test(x));
    if (!from || ts.length === 0) { setMsg({ ok: false, text: t('org.slotsScreen.needDateTime') }); return; }
    setBusy(true); setMsg(null);
    try {
      const n = await generateSlots(id, { from, to: to || from, times: ts, days, capacity: Math.max(1, Math.min(500, Number(capacity) || 1)), price: price === '' ? null : Number(price) });
      setMsg({ ok: true, text: t('org.slotsScreen.added', { n }) });
      load();
    } catch (e: any) {
      const m = String(e?.message ?? '');
      setMsg({ ok: false, text: m === 'NO_FUTURE_SLOT' ? t('org.slotsScreen.noFuture') : m.startsWith('TOO_MANY:') ? t('org.slotsScreen.tooMany', { n: m.slice(9) }) : t('org.slotsScreen.failed') });
    } finally { setBusy(false); }
  }
  const act = async (fn: () => Promise<void>) => {
    try { await fn(); setMsg(null); load(); } catch (e: any) { setMsg({ ok: false, text: e?.message === 'SLOT_HAS_BOOKINGS' ? t('org.slotsScreen.hasBookings') : t('org.slotsScreen.failed') }); }
  };
  const confirmDelete = (sl: OrgSlot) => Alert.alert(t('org.slotsScreen.delete'), undefined, [
    { text: t('org.cancel'), style: 'cancel' }, { text: t('org.slotsScreen.delete'), style: 'destructive', onPress: () => act(() => deleteSlot(sl)) },
  ]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={t('org.slotsScreen.title')} subtitle={title} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }} keyboardShouldPersistTaps="handled">
        <DateField label={t('org.slotsScreen.from')} value={from} onChange={(x) => { setFrom(x); if (!to || to < x) setTo(x); }} />
        <DateField label={t('org.slotsScreen.to')} value={to} onChange={setTo} />
        <Field label={t('org.slotsScreen.times')} value={times} onChange={setTimes} placeholder="09:00, 14:00" keyboard="numbers-and-punctuation" />
        <Field label={t('org.slotsScreen.capacity')} value={capacity} onChange={(x) => setCapacity(x.replace(/\D/g, ''))} keyboard="number-pad" />
        <Field label={t('org.slotsScreen.price')} value={price} onChange={(x) => setPrice(x.replace(/\D/g, ''))} keyboard="number-pad" />
        <Text style={s.label}>{t('org.slotsScreen.days')}</Text>
        <View style={s.dows}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const on = days.includes(d);
            return (
              <Pressable key={d} onPress={() => setDays((p) => (on ? p.filter((x) => x !== d) : [...p, d]))} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[s.dow, on && { backgroundColor: c.primary[500], borderColor: c.primary[500] }]}>
                <Text style={[s.dowText, on && { color: k.onPrimary }]}>{t(`org.slotsScreen.dow.${d}` as TKey)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Btn kind="primary" busy={busy} label={busy ? t('org.slotsScreen.adding') : t('org.slotsScreen.add')} onPress={add} />
        <Text style={s.limit}>{`max. ${MAX_GENERATED_SLOTS}`}</Text>
        {msg && <View style={{ marginTop: spacing.md }}><Banner ok={msg.ok} text={msg.text} /></View>}

        <View style={{ marginTop: spacing.lg }}>
          {loading ? <ActivityIndicator color={c.primary[500]} /> : slots.length === 0 ? <Text style={s.empty}>{t('org.slotsScreen.none')}</Text> : slots.map((sl) => (
            <View key={sl.id} style={s.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.when}>{new Date(sl.starts_at).toLocaleString(intl, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' })}</Text>
                <Text style={s.meta}>{t('org.slotsScreen.booked', { booked: sl.booked, capacity: sl.capacity })}{sl.price_xof != null ? ` · ${formatXOF(sl.price_xof)}` : ''}</Text>
                {sl.status === 'closed' && <Pill text={t('org.slotsScreen.closed')} tone="grey" />}
              </View>
              <Btn label={sl.status === 'open' ? t('org.slotsScreen.close') : t('org.slotsScreen.reopen')} onPress={() => act(() => toggleSlot(sl))} />
              <Btn kind="danger" label={t('org.slotsScreen.delete')} onPress={() => (sl.booked > 0 ? setMsg({ ok: false, text: t('org.slotsScreen.hasBookings') }) : confirmDelete(sl))} />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette, k: ReturnType<typeof orgTones>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    label: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[600], marginBottom: 6 },
    dows: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
    dow: { minWidth: 46, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: c.neutral[200], backgroundColor: k.surface, paddingHorizontal: 10 },
    dowText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    limit: { fontSize: typography.fontSize.xs, color: c.neutral[500], textAlign: 'center', marginTop: spacing.xs },
    empty: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: k.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[100], padding: spacing.md, marginBottom: spacing.sm },
    when: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    meta: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
  });
}
