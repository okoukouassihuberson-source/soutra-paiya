import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { respondToRequest, type RequestAction } from '@/lib/requests';
import { hasPaymentPin } from '@/lib/security';
import { PinPrompt } from '@/components/PinPrompt';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';

interface Req {
  id: string;
  requester_id: string;
  payer_id: string;
  amount_xof: number;
  note: string | null;
  status: string;
  created_at: string;
  requester: { full_name: string | null } | null;
  payer: { full_name: string | null } | null;
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  accepted: { label: 'Payée', color: colors.success, bg: '#dcfce7' },
  declined: { label: 'Refusée', color: colors.danger, bg: '#fee2e2' },
  cancelled: { label: 'Annulée', color: colors.neutral[500], bg: colors.neutral[100] },
  pending: { label: 'En attente', color: '#d97706', bg: '#fef3c7' },
};

type Tab = 'incoming' | 'outgoing';

export default function Requests() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pinReq, setPinReq] = useState<Req | null>(null);
  const [tab, setTab] = useState<Tab>('incoming');

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await (supabase as any)
        .from('payment_requests')
        .select(
          'id, requester_id, payer_id, amount_xof, note, status, created_at, requester:profiles!requester_id(full_name), payer:profiles!payer_id(full_name)',
        )
        .or(`requester_id.eq.${userId},payer_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) console.error('[requests] load:', error);
      else setReqs((data as Req[]) ?? []);
    } catch (err) {
      console.error('[requests] unexpected:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    load();
    hasPaymentPin().then(setHasPin);
  }, [load]));

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`payment-requests-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests', filter: `payer_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests', filter: `requester_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  const respond = async (req: Req, action: RequestAction) => {
    setBusyId(req.id);
    try {
      const { status } = await respondToRequest(req.id, action);
      await load();
      if (action === 'accept' && status === 'accepted') {
        Alert.alert('Paiement effectué', `${formatXOF(req.amount_xof)} envoyés à ${req.requester?.full_name || 'ton contact'}.`);
      }
    } catch (err: any) {
      Alert.alert('Action impossible', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setBusyId(null);
    }
  };

  const gatedAccept = (req: Req) => {
    if (hasPin) setPinReq(req);
    else respond(req, 'accept');
  };

  const confirmAccept = (req: Req) => {
    Alert.alert('Confirmer le paiement', `Payer ${formatXOF(req.amount_xof)} à ${req.requester?.full_name || 'ce contact'} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Payer', onPress: () => gatedAccept(req) },
    ]);
  };

  const incoming = reqs.filter((r) => r.payer_id === userId);
  const outgoing = reqs.filter((r) => r.requester_id === userId);
  const incomingPending = incoming.filter((r) => r.status === 'pending').length;
  const outgoingPending = outgoing.filter((r) => r.status === 'pending').length;
  const list = tab === 'incoming' ? incoming : outgoing;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Demandes d'argent"
        subtitle="Reçues et envoyées"
        trailing={(
          <Pressable
            onPress={() => router.push('/request')}
            hitSlop={10}
            style={({ pressed }) => [s.addBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] }]}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </Pressable>
        )}
      />

      {/* Tabs */}
      <View style={s.tabs}>
        <Pressable style={[s.tab, tab === 'incoming' && s.tabActive]} onPress={() => setTab('incoming')}>
          <Text style={[s.tabText, tab === 'incoming' && s.tabTextActive]}>Reçues</Text>
          {incomingPending > 0 && (
            <View style={s.tabBadge}><Text style={s.tabBadgeText}>{incomingPending}</Text></View>
          )}
        </Pressable>
        <Pressable style={[s.tab, tab === 'outgoing' && s.tabActive]} onPress={() => setTab('outgoing')}>
          <Text style={[s.tabText, tab === 'outgoing' && s.tabTextActive]}>Envoyées</Text>
          {outgoingPending > 0 && (
            <View style={s.tabBadge}><Text style={s.tabBadgeText}>{outgoingPending}</Text></View>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <RequestSkeleton />
          <RequestSkeleton />
        </View>
      ) : list.length === 0 ? (
        <ScrollView
          contentContainerStyle={s.emptyBody}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={s.emptyIconWrap}>
            <Ionicons name={tab === 'incoming' ? 'download-outline' : 'send-outline'} size={48} color={colors.primary[400]} />
          </View>
          <Text style={s.emptyTitle}>
            {tab === 'incoming' ? 'Aucune demande reçue' : 'Aucune demande envoyée'}
          </Text>
          <Text style={s.emptyText}>
            {tab === 'incoming'
              ? 'Quand quelqu\'un te demandera de l\'argent, ça apparaîtra ici.'
              : 'Demande à un contact de te rembourser ou de payer une dépense.'}
          </Text>
          {tab === 'outgoing' && (
            <Pressable
              style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
              onPress={() => router.push('/request')}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.emptyBtnText}>Nouvelle demande</Text>
            </Pressable>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {list.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              direction={tab}
              busy={busyId === r.id}
              onAccept={() => confirmAccept(r)}
              onDecline={() => respond(r, 'decline')}
              onCancel={() => respond(r, 'cancel')}
            />
          ))}
        </ScrollView>
      )}

      <PinPrompt
        visible={!!pinReq}
        title="Confirme le paiement"
        onSuccess={() => {
          const r = pinReq;
          setPinReq(null);
          if (r) respond(r, 'accept');
        }}
        onCancel={() => setPinReq(null)}
      />
    </SafeAreaView>
  );
}

