import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { buildPaymentQr, parsePaymentQr } from '@/lib/qr';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useI18n } from '@/lib/i18n';

type Mode = 'scan' | 'myqr';

/**
 * Écran QR de paiement Soutra-Playce.
 *
 * Historique : avant correctif, `react-native-svg` était absent du
 * package.json alors que `react-native-qrcode-svg` (utilisé ici pour
 * afficher "Mon QR") en a besoin comme peer dep. Résultat : un crash JS
 * silencieux au mount de l'écran → page blanche.
 *
 * Correctif appliqué :
 *   1. `react-native-svg` ajouté au package.json
 *   2. ErrorBoundary local qui affiche un fallback lisible au lieu d'un blank
 *      si une erreur survient sur ce sous-arbre (caméra, SVG, navigation…).
 *   3. Try/catch sur tout le pipeline scan (parse → validation → navigation)
 *      pour qu'aucune exception ne fasse crasher l'UI.
 *   4. Logs détaillés à chaque étape clé.
 */
export default function ScanRoute() {
  const { t } = useI18n();
  return (
    <ErrorBoundary
      zone="scan"
      fallbackMessage={t('scan.fallback')}
    >
      <Scan />
    </ErrorBoundary>
  );
}

function Scan() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('scan');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [myName, setMyName] = useState('');

  const myPhone = user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '';

  useEffect(() => {
    console.log('[QR Scanner] Screen mounted, mode =', mode);
    return () => {
      console.log('[QR Scanner] Screen unmounted');
    };
    // log au premier mount uniquement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        if (error) {
          console.warn('[QR Scanner] profile load error:', error.message);
          return;
        }
        if (mounted) setMyName((data as any)?.full_name || '');
      } catch (err) {
        console.error('[QR Scanner] profile load exception:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleScan = (result: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    console.log('[QR Scanner] QR Detected');
    console.log('[QR Scanner] QR Data:', result?.data?.slice(0, 200));

    try {
      const qr = parsePaymentQr(result.data);
      if (!qr) {
        console.log('[QR Scanner] QR rejected: unrecognized format');
        Alert.alert(
          t('scan.unrecTitle'),
          t('scan.unrecBody'),
          [
            { text: t('scan.retry'), onPress: () => setScanned(false) },
            { text: t('scan.cancel'), style: 'cancel', onPress: () => router.back() },
          ],
        );
        return;
      }
      if (qr.phone === myPhone) {
        console.log('[QR Scanner] QR rejected: self-payment');
        Alert.alert(t('scan.ownTitle'), t('scan.ownBody'), [
          { text: t('scan.ok'), onPress: () => setScanned(false) },
        ]);
        return;
      }

      // QR valide : on ouvre l'écran Envoyer pré-rempli.
      console.log('[QR Scanner] Navigation Success → /send with phone', qr.phone);
      router.replace({
        pathname: '/send',
        params: {
          phone: qr.phone,
          ...(qr.amount ? { amount: String(qr.amount) } : {}),
        },
      });
    } catch (err) {
      console.error('[QR Scanner] handleScan exception:', err);
      Alert.alert(
        t('scan.error'),
        t('scan.unreadable'),
        [{ text: t('scan.ok'), onPress: () => setScanned(false) }],
      );
    }
  };

  const switchMode = (m: Mode) => {
    console.log('[QR Scanner] switch mode →', m);
    setScanned(false);
    setMode(m);
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={t('scan.title')} subtitle={t('scan.subtitle')} />

      <View style={s.toggle}>
        <Pressable
          style={({ pressed }) => [s.toggleBtn, mode === 'scan' && s.toggleBtnActive, pressed && { opacity: 0.85 }]}
          onPress={() => switchMode('scan')}
        >
          <Ionicons name="scan-outline" size={16} color={mode === 'scan' ? '#fff' : colors.neutral[600]} />
          <Text style={[s.toggleText, mode === 'scan' && s.toggleTextActive]}>{t('scan.scan')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.toggleBtn, mode === 'myqr' && s.toggleBtnActive, pressed && { opacity: 0.85 }]}
          onPress={() => switchMode('myqr')}
        >
          <Ionicons name="qr-code" size={16} color={mode === 'myqr' ? '#fff' : colors.neutral[600]} />
          <Text style={[s.toggleText, mode === 'myqr' && s.toggleTextActive]}>{t('scan.myQr')}</Text>
        </Pressable>
      </View>

      {mode === 'scan' ? (
        <ScanArea
          permission={permission}
          requestPermission={requestPermission}
          scanned={scanned}
          onScan={handleScan}
        />
      ) : (
        <MyQrArea phone={myPhone} name={myName} />
      )}
    </SafeAreaView>
  );
}

