import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { buildPaymentQr, parsePaymentQr } from '@/lib/qr';
import { ScreenHeader } from '@/components/ScreenHeader';

type Mode = 'scan' | 'myqr';

// Deep link "soutrapaiya://send?phone=+225XXXXXXXXXX" qui pré-remplit l'écran
// Envoyer chez le destinataire. Le scheme est défini dans app.json.
const DEEP_LINK_SCHEME = 'soutrapaiya://send';

export default function Scan() {
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>('scan');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [myName, setMyName] = useState('');
  // Le numéro est résolu en cascade : auth.user.phone -> profiles.phone.
  // Certains comptes (email/OAuth) n'ont pas de auth.user.phone — on doit
  // alors retomber sur profiles.phone pour pouvoir générer le QR.
  const [myPhone, setMyPhone] = useState<string>('');
  // loading distinct du QR : on ne sait pas s'il y a un numéro tant que le
  // profil n'est pas chargé. Sans ce flag, l'UI montrait "Aucun numéro"
  // pendant le chargement initial → bug perçu "le QR n'apparaît pas".
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.id) {
        if (mounted) setProfileLoading(false);
        return;
      }
      try {
        const authPhone = user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '';
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .maybeSingle();
        if (!mounted) return;
        if (error) {
          console.warn('[scan] profile load error:', error);
        }
        const profile = data as { full_name: string | null; phone: string | null } | null;
        // Préfère auth.user.phone (canonique) sinon profiles.phone.
        const resolvedPhone = authPhone || profile?.phone || '';
        setMyPhone(resolvedPhone);
        setMyName(profile?.full_name || '');
      } catch (err) {
        console.warn('[scan] profile fetch failed:', err);
      } finally {
        if (mounted) setProfileLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?.id, user?.phone]);

  const handleScan = (result: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const qr = parsePaymentQr(result.data);
    if (!qr) {
      Alert.alert(
        'QR non reconnu',
        "Ce code n'est pas un QR de paiement Soutra-Playce.",
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
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title="Payer par QR" subtitle="Scanner ou afficher ton code" />

      <View style={s.toggle}>
        <Pressable
          style={({ pressed }) => [s.toggleBtn, mode === 'scan' && s.toggleBtnActive, pressed && { opacity: 0.85 }]}
          onPress={() => switchMode('scan')}
        >
          <Ionicons name="scan-outline" size={16} color={mode === 'scan' ? '#fff' : colors.neutral[600]} />
          <Text style={[s.toggleText, mode === 'scan' && s.toggleTextActive]}>Scanner</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.toggleBtn, mode === 'myqr' && s.toggleBtnActive, pressed && { opacity: 0.85 }]}
          onPress={() => switchMode('myqr')}
        >
          <Ionicons name="qr-code" size={16} color={mode === 'myqr' ? '#fff' : colors.neutral[600]} />
          <Text style={[s.toggleText, mode === 'myqr' && s.toggleTextActive]}>Mon QR</Text>
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
        <MyQrArea phone={myPhone} name={myName} loading={profileLoading} router={router} />
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
          <Text style={s.scanHint}>Vise un QR de paiement Soutra-Playce</Text>
        </View>
      </View>
    </View>
  );
}

function MyQrArea({
  phone,
  name,
  loading,
  router,
}: {
  phone: string;
  name: string;
  loading: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  // État loading : on attend la résolution du profil pour décider quoi
  // afficher. Évite le faux négatif "Aucun numéro" pendant le chargement.
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={s.permText}>Préparation de ton QR…</Text>
      </View>
    );
  }

  // Aucun numéro disponible : on l'explique et on offre une porte de sortie
  // vers le profil pour saisir un numéro.
  if (!phone) {
    return (
      <View style={s.center}>
        <Ionicons name="phone-portrait-outline" size={56} color={colors.neutral[400]} />
        <Text style={s.permTitle}>Aucun numéro associé</Text>
        <Text style={s.permText}>
          Ton compte n'a pas de numéro de téléphone enregistré.
          {'\n'}Ajoute-le pour générer ton QR de paiement.
        </Text>
        <Pressable
          style={s.permBtn}
          onPress={() => router.push('/profile-edit' as any)}
        >
          <Text style={s.permBtnText}>Compléter mon profil</Text>
        </Pressable>
      </View>
    );
  }

  // Payload encodé dans le QR (lu côté scanner par parsePaymentQr).
  const qrValue = buildPaymentQr({ phone, name: name || undefined });
  // Lien partageable hors de l'app (SMS, WhatsApp, copier-coller).
  const shareLink = `${DEEP_LINK_SCHEME}?phone=${encodeURIComponent(phone)}`;
  const shareMessage = name
    ? `Envoie-moi un paiement Soutra-Playce :\n${shareLink}\nNuméro : ${phone}`
    : `Envoie-moi un paiement Soutra-Playce :\n${shareLink}`;

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(shareLink);
      Alert.alert('Lien copié', 'Le lien de paiement est dans ton presse-papier.');
    } catch (err: any) {
      Alert.alert('Échec', err?.message ?? 'Impossible de copier le lien.');
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: shareMessage });
    } catch (err: any) {
      Alert.alert('Échec', err?.message ?? 'Impossible de partager.');
    }
  };

  return (
    <View style={s.myQrWrap}>
      <View style={s.qrCard}>
        <View style={s.qrCardInner}>
          {/* react-native-qrcode-svg crash si value est vide ; on s'est
              déjà assuré qu'on a un phone à ce stade.
              Wrapping try/catch impossible côté JSX → on garantit
              l'invariant (phone non vide) en amont via le branch loading
              et le fallback "Aucun numéro associé". */}
          <QRCode value={qrValue} size={220} />
        </View>
        {!!name && <Text style={s.qrName}>{name}</Text>}
        <Text style={s.qrPhone}>{phone}</Text>
      </View>

      {/* Actions : copier le lien + partager */}
      <View style={s.qrActions}>
        <Pressable
          onPress={handleCopy}
          style={({ pressed }) => [s.qrActionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        >
          <Ionicons name="copy-outline" size={18} color={colors.primary[600]} />
          <Text style={s.qrActionText}>Copier le lien</Text>
        </Pressable>
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [s.qrActionBtn, s.qrActionBtnPrimary, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
        >
          <Ionicons name="share-social-outline" size={18} color="#fff" />
          <Text style={[s.qrActionText, { color: '#fff' }]}>Partager</Text>
        </Pressable>
      </View>

      <View style={s.qrHintBox}>
        <Ionicons name="information-circle" size={18} color={colors.primary[500]} />
        <Text style={s.qrHint}>Fais scanner ce code pour recevoir de l'argent.</Text>
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

  // Actions copier / partager — visibles uniquement quand le QR est rendu.
  qrActions: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  qrActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: '#fff', borderRadius: radius.full,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderWidth: 1.5, borderColor: colors.primary[500],
  },
  qrActionBtnPrimary: {
    backgroundColor: colors.primary[500], borderColor: colors.primary[500],
    shadowColor: colors.primary[500], shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  qrActionText: { fontSize: typography.fontSize.sm, fontWeight: '700', color: colors.primary[600] },

  qrHintBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.primary[50], paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  qrHint: { fontSize: typography.fontSize.xs, color: colors.primary[700], fontWeight: '600' },
});
