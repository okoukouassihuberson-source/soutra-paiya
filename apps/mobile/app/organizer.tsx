import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing, typography, formatXOF, formatTripDates, activityCategoryEmoji, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { useI18n, type TKey } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Banner, Btn, Kpi, Pill } from '@/components/organizer/OrgUi';
import { orgTones } from '@/lib/organizer-theme';
import {
  ORGANIZER_ROLES, closeTripSales, getActivityBookings, getActivityDashboard, getMyCommission, getMyRole, getTripBookings, getTripDashboard,
  orgError, setActivityStatus, submitActivity, submitTrip,
  type MyCommission, type OrgActivityDash, type OrgBooking, type OrgTripDash,
} from '@/lib/organizer';

type Tab = 'trips' | 'acts';
const TRIP_TONE = { draft: 'amber', published: 'green', full: 'blue', closed: 'grey', cancelled: 'red' } as const;
const ACT_TONE = { draft: 'amber', published: 'green', paused: 'grey', archived: 'red' } as const;

/** /organizer — espace organisateur : voyages, activités, voyageurs, billets (miroir de /organisateur web). */
export default function OrganizerScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const c = useColors();
  const { t, intl } = useI18n();
  const k = useMemo(() => orgTones(c), [c]);
  const s = useMemo(() => makeStyles(c, k), [c, k]);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('trips');
  const [trips, setTrips] = useState<OrgTripDash | null>(null);
  const [acts, setActs] = useState<OrgActivityDash | null>(null);
  const [comm, setComm] = useState<MyCommission | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [bookings, setBookings] = useState<OrgBooking[] | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) { setAllowed(false); setLoading(false); return; }
    const role = await getMyRole(user.id).catch(() => null);
    const ok = !!role && ORGANIZER_ROLES.includes(role);
    setAllowed(ok);
    if (ok) {
      const [tr, ac, cm] = await Promise.all([getTripDashboard().catch(() => null), getActivityDashboard().catch(() => null), getMyCommission().catch(() => null)]);
      setTrips(tr); setActs(ac); setComm(cm);
    }
    setLoading(false); setRefreshing(false);
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<void>, okText?: string) => {
    setMsg(null);
    try { await fn(); if (okText) setMsg({ ok: true, text: okText }); await load(); } catch (e: any) { setMsg({ ok: false, text: orgError(e?.message) }); }
  };
  const confirmClose = (id: string) => Alert.alert(t('org.closeTitle'), t('org.closeBody'), [
    { text: t('org.cancel'), style: 'cancel' }, { text: t('org.confirm'), style: 'destructive', onPress: () => run(() => closeTripSales(id)) },
  ]);
  const toggleBookings = async (kind: Tab, id: string) => {
    const key = `${kind}-${id}`;
    if (open === key) { setOpen(null); return; }
    setOpen(key); setBookings(null);
    try { setBookings(kind === 'trips' ? await getTripBookings(id) : await getActivityBookings(id)); }
    catch { setMsg({ ok: false, text: t('org.bookingsFail') }); setOpen(null); }
  };
  const bkLabel = (kind: Tab, status: string) => {
    const k = status === 'confirmed' ? (kind === 'trips' ? 'confirmedTrip' : 'confirmedAct') : status === 'used' ? (kind === 'trips' ? 'usedTrip' : 'usedAct') : status;
    return ['pending', 'paid', 'cancelled', 'confirmedTrip', 'confirmedAct', 'usedTrip', 'usedAct'].includes(k) ? t(`org.bk.${k}` as TKey) : status;
  };

  if (loading) return <SafeAreaView style={s.safe} edges={['top']}><ScreenHeader title={t('org.title')} /><View style={s.center}><ActivityIndicator color={c.primary[500]} /></View></SafeAreaView>;
  if (!user) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title={t('org.title')} />
        <View style={s.center}><Text style={s.emptyTitle}>{t('org.loginTitle')}</Text><Text style={s.emptyText}>{t('org.loginBody')}</Text><Btn kind="primary" label={t('org.signIn')} onPress={() => router.push('/(auth)/login' as any)} /></View>
      </SafeAreaView>
    );
  }
  if (!allowed) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title={t('org.title')} />
        <View style={s.center}><Ionicons name="lock-closed-outline" size={44} color={c.neutral[300]} /><Text style={s.emptyTitle}>{t('org.deniedTitle')}</Text><Text style={s.emptyText}>{t('org.deniedBody')}</Text><Btn label={t('org.back')} onPress={() => router.back()} /></View>
      </SafeAreaView>
    );
  }

  const tt = trips?.totals; const at = acts?.totals;
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={t('org.title')} trailing={<Pressable onPress={() => router.push('/organizer-scan' as any)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('org.scan')}><Ionicons name="qr-code-outline" size={24} color={c.primary[500]} /></Pressable>} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {comm && (
          <Text style={s.commission}>💼 {t('org.commission', { trip: Number(comm.trip_pct), act: Number(comm.activity_pct), taken: formatXOF(Number(comm.commission_xof)), collected: formatXOF(Number(comm.collected_xof)) })}</Text>
        )}
        <View style={s.tabs} accessibilityRole="tablist">
          {(['trips', 'acts'] as Tab[]).map((key) => (
            <Pressable key={key} onPress={() => { setTab(key); setOpen(null); setMsg(null); }} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} style={[s.tab, tab === key && { backgroundColor: c.primary[500], borderColor: c.primary[500] }]}>
              <Text style={[s.tabText, tab === key && { color: k.onPrimary }]}>{key === 'trips' ? `🚌 ${t('org.tabTrips')}` : `🎯 ${t('org.tabActs')}`}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'trips' ? (
          <View style={s.kpis}><Kpi label={t('org.kpiBookings')} value={tt?.bookings ?? 0} /><Kpi label={t('org.kpiSeats')} value={tt?.seats_sold ?? 0} /><Kpi label={t('org.kpiCollected')} value={formatXOF(tt?.paid_xof ?? 0)} /><Kpi label={t('org.kpiDue')} value={formatXOF(tt?.due_xof ?? 0)} /></View>
        ) : (
          <View style={s.kpis}><Kpi label={t('org.kpiBookings')} value={at?.bookings ?? 0} /><Kpi label={t('org.kpiParticipants')} value={at?.participants ?? 0} /><Kpi label={t('org.kpiCollected')} value={formatXOF(at?.paid_xof ?? 0)} /></View>
        )}

        <View style={s.headRow}>
          <Text style={s.h2}>{tab === 'trips' ? t('org.myTrips') : t('org.myActs')}</Text>
          <Btn kind="primary" label={tab === 'trips' ? t('org.newTrip') : t('org.newAct')} onPress={() => router.push((tab === 'trips' ? '/organizer-trip' : '/organizer-activity') as any)} />
        </View>
        {msg && <Banner ok={msg.ok} text={msg.text} />}

        {tab === 'trips' && (!trips?.trips.length ? <Text style={s.emptyText}>{t('org.noTrips')}</Text> : trips.trips.map((x) => {
          const key = `trips-${x.id}`;
          return (
            <View key={x.id} style={s.card}>
              <View style={s.pills}>
                <Pill text={t(`org.status.${x.status}` as TKey)} tone={TRIP_TONE[x.status]} />
                {x.status === 'draft' && !!x.submitted_at && <Pill text={t('org.inReview')} tone="orange" />}
              </View>
              <Text style={s.cardTitle}>{x.title}</Text>
              <Text style={s.meta}>{x.scope === 'national' ? '🇨🇮' : '🌍'} {t('org.tripLine', { dates: formatTripDates(x.starts_on, x.ends_on, intl), price: formatXOF(x.base_price_xof), booked: x.seats_booked, total: x.seats_total })}</Text>
              <Text style={s.meta2}>{t('org.tripStats', { n: x.bookings, paid: formatXOF(x.paid_xof), due: formatXOF(x.due_xof) })}</Text>
              <View style={s.actions}>
                {x.status === 'draft' && <Btn label={t('org.edit')} onPress={() => router.push({ pathname: '/organizer-trip' as any, params: { id: x.id } })} />}
                {x.status === 'draft' && !x.submitted_at && <Btn kind="green" label={t('org.submit')} onPress={() => run(() => submitTrip(x.id), t('org.submittedTrip'))} />}
                {(x.status === 'published' || x.status === 'full') && <Btn label={t('org.closeSales')} onPress={() => confirmClose(x.id)} />}
                {x.bookings > 0 && <Btn label={t('org.travelers')} onPress={() => toggleBookings('trips', x.id)} />}
                {(x.status === 'published' || x.status === 'full') && <Btn label={t('org.view')} onPress={() => router.push(`/voyage/${x.slug}` as any)} />}
              </View>
              {open === key && <BookingList kind="trips" rows={bookings} label={bkLabel} />}
            </View>
          );
        }))}

        {tab === 'acts' && (!acts?.activities.length ? <Text style={s.emptyText}>{t('org.noActs')}</Text> : acts.activities.map((x) => {
          const key = `acts-${x.id}`;
          return (
            <View key={x.id} style={s.card}>
              <View style={s.pills}>
                <Pill text={t(`org.status.${x.status}` as TKey)} tone={ACT_TONE[x.status]} />
                {x.status === 'draft' && !!x.submitted_at && <Pill text={t('org.inReview')} tone="orange" />}
              </View>
              <Text style={s.cardTitle}>{x.title}</Text>
              <Text style={s.meta}>{activityCategoryEmoji(x.category)} {t('org.actLine', { cat: t(`cat.${x.category}` as TKey), price: formatXOF(x.price_xof), slots: x.upcoming_slots })}{x.rating_count > 0 ? ` · ★ ${Number(x.rating_avg).toFixed(1)} (${x.rating_count})` : ''}</Text>
              <Text style={s.meta2}>{t('org.actStats', { n: x.bookings, paid: formatXOF(x.paid_xof) })}</Text>
              <View style={s.actions}>
                {x.status === 'draft' && <Btn label={t('org.edit')} onPress={() => router.push({ pathname: '/organizer-activity' as any, params: { id: x.id } })} />}
                <Btn label={t('org.slots')} onPress={() => router.push({ pathname: '/organizer-slots' as any, params: { id: x.id, title: x.title } })} />
                {x.bookings > 0 && <Btn label={t('org.participants')} onPress={() => toggleBookings('acts', x.id)} />}
                {x.status === 'draft' && !x.submitted_at && <Btn kind="green" label={t('org.submit')} onPress={() => run(() => submitActivity(x.id), t('org.submittedAct'))} />}
                {x.status === 'published' && <Btn label={t('org.pause')} onPress={() => run(() => setActivityStatus(x.id, 'paused'))} />}
                {x.status === 'paused' && !!x.approved_at && <Btn kind="green" label={t('org.resume')} onPress={() => run(() => setActivityStatus(x.id, 'published'))} />}
                {x.status === 'published' && <Btn label={t('org.view')} onPress={() => router.push(`/activite/${x.slug}` as any)} />}
              </View>
              {open === key && <BookingList kind="acts" rows={bookings} label={bkLabel} />}
            </View>
          );
        }))}
      </ScrollView>
    </SafeAreaView>
  );
}

