// ============================================================================
// venue-payout — écran de demande de virement sortant pour un venue.
//
// Cloné de withdraw.tsx mais adapté aux revenus venue (RPCs 0044) :
//   • Source du solde = get_venue_payable_balance (pas le wallet perso)
//   • Cible = venue_payouts (table dédiée, séparée des transactions perso)
//   • KYC perso reste requis (identique au wallet withdraw)
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Pressable, TextInput, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  typography, radius, spacing, formatXOF, type ColorPalette,
} from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  getVenuePayableBalance, listVenuePayouts, requestVenuePayout,
  type PayoutProvider, type VenuePayoutBalance, type VenuePayoutRow,
} from '@/lib/venue-payout';

const PROVIDERS: { id: PayoutProvider; label: string; bg: string; color: string }[] = [
  { id: 'orange', label: 'Orange Money', bg: '#fff7ed', color: '#ea580c' },
  { id: 'mtn',    label: 'MTN MoMo',     bg: '#fefce8', color: '#ca8a04' },
  { id: 'wave',   label: 'Wave',         bg: '#eff6ff', color: '#2563eb' },
];

const MIN_XOF = 1000;
const MAX_XOF = 2000000;
const PHONE_RE = /^\+225[0-9]{10}$/;

const STATUS_META: Record<VenuePayoutRow['status'], { label: string; bg: string; fg: string }> = {
  pending: { label: 'En cours', bg: '#fef3c7', fg: '#92400e' },
  success: { label: 'Réussi',   bg: '#d1fae5', fg: '#065f46' },
  failed:  { label: 'Échec',    bg: '#fee2e2', fg: '#b91c1c' },
  reversed: { label: 'Annulé',  bg: '#e5e7eb', fg: '#374151' },
};