function RequestCard({
  req, direction, busy, onAccept, onDecline, onCancel,
}: {
  req: Req;
  direction: Tab;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  const otherName = direction === 'incoming'
    ? req.requester?.full_name || 'Quelqu\'un'
    : req.payer?.full_name || 'le contact';
  const pending = req.status === 'pending';
  const meta = STATUS_META[req.status] ?? STATUS_META.pending;
  const initial = otherName.charAt(0).toUpperCase();

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.avatar}>
          <Text style={s.avatarTxt}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>
            {direction === 'incoming' ? `${otherName} te demande` : `Tu demandes à ${otherName}`}
          </Text>
          {!!req.note && <Text style={s.cardNote} numberOfLines={1}>« {req.note} »</Text>}
          <Text style={s.cardDate}>{relativeDate(req.created_at)}</Text>
        </View>
        <Text style={s.cardAmount}>{formatXOF(req.amount_xof)}</Text>
      </View>

      <View style={s.cardFooter}>
        <View style={[s.statusPill, { backgroundColor: meta.bg }]}>
          <Text style={[s.statusPillText, { color: meta.color }]}>{meta.label}</Text>
        </View>

        {pending && direction === 'incoming' && (
          <View style={s.actions}>
            <Pressable
              style={({ pressed }) => [s.actionBtn, s.declineBtn, pressed && { opacity: 0.7 }]}
              onPress={onDecline}
              disabled={busy}
            >
              <Text style={s.declineText}>Refuser</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.actionBtn, s.payBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={onAccept}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                  <Text style={s.payText}>Payer</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {pending && direction === 'outgoing' && (
          <Pressable
            style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7 }]}
            onPress={onCancel}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color={colors.danger} size="small" /> : (
              <Text style={s.declineText}>Annuler</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function RequestSkeleton() {
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <Skeleton width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="40%" height={11} style={{ marginTop: 6 }} />
        </View>
        <Skeleton width={80} height={18} />
      </View>
    </View>
  );
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.neutral[100], borderRadius: radius.full, padding: 4, gap: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.full },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  tabText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.neutral[600] },
  tabTextActive: { color: colors.dark },
  tabBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  emptyBody: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyIconWrap: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, marginBottom: spacing.xs },
  emptyText: { fontSize: typography.fontSize.sm, color: colors.neutral[500], textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  emptyBtn: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primary[500], paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.full, shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  card: { backgroundColor: '#fff', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary[500], alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  cardTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.dark },
  cardNote: { marginTop: 2, fontSize: typography.fontSize.xs, color: colors.neutral[600], fontStyle: 'italic' },
  cardDate: { marginTop: 2, fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  cardAmount: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.primary[600], letterSpacing: -0.3 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  statusPillText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full, minWidth: 80 },
  payBtn: { backgroundColor: colors.primary[500] },
  payText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  declineBtn: { borderWidth: 1.5, borderColor: colors.neutral[200] },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.neutral[200] },
  declineText: { color: colors.danger, fontWeight: '700', fontSize: typography.fontSize.sm },
});
