import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { typography, radius, spacing, formatXOF, type ColorPalette } from '@soutra/shared';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Skeleton } from '@/components/Skeleton';
import { loadReceiptContext, shareReceipt, type ReceiptContext } from '@/lib/receipts';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [ctx, setCtx] = useState<ReceiptContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    if (!id || !user?.id) { setLoading(false); return; }
    try {
      const res = await loadReceiptContext(id, user.id);
      setCtx(res);
    } catch (err: any) {
      console.error('[transaction] load:', err);
      Alert.alert(
        'Transaction introuvable',
        err?.message === 'TRANSACTION_NOT_FOUND'
          ? "Cette transaction n'existe pas ou tu n'y as pas accès."
          : err?.message ?? 'Impossible de charger la transaction.',
      );
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const onShare = async () => {
    if (!ctx) return;
    try {
      setSharing(true);
      await shareReceipt(ctx);
    } catch (err: any) {
      // Sur Android, l'utilisateur qui ferme la sheet sans choisir n'est pas
      // une erreur fonctionnelle — on log mais on n'alerte pas.
      const msg = err?.message ?? '';
      if (!msg.toLowerCase().includes('cancel')) {
        Alert.alert('Erreur', msg || 'Impossible de générer le reçu PDF.');
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Détail de la transaction" />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        {loading ? (
          <View>
            <Skeleton width="100%" height={180} borderRadius={20} />
            <View style={{ height: spacing.lg }} />
            <Skeleton width="100%" height={220} borderRadius={16} />
          </View>
        ) : ctx ? (
          <>
            {/* Hero recap */}
            <View style={[s.hero, { backgroundColor: ctx.isCredit ? c.success : c.primary[500] }]}>
              <View style={s.bgCircle1} />
              <View style={s.bgCircle2} />

              <Text style={s.heroLabel}>{ctx.isCredit ? 'Montant reçu' : 'Montant payé'}</Text>
              <Text style={s.heroAmount}>
                {ctx.isCredit ? '+' : '−'}{formatXOF(ctx.transaction.amount_xof)}
              </Text>
              <Text style={s.heroType}>{typeLabel(ctx.transaction.type, ctx.isCredit)}</Text>

              <View style={[s.statusPill, statusPillStyle(ctx.transaction.status)]}>
                <Ionicons name={statusIcon(ctx.transaction.status)} size={12} color="#fff" />
                <Text style={s.statusText}>{statusLabel(ctx.transaction.status)}</Text>
              </View>
            </View>

            {/* Détails */}
            <View style={s.section}>
              <View style={s.sectionTitleRow}>
                <View style={s.sectionAccent} />
                <Text style={s.sectionTitle}>Détails</Text>
              </View>
              <View style={s.card}>
                <Row c={c} label="Date" value={formatDateTime(ctx.transaction.completed_at ?? ctx.transaction.created_at)} />
                <Row c={c} label="Titulaire" value={ctx.user.name} sub={ctx.user.phone ?? undefined} />
                {ctx.counterparty && (
                  <Row
                    c={c}
                    label={ctx.isCredit ? 'Expéditeur' : 'Destinataire'}
                    value={ctx.counterparty.name}
                    sub={ctx.counterparty.phone ?? undefined}
                  />
                )}
                <Row c={c} label="Moyen" value={providerLabel(ctx.transaction.provider)} />
                {ctx.transaction.fee_xof > 0 && (
                  <Row c={c} label="Frais" value={formatXOF(ctx.transaction.fee_xof)} />
                )}
                {ctx.transaction.description && (
                  <Row c={c} label="Motif" value={ctx.transaction.description} />
                )}
                {ctx.transaction.provider_ref && (
                  <Row c={c} label="Réf. fournisseur" value={ctx.transaction.provider_ref} mono />
                )}
                <Row c={c} label="Identifiant" value={ctx.transaction.id} mono last />
              </View>
            </View>

            {/* CTA partage */}
            <Pressable
              disabled={sharing}
              onPress={onShare}
              style={({ pressed }) => [
                s.shareBtn,
                { backgroundColor: sharing ? c.neutral[300] : c.primary[500] },
                pressed && !sharing && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              {sharing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={20} color="#fff" />
                  <Text style={s.shareBtnText}>Partager le reçu PDF</Text>
                </>
              )}
            </Pressable>

            <Text style={s.hint}>
              Le reçu est généré localement et fait foi de l'opération réalisée. Tu peux l'enregistrer,
              le partager par mail, WhatsApp, ou l'imprimer.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  c,
  label,
  value,
  sub,
  mono,
  last,
}: {
  c: ColorPalette;
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  last?: boolean;
}) {
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowValueWrap}>
        <Text
          style={[
            s.rowValue,
            mono && { fontFamily: 'Menlo', fontSize: typography.fontSize.xs },
          ]}
          numberOfLines={mono ? 2 : 3}
        >
          {value}
        </Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case 'success': return 'Réussi';
    case 'pending': return 'En cours';
    case 'failed': return 'Échec';
    case 'reversed': return 'Annulée';
    default: return s;
  }
}

function statusIcon(s: string): keyof typeof Ionicons.glyphMap {
  switch (s) {
    case 'success': return 'checkmark-circle';
    case 'pending': return 'time';
    case 'failed': case 'reversed': return 'close-circle';
    default: return 'help-circle';
  }
}

function statusPillStyle(s: string) {
  if (s === 'success') return { backgroundColor: 'rgba(0,184,148,0.5)' };
  if (s === 'pending') return { backgroundColor: 'rgba(255,201,60,0.6)' };
  return { backgroundColor: 'rgba(230,57,70,0.5)' };
}

function typeLabel(t: string, isCredit: boolean): string {
  switch (t) {
    case 'topup': return 'Rechargement du wallet';
    case 'withdraw': return 'Retrait vers Mobile Money';
    case 'payment': return 'Paiement';
    case 'transfer': return isCredit ? 'Transfert reçu' : 'Transfert envoyé';
    case 'refund': return 'Remboursement';
    case 'split': return "Partage d'addition";
    case 'escrow_hold': return 'Séquestre (réservation)';
    case 'escrow_release': return 'Libération du séquestre';
    case 'fee': return 'Frais de service';
    default: return t;
  }
}

function providerLabel(p: string | null): string {
  switch (p) {
    case 'orange': return 'Orange Money';
    case 'mtn': return 'MTN Mobile Money';
    case 'wave': return 'Wave';
    case 'moov': return 'Moov Money';
    case 'card': return 'Carte bancaire';
    case 'wallet': return 'Wallet Soutra-Pay';
    case 'cinetpay': return 'CinetPay';
    default: return p ?? '—';
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },

    hero: {
      position: 'relative',
      overflow: 'hidden',
      padding: spacing.lg,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
    bgCircle1: { position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.10)' },
    bgCircle2: { position: 'absolute', bottom: -40, left: -40, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.06)' },

    heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: typography.fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    heroAmount: { color: '#fff', fontSize: 38, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
    heroType: { color: 'rgba(255,255,255,0.95)', fontSize: typography.fontSize.sm, fontWeight: '600', marginTop: 2 },

    statusPill: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, marginTop: spacing.md },
    statusText: { color: '#fff', fontSize: typography.fontSize.xs, fontWeight: '700', letterSpacing: 0.4 },

    section: { marginTop: spacing.xl },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: c.primary[500] },
    sectionTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: c.dark },

    card: {
      backgroundColor: c.neutral[50],
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: c.neutral[100],
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    rowLabel: { fontSize: typography.fontSize.xs, color: c.neutral[500], fontWeight: '600', flex: 0 },
    rowValueWrap: { flex: 1, alignItems: 'flex-end' },
    rowValue: { fontSize: typography.fontSize.sm, color: c.dark, fontWeight: '600', textAlign: 'right' },
    rowSub: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: 2, textAlign: 'right' },

    shareBtn: {
      marginTop: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.full,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    shareBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },

    hint: { fontSize: typography.fontSize.xs, color: c.neutral[500], marginTop: spacing.md, textAlign: 'center', lineHeight: 17 },
  });
}