function ScanArea({
  permission,
  requestPermission,
  scanned,
  onScan,
}: {
  permission: { granted: boolean } | null;
  requestPermission: () => void;
  scanned: boolean;
  onScan: (r: { data: string }) => void;
}) {
  const { t } = useI18n();
  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    );
  }
  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Ionicons name="camera-outline" size={56} color={colors.neutral[400]} />
        <Text style={s.permTitle}>{t('scan.permTitle')}</Text>
        <Text style={s.permText}>
          {t('scan.permBody')}
        </Text>
        <Pressable
          style={s.permBtn}
          onPress={() => {
            console.log('[QR Scanner] Requesting camera permission');
            try {
              requestPermission();
            } catch (err) {
              console.error('[QR Scanner] requestPermission exception:', err);
              Alert.alert(
                t('scan.error'),
                t('scan.permFail'),
              );
            }
          }}
        >
          <Text style={s.permBtnText}>{t('scan.allow')}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={s.cameraWrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : onScan}
      />
      {/* Overlay sombre avec un trou rectangulaire au centre */}
      <View style={s.overlay} pointerEvents="none">
        <View style={s.scanFrame}>
          {/* 4 coins du cadre */}
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
        </View>
        <View style={s.scanHintWrap}>
          <Ionicons name="qr-code" size={16} color="#fff" />
          <Text style={s.scanHint}>{t('scan.hint')}</Text>
        </View>
      </View>
    </View>
  );
}

function MyQrArea({ phone, name }: { phone: string; name: string }) {
  const { t } = useI18n();
  if (!phone) {
    return (
      <View style={s.center}>
        <Text style={s.permText}>{t('scan.noPhone')}</Text>
      </View>
    );
  }
  // Construit la charge utile une seule fois — si elle est invalide, on log
  // mais on ne crashe pas l'écran (ErrorBoundary couvrirait une exception
  // sur QRCode, mais buildPaymentQr est pur).
  let payload = '';
  try {
    payload = buildPaymentQr({ phone, name: name || undefined });
  } catch (err) {
    console.error('[QR Scanner] buildPaymentQr exception:', err);
  }

  return (
    <View style={s.myQrWrap}>
      <View style={s.qrCard}>
        <View style={s.qrCardInner}>
          {payload ? (
            <QRCode value={payload} size={220} />
          ) : (
            <Text style={s.permText}>{t('scan.qrUnavailable')}</Text>
          )}
        </View>
        {!!name && <Text style={s.qrName}>{name}</Text>}
        <Text style={s.qrPhone}>{phone}</Text>
      </View>
      <View style={s.qrHintBox}>
        <Ionicons name="information-circle" size={18} color={colors.primary[500]} />
        <Text style={s.qrHint}>{t('scan.qrHint')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.light },
  toggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.full,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  toggleBtnActive: { backgroundColor: colors.primary[500] },
  toggleText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.neutral[600] },
  toggleTextActive: { color: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  permTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark, textAlign: 'center' },
  permText: { fontSize: typography.fontSize.sm, color: colors.neutral[600], textAlign: 'center' },
  permBtn: {
    marginTop: spacing.sm, backgroundColor: colors.primary[500],
    borderRadius: radius.full, paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
    shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  cameraWrap: {
    flex: 1,
    marginHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.lg,
    borderRadius: 24, overflow: 'hidden', backgroundColor: '#000',
  },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 250, height: 250, position: 'relative' },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scanHintWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.xl, backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  scanHint: { color: '#fff', fontSize: typography.fontSize.sm, fontWeight: '600' },
  myQrWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  qrCard: {
    backgroundColor: '#fff', padding: spacing.lg, borderRadius: 24,
    alignItems: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
  },
  qrCardInner: { backgroundColor: '#fff', padding: spacing.md, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.primary[500] },
  qrName: { marginTop: spacing.md, fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  qrPhone: { marginTop: 4, fontSize: typography.fontSize.base, color: colors.neutral[600], fontFamily: 'monospace' },
  qrHintBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary[50], paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  qrHint: { fontSize: typography.fontSize.xs, color: colors.primary[700], fontWeight: '600' },
});