export default function VenuePayout() {
  const router = useRouter();
  const params = useLocalSearchParams<{ venueId?: string }>();
  const venueId = params.venueId ?? '';
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState<VenuePayoutBalance | null>(null);
  const [history, setHistory] = useState<VenuePayoutRow[]>([]);
  const [kycVerified, setKycVerified] = useState(false);
  const [venueName, setVenueName] = useState('');

  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<PayoutProvider | null>(null);
  const [phone, setPhone] = useState(user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '+225');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!venueId || !user?.id) {
      setLoading(false);
      return;
    }
    try {
      const [balRes, historyRes, profileRes, venueRes] = await Promise.all([
        getVenuePayableBalance(venueId),
        listVenuePayouts(venueId, 10),
        supabase.from('profiles').select('kyc_status').eq('id', user.id).maybeSingle(),
        supabase.from('venues').select('name').eq('id', venueId).maybeSingle(),
      ]);
      setBalance(balRes);
      setHistory(historyRes);
      setKycVerified((profileRes.data as any)?.kyc_status === 'verified');
      setVenueName((venueRes.data as any)?.name ?? '');
    } catch (err) {
      console.error('[venue-payout] load:', err);
      Alert.alert(
        'Chargement impossible',
        err instanceof Error ? err.message : 'Erreur inconnue',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [venueId, user?.id]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadAll();
  };

  const amountNum = parseInt(amount || '0', 10);
  const payable = balance?.payable_xof ?? 0;
  const amountValid = amountNum >= MIN_XOF && amountNum <= Math.min(MAX_XOF, payable);
  const phoneValid = PHONE_RE.test(phone);
  const canSubmit = kycVerified && amountValid && phoneValid && !!provider && !submitting && payable > 0;

  const handleSubmit = async () => {
    if (!provider || !amountValid || !phoneValid) return;
    try {
      setSubmitting(true);
      const result = await requestVenuePayout({
        venueId,
        amountXof: amountNum,
        provider,
        phone,
      });
      const msg = result.status === 'success'
        ? `${formatXOF(amountNum)} ont été envoyés vers ton compte ${provider.toUpperCase()}.`
        : `Ton retrait de ${formatXOF(amountNum)} est en cours de traitement.`;
      Alert.alert('Retrait enregistré', msg, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Retrait impossible', err?.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!venueId) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Retirer mes revenus" />
        <View style={s.center}>
          <Ionicons name="alert-circle" size={48} color={c.neutral[300]} />
          <Text style={s.emptyTitle}>Aucun établissement sélectionné</Text>
          <Pressable onPress={() => router.replace('/pro')} style={[s.primaryBtn, { marginTop: spacing.lg }]}>
            <Text style={s.primaryBtnText}>Ouvrir l'Espace gérant</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Retirer mes revenus" subtitle={venueName || undefined} />
        <ActivityIndicator size="large" color={c.primary[500]} style={{ flex: 1, marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Retirer mes revenus" subtitle={venueName || undefined} />

        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary[500]} />}
        >
          {!kycVerified && (
            <Pressable
              style={({ pressed }) => [s.kycBanner, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/kyc')}
            >
              <View style={s.kycIconWrap}>
                <Ionicons name="alert-circle" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.kycTitle}>Vérification d'identité requise</Text>
                <Text style={s.kycSub}>Touche pour compléter ton KYC et débloquer les retraits.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.dark} />
            </Pressable>
          )}

          {/* Balance card */}
          <View style={s.balanceCard}>
            <View>
              <Text style={s.balanceLabel}>Solde payable</Text>
              <Text style={s.balanceValue}>{formatXOF(payable)}</Text>
            </View>
            <View style={s.balanceMeta}>
              <Text style={s.balanceMetaItem}>
                Net : {formatXOF(balance?.net_xof ?? 0)}
              </Text>
              <Text style={s.balanceMetaItem}>
                En attente : {formatXOF(balance?.pending_xof ?? 0)}
              </Text>
              <Text style={s.balanceMetaItem}>
                Déjà payé : {formatXOF(balance?.paid_xof ?? 0)}
              </Text>
            </View>
          </View>

          {payable === 0 ? (
            <View style={s.infoBox}>
              <View style={s.infoIconWrap}>
                <Ionicons name="information-circle-outline" size={18} color={c.primary[500]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoTitle}>Aucun revenu retirable</Text>
                <Text style={s.infoText}>
                  Tes futurs revenus (réservations honorées, billets vendus, paiements) apparaîtront ici.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* Amount */}
              <View style={s.sectionTitleRow}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Montant à retirer</Text>
              </View>
              <View style={[s.fieldCard, amount.length > 0 && !amountValid && s.fieldCardError]}>
                <TextInput
                  style={s.amountInput}
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  placeholderTextColor={c.neutral[400]}
                  keyboardType="number-pad"
                  maxLength={7}
                  editable={!submitting && kycVerified}
                />
                <Text style={s.amountCurrency}>FCFA</Text>
              </View>
              {amount.length > 0 && !amountValid && (
                <Text style={s.errorHint}>
                  {amountNum > payable
                    ? `Solde payable insuffisant (${formatXOF(payable)}).`
                    : amountNum > MAX_XOF
                      ? `Maximum ${formatXOF(MAX_XOF)} par opération.`
                      : `Minimum ${formatXOF(MIN_XOF)}.`}
                </Text>
              )}

              {/* Provider */}
              <View style={s.sectionTitleRow}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Opérateur mobile money</Text>
              </View>
              <View style={s.providerGrid}>
                {PROVIDERS.map((p) => {
                  const active = provider === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={({ pressed }) => [
                        s.providerChip,
                        { backgroundColor: active ? p.bg : c.light, borderColor: active ? p.color : c.neutral[200] },
                        pressed && { transform: [{ scale: 0.97 }] },
                      ]}
                      onPress={() => setProvider(p.id)}
                      disabled={submitting || !kycVerified}
                    >
                      <View style={[s.providerDot, { backgroundColor: p.color }]} />
                      <Text style={[s.providerText, { color: active ? p.color : c.neutral[700] }]}>
                        {p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Phone */}
              <View style={s.sectionTitleRow}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Numéro mobile money</Text>
              </View>
              <View style={[s.fieldCard, phone.length > 4 && !phoneValid && s.fieldCardError]}>
                <Ionicons name="call-outline" size={18} color={c.neutral[500]} />
                <TextInput
                  style={s.phoneInput}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, ''))}
                  placeholder="+225XXXXXXXXXX"
                  placeholderTextColor={c.neutral[400]}
                  keyboardType="phone-pad"
                  maxLength={14}
                  editable={!submitting && kycVerified}
                />
              </View>
              {phone.length > 4 && !phoneValid && (
                <Text style={s.errorHint}>Format attendu : +225 suivi de 10 chiffres.</Text>
              )}

              {/* Info Paystack */}
              <View style={s.infoBox}>
                <View style={s.infoIconWrap}>
                  <Ionicons name="time-outline" size={18} color={c.primary[500]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.infoTitle}>Traitement Paystack</Text>
                  <Text style={s.infoText}>
                    Le solde est réservé immédiatement. En cas d'échec, il est restauré automatiquement.
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Historique des retraits */}
          {history.length > 0 && (
            <View style={s.historyCard}>
              <Text style={s.historyTitle}>Historique des retraits</Text>
              {history.map((h) => {
                const meta = STATUS_META[h.status] ?? STATUS_META.pending;
                return (
                  <View key={h.id} style={s.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.historyAmount}>{formatXOF(h.amount_xof)}</Text>
                      <Text style={s.historyMeta}>
                        {new Date(h.requested_at).toLocaleString('fr-FR', {
                          day: '2-digit', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                        {' · '}
                        {h.provider.toUpperCase()}
                      </Text>
                      {h.failure_reason && (
                        <Text style={s.historyError} numberOfLines={2}>{h.failure_reason}</Text>
                      )}
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                      <Text style={[s.statusText, { color: meta.fg }]}>{meta.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {payable > 0 && (
          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [
                s.payBtn,
                !canSubmit && s.payBtnDisabled,
                pressed && canSubmit && { transform: [{ scale: 0.98 }], opacity: 0.92 },
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-down-circle" size={18} color="#fff" />
                  <Text style={s.payBtnText}>
                    {amountValid ? `Retirer ${formatXOF(amountNum)}` : 'Saisis un montant'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
    emptyTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark, marginTop: spacing.md },
    primaryBtn: {
      backgroundColor: c.primary[500],
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
      borderRadius: radius.full,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },

    kycBanner: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: '#fef3c7', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg,
      borderWidth: 1, borderColor: '#fde68a',
    },
    kycIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#d97706', alignItems: 'center', justifyContent: 'center' },
    kycTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    kycSub: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2 },

    balanceCard: {
      backgroundColor: c.primary[500],
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    balanceLabel: { fontSize: typography.fontSize.xs, color: 'rgba(255,255,255,0.85)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
    balanceValue: { fontSize: typography.fontSize['2xl'], fontWeight: '800', color: '#fff', marginTop: 4 },
    balanceMeta: { marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    balanceMetaItem: { fontSize: typography.fontSize.xs, color: 'rgba(255,255,255,0.9)' },

    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionAccent: { width: 4, height: 16, borderRadius: 2, backgroundColor: c.primary[500] },
    sectionTitle: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },

    fieldCard: {
      flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm,
      backgroundColor: c.light, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.neutral[200],
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    },
    fieldCardError: { borderColor: c.danger },
    amountInput: { flex: 1, fontSize: 28, fontWeight: '700', color: c.dark, padding: 0 },
    amountCurrency: { fontSize: typography.fontSize.base, fontWeight: '700', color: c.neutral[500] },
    phoneInput: { flex: 1, fontSize: typography.fontSize.base, color: c.dark, padding: 0, paddingVertical: 4 },
    errorHint: { marginTop: spacing.xs, fontSize: typography.fontSize.xs, color: c.danger, fontWeight: '600' },

    providerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    providerChip: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      borderRadius: radius.lg, borderWidth: 1.5,
    },
    providerDot: { width: 10, height: 10, borderRadius: 5 },
    providerText: { fontSize: typography.fontSize.sm, fontWeight: '700' },

    infoBox: {
      flexDirection: 'row', gap: spacing.md,
      backgroundColor: c.light, borderRadius: radius.lg, padding: spacing.md,
      marginTop: spacing.xl, borderWidth: 1, borderColor: c.neutral[200],
    },
    infoIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary[50], alignItems: 'center', justifyContent: 'center' },
    infoTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, marginBottom: 2 },
    infoText: { fontSize: typography.fontSize.xs, color: c.neutral[600], lineHeight: 18 },

    historyCard: {
      marginTop: spacing.lg,
      backgroundColor: c.light,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      padding: spacing.md,
    },
    historyTitle: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark, marginBottom: spacing.sm },
    historyRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: spacing.sm,
      borderTopWidth: 1, borderTopColor: c.neutral[100],
    },
    historyAmount: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    historyMeta: { fontSize: 10, color: c.neutral[500], marginTop: 2 },
    historyError: { fontSize: 10, color: c.danger, marginTop: 2 },
    statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
    statusText: { fontSize: 10, fontWeight: '700' },

    footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.neutral[100], backgroundColor: c.light },
    payBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
      backgroundColor: c.primary[500], borderRadius: radius.full, paddingVertical: spacing.lg,
      shadowColor: c.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
    },
    payBtnDisabled: { opacity: 0.4, shadowOpacity: 0 },
    payBtnText: { fontSize: typography.fontSize.base, fontWeight: '700', color: '#fff' },
  });
}
