import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { radius, spacing, typography, formatXOF, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { payForActivity, payForTrip, type TripPayKind } from '@/lib/geniuspay';

/**
 * Boutons de paiement d'une réservation voyage / activité (GeniusPay, page web sécurisée).
 * Le montant réellement débité est calculé par le serveur ; ici on n'affiche que des repères.
 */
export function BookingPay({ kind, bookingId, total, paid, depositPct, onDone }: {
  kind: 'trip' | 'activity'; bookingId: string; total: number; paid: number; depositPct: number; onDone: () => void;
}) {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);
  const [busy, setBusy] = useState<string | null>(null);

  async function pay(k: TripPayKind) {
    setBusy(k);
    try {
      const r = kind === 'trip' ? await payForTrip(bookingId, k) : await payForActivity(bookingId);
      if (r.status === 'success') Alert.alert('Paiement confirmé', 'Merci ! Votre billet est disponible dans « Mes voyages et activités ».');
      else if (r.status === 'failed') Alert.alert('Paiement échoué', 'Aucun montant n’a été débité. Vous pouvez réessayer.');
      else Alert.alert('Paiement en cours', 'Nous attendons la confirmation de l’opérateur. Votre billet apparaîtra dès qu’elle arrive.');
      onDone();
    } catch (e: any) {
      Alert.alert('Paiement impossible', e?.message ? String(e.message) : 'Réessayez dans un instant.');
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
          <Btn k="full" primary label={`Payer ${formatXOF(total)}`} />
          {kind === 'trip' && depositPct < 100 && <Btn k="deposit" label={`Acompte ${depositPct} % · ${formatXOF(deposit)}`} />}
        </>
      ) : <Btn k="balance" primary label={`Payer le solde ${formatXOF(due)}`} />}
      <Text style={s.note}>Paiement sécurisé GeniusPay (Orange Money, MTN MoMo, Wave, carte).</Text>
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
