import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { radius, spacing, typography, formatXOF, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { payForActivity, payForTrip, type TripPayKind } from '@/lib/geniuspay';

/**
 * Boutons de paiement d'une réservation voyage / activité (GeniusPay, page web sécurisée).
 * Le montant réellement débité est calculé par le serveur ; ici on n'affiche que des repères.
 */
export function BookingPay({ kind, bookingId, total, paid, depositPct, onDone }: {
  kind: 'trip' | 'activity'; bookingId: string; total: number; paid: number; depositPct: number; onDone: () => void;
}) {
  const c = useColors();
  const { t } = useI18n();
  const s = useMemo(() => makeStyles(c), [c]);
  const [busy, setBusy] = useState<string | null>(null);

  async function pay(k: TripPayKind) {
    setBusy(k);
    try {
      const r = kind === 'trip' ? await payForTrip(bookingId, k) : await payForActivity(bookingId);
      if (r.status === 'success') Alert.alert(t('pay.okTitle'), t('pay.okBody'));
      else if (r.status === 'failed') Alert.alert(t('pay.failTitle'), t('pay.failBody'));
      else Alert.alert(t('pay.pendingTitle'), t('pay.pendingBody'));
      onDone();
    } catch (e: any) {
      Alert.alert(t('pay.errTitle'), e?.message ? String(e.message) : t('pay.errBody'));
    } finally { setBusy(null); }
  }

  const due = total - paid;
  const deposit = Math.ceil((total * depositPct) / 100);
  const Btn = ({ k, label, primary }: { k: TripPayKind; label: string; primary?: boolean }) => (
    <Pressable disabled={!!busy} onPress={() => pay(k)} accessibilityRole="button" style={[s.btn, primary ? s.primary : s.secondary, busy ? { opacity: 0.6 } : null]}>
      {busy === k ? <ActivityIndicator color={primary ? '#fff' : c.primary[600]} /> : <Text style={[s.btnText, !primary && { color: c.primary[600] }]}>{label}</Text>}
    </Pressable>
  );
  return (
    <View style={s.wrap}>
      {paid === 0 ? (
        <>
          <Btn k="full" primary label={t('pay.full', { amount: formatXOF(total) })} />
          {kind === 'trip' && depositPct < 100 && <Btn k="deposit" label={t('pay.deposit', { pct: depositPct, amount: formatXOF(deposit) })} />}
        </>
      ) : <Btn k="balance" primary label={t('pay.balance', { amount: formatXOF(due) })} />}
      <Text style={s.note}>{t('pay.secure')}</Text>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: spacing.sm },
    btn: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    primary: { backgroundColor: c.primary[500] },
    secondary: { borderWidth: 1.5, borderColor: c.primary[500] },
    btnText: { color: '#fff', fontWeight: '800', fontSize: typography.fontSize.base },
    note: { fontSize: 12, color: c.neutral[500], textAlign: 'center' },
  });
}