function BookingList({ kind, rows, label }: { kind: Tab; rows: OrgBooking[] | null; label: (k: Tab, s: string) => string }) {
  const c = useColors();
  const { t, intl } = useI18n();
  const k = useMemo(() => orgTones(c), [c]);
  const s = useMemo(() => makeStyles(c, k), [c, k]);
  if (!rows) return <ActivityIndicator style={{ marginTop: spacing.md }} color={c.primary[500]} />;
  if (rows.length === 0) return <Text style={[s.emptyText, { marginTop: spacing.md }]}>{t('org.noBookings')}</Text>;
  return (
    <View style={s.bookings}>
      {rows.map((b) => (
        <View key={b.id} style={s.bkRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.bkName}>{b.traveler_name ?? '—'} · {t('org.pers', { n: b.participants })}</Text>
            <Text style={s.bkMeta}>{b.reference}{kind === 'acts' && b.starts_at ? ` · ${new Date(b.starts_at).toLocaleString(intl, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan' })}` : ''}</Text>
            <Text style={s.bkMeta}>{t('org.paidOf', { paid: formatXOF(b.paid_xof), total: formatXOF(b.total_xof) })} · {label(kind, b.status)}</Text>
          </View>
          {b.contact_phone ? <Pressable onPress={() => Linking.openURL(`tel:${b.contact_phone}`)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${t('org.call')} ${b.traveler_name ?? ''}`} style={s.callBtn}><Ionicons name="call-outline" size={18} color="#fff" /></Pressable> : null}
        </View>
      ))}
    </View>
  );
}

function makeStyles(c: ColorPalette, k: ReturnType<typeof orgTones>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, textAlign: 'center' },
    emptyText: { fontSize: typography.fontSize.sm, color: c.neutral[600], textAlign: 'center' },
    commission: { fontSize: typography.fontSize.xs, color: c.neutral[700], backgroundColor: k.surface, borderWidth: 1, borderColor: c.neutral[100], borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, lineHeight: 18 },
    tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: c.neutral[200], backgroundColor: k.surface },
    tabText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.sm },
    h2: { fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark, flexShrink: 1 },
    card: { backgroundColor: k.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.neutral[100], padding: spacing.md, marginBottom: spacing.md, gap: 4 },
    pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    cardTitle: { fontSize: typography.fontSize.base, fontWeight: '800', color: c.dark, marginTop: 4 },
    meta: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    meta2: { fontSize: typography.fontSize.xs, color: c.neutral[500] },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
    bookings: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: c.neutral[100] },
    bkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    bkName: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    bkMeta: { fontSize: typography.fontSize.xs, color: c.neutral[600] },
    callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' },
  });
}
