import { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing, formatXOF } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { respondToRequest, type RequestAction } from '@/lib/requests';

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

const STATUS_LABEL: Record<string, string> = {
  accepted: 'Payé',
  declined: 'Refusé',
  cancelled: 'Annulé',
};

export default function Requests() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;

  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await (supabase as any)
        .from('payment_requests')
        .select(
          'id, requester_id, payer_id, amount_xof, note, status, created_at, requester:profiles!requester_id(full_name), payer:profiles!payer_id(full_name)',
        )
        .or(`requester_id.eq.${userId},payer_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('[requests] load:', error);
      } else {
        setReqs((data as Req[]) ?? []);
      }
    } catch (err) {
      console.error('[requests] unexpected:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // Rechargement à chaque focus de l'écran.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Temps réel : toute demande me concernant rafraîchit la liste.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`payment-requests-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_requests', filter: `payer_id=eq.${userId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_requests', filter: `requester_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const respond = async (req: Req, action: RequestAction) => {
    setBusyId(req.id);
    try {
      const { status } = await respondToRequest(req.id, action);
      await load();
      if (action === 'accept' && status === 'accepted') {
        Alert.alert(
          'Paiement effectué',
          `${formatXOF(req.amount_xof)} envoyés à ${req.requester?.full_name || 'ton contact'}.`,
        );
      }
    } catch (err: any) {
      Alert.alert('Action impossible', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmAccept = (req: Req) => {
    Alert.alert(
      'Confirmer le paiement',
      `Payer ${formatXOF(req.amount_xof)} à ${req.requester?.full_name || 'ce contact'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Payer', onPress: () => respond(req, 'accept') },
      ],
    );
  };

  const incoming = reqs.filter((r) => r.payer_id === userId);
  const outgoing = reqs.filter((r) => r.requester_id === userId);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Demandes</Text>
        <Pressable hitSlop={10} onPress={() => router.push('/request')}>
          <Ionicons name="add-circle" size={28} color={colors.primary[500]} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ flex: 1 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        >
          <Pressable style={s.newBtn} onPress={() => router.push('/request')}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.newBtnText}>Nouvelle demande</Text>
          </Pressable>

          <Text style={s.section}>Reçues</Text>
          {incoming.length === 0 ? (
            <Text style={s.empty}>Aucune demande reçue.</Text>
          ) : (
            incoming.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                direction="incoming"
                busy={busyId === r.id}
                onAccept={() => confirmAccept(r)}
                onDecline={() => respond(r, 'decline')}
                onCancel={() => respond(r, 'cancel')}
              />
            ))
          )}

          <Text style={s.section}>Envoyées</Text>
          {outgoing.length === 0 ? (
            <Text style={s.empty}>Aucune demande envoyée.</Text>
          ) : (
            outgoing.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                direction="outgoing"
                busy={busyId === r.id}
                onAccept={() => confirmAccept(r)}
                onDecline={() => respond(r, 'decline')}
                onCancel={() => respond(r, 'cancel')}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RequestCard({
  req,
  direction,
  busy,
  onAccept,
  onDecline,
  onCancel,
}: {
  req: Req;
  direction: 'incoming' | 'outgoing';
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onCancel: () => void;
}) {
  const otherName =
    direction === 'incoming'
      ? req.requester?.full_name || 'Quelqu’un'
      : req.payer?.full_name || 'le contact';
  const pending = req.status === 'pending';

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>
            {direction === 'incoming'
              ? `${otherName} te demande`
              : `Tu demandes à ${otherName}`}
          </Text>
          {!!req.note && <Text style={s.cardNote}>« {req.note} »</Text>}
          <Text style={s.cardDate}>
            {new Date(req.created_at).toLocaleDateString('fr-FR')}
          </Text>
        </View>
        <Text style={s.cardAmount}>{formatXOF(req.amount_xof)}</Text>
      </View>

      {pending && direction === 'incoming' && (
        <View style={s.actions}>
          <Pressable
            style={[s.actionBtn, s.declineBtn]}
            onPress={onDecline}
            disabled={busy}
          >
            <Text style={s.declineText}>Refuser</Text>
          </Pressable>
          <Pressable
            style={[s.actionBtn, s.payBtn]}
            onPress={onAccept}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.payText}>Payer</Text>
            )}
          </Pressable>
        </View>
      )}

      {pending && direction === 'outgoing' && (
        <View style={s.actions}>
          <View style={s.statusPill}>
            <Text style={s.statusPillText}>En attente</Text>
          </View>
          <Pressable
            style={[s.actionBtn, s.declineBtn]}
            onPress={onCancel}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Text style={s.declineText}>Annuler</Text>
            )}
          </Pressable>
        </View>
      )}

      {!pending && (
        <View style={s.actions}>
          <View
            style={[
              s.statusPill,
              req.status === 'accepted' && { backgroundColor: colors.secondary[50] },
            ]}
          >
            <Text
              style={[
                s.statusPillText,
                req.status === 'accepted' && { color: colors.secondary[700] },
              ]}
            >
              {STATUS_LABEL[req.status] ?? req.status}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.base,
  },
  headerTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.dark,
  },
  empty: { color: colors.neutral[500], fontSize: typography.fontSize.sm },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardTitle: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  cardNote: {
    marginTop: 2,
    fontSize: typography.fontSize.xs,
    color: colors.neutral[600],
    fontStyle: 'italic',
  },
  cardDate: { marginTop: 2, fontSize: typography.fontSize.xs, color: colors.neutral[500] },
  cardAmount: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtn: { backgroundColor: colors.primary[500] },
  payText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.sm },
  declineBtn: { borderWidth: 1.5, borderColor: colors.neutral[300] },
  declineText: { color: colors.danger, fontWeight: '600', fontSize: typography.fontSize.sm },
  statusPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.neutral[100],
  },
  statusPillText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[600] },
});
