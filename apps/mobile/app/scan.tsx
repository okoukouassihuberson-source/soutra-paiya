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

type Mode = 'scan' | 'myqr';

export default function Scan() {
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('scan');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [myName, setMyName] = useState('');

  const myPhone = user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '';

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      if (mounted) setMyName((data as any)?.full_name || '');
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const handleScan = (result: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const qr = parsePaymentQr(result.data);
    if (!qr) {
      Alert.alert(
        'QR non reconnu',
        "Ce code n'est pas un QR de paiement Soutra-Paiya.",
        [
          { text: 'Réessayer', onPress: () => setScanned(false) },
          { text: 'Annuler', style: 'cancel', onPress: () => router.back() },
        ],
      );
      return;
    }
    if (qr.phone === myPhone) {
      Alert.alert('Ton propre QR', 'Tu ne peux pas te payer toi-même.', [
        { text: 'OK', onPress: () => setScanned(false) },
      ]);
      return;
    }

    // QR valide : on ouvre l'écran Envoyer pré-rempli.
    router.replace({
      pathname: '/send',
      params: {
        phone: qr.phone,
        ...(qr.amount ? { amount: String(qr.amount) } : {}),
      },
    });
  };

  const switchMode = (m: Mode) => {
    setScanned(false);
    setMode(m);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>Payer par QR</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={s.toggle}>
        <Pressable
          style={[s.toggleBtn, mode === 'scan' && s.toggleBtnActive]}
          onPress={() => switchMode('scan')}
        >
          <Text style={[s.toggleText, mode === 'scan' && s.toggleTextActive]}>
            Scanner
          </Text>
        </Pressable>
        <Pressable
          style={[s.toggleBtn, mode === 'myqr' && s.toggleBtnActive]}
          onPress={() => switchMode('myqr')}
        >
          <Text style={[s.toggleText, mode === 'myqr' && s.toggleTextActive]}>
            Mon QR
          </Text>
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
        <Text style={s.permTitle}>Accès à la caméra requis</Text>
        <Text style={s.permText}>
          Autorise la caméra pour scanner les QR codes de paiement.
        </Text>
        <Pressable style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Autoriser la caméra</Text>
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
      <View style={s.overlay} pointerEvents="none">
        <View style={s.scanFrame} />
        <Text style={s.scanHint}>Vise un QR de paiement Soutra-Paiya</Text>
      </View>
    </View>
  );
}

function MyQrArea({ phone, name }: { phone: string; name: string }) {
  if (!phone) {
    return (
      <View style={s.center}>
        <Text style={s.permText}>Aucun numéro associé à ton compte.</Text>
      </View>
    );
  }
  return (
    <View style={s.center}>
      <View style={s.qrCard}>
        <QRCode value={buildPaymentQr({ phone, name: name || undefined })} size={220} />
      </View>
      {!!name && <Text style={s.qrName}>{name}</Text>}
      <Text style={s.qrPhone}>{phone}</Text>
      <Text style={s.qrHint}>
        Fais scanner ce code pour recevoir de l'argent sur ton wallet.
      </Text>
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
  toggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.full,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: colors.primary[500] },
  toggleText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.neutral[600] },
  toggleTextActive: { color: '#fff' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permTitle: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  permText: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[600],
    textAlign: 'center',
  },
  permBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary[500],
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: typography.fontSize.base },
  cameraWrap: {
    flex: 1,
    margin: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: {
    width: 230,
    height: 230,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  scanHint: {
    marginTop: spacing.lg,
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  qrCard: {
    backgroundColor: '#fff',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
  },
  qrName: { fontSize: typography.fontSize.lg, fontWeight: '700', color: colors.dark },
  qrPhone: { fontSize: typography.fontSize.base, color: colors.neutral[600] },
  qrHint: {
    fontSize: typography.fontSize.sm,
    color: colors.neutral[500],
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
