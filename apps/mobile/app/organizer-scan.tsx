import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { formatXOF, radius, spacing, typography, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useI18n, type TKey } from '@/lib/i18n';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Banner, Btn } from '@/components/organizer/OrgUi';
import { orgTones } from '@/lib/organizer-theme';
import { validateTicket, type ScanResult } from '@/lib/organizer';

/** /organizer-scan — validation des billets (voyage / activité) à l'embarquement : caméra ou saisie du code. */
export default function OrganizerScanScreen() {
  const c = useColors();
  const { t } = useI18n();
  const k = useMemo(() => orgTones(c), [c]);
  const s = useMemo(() => makeStyles(c, k), [c, k]);
  const [perm, requestPerm] = useCameraPermissions();
  const [cam, setCam] = useState(false);
  const [code, setCode] = useState('');
  const [res, setRes] = useState<ScanResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);

  async function validate(raw: string) {
    if (busy.current) return;
    busy.current = true; setErr(null); setCam(false);
    try { setRes(await validateTicket(raw)); }
    catch (e: any) {
      setRes(null);
      setErr(e?.message === 'INVALID_QR' ? t('org.scanScreen.invalid') : e?.message === 'NOT_AUTHORIZED' ? t('org.scanScreen.notYours') : t('org.scanScreen.failed'));
    } finally { busy.current = false; }
  }
  const startCam = async () => {
    setRes(null); setErr(null);
    if (!perm?.granted) { const r = await requestPerm(); if (!r.granted) return; }
    setCam(true);
  };
  const reason = res && !res.ok ? (res.error && ['UNKNOWN_TICKET', 'ALREADY_USED', 'NOT_PAID', 'OUT_OF_WINDOW'].includes(res.error) ? t(`org.scanScreen.e.${res.error}` as TKey) : t('org.scanScreen.refused')) : '';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={t('org.scanScreen.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
        {cam ? (
          <View style={s.camBox}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => validate(data)} />
            <Text style={s.aim}>{t('org.scanScreen.aim')}</Text>
          </View>
        ) : (
          <Btn kind="primary" label={`📷 ${t('org.scanScreen.camera')}`} onPress={startCam} />
        )}
        {perm && !perm.granted && !perm.canAskAgain && <Banner ok={false} text={t('org.scanScreen.permBody')} />}

        <View style={s.manual}>
          <TextInput value={code} onChangeText={setCode} placeholder={t('org.scanScreen.manual')} placeholderTextColor={c.neutral[400]} autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel={t('org.scanScreen.manual')} />
          <Btn label={t('org.scanScreen.validate')} onPress={() => validate(code)} />
        </View>

        {err && <Banner ok={false} text={err} />}
        {res && (
          <View accessibilityRole="alert" style={[s.result, { backgroundColor: (res.ok ? k.ok : k.err).bg }]}>
            <Text style={[s.resultTitle, { color: (res.ok ? k.ok : k.err).fg }]}>{res.ok ? t('org.scanScreen.valid') : `${t('org.scanScreen.refused')} — ${reason}`}</Text>
            {!!res.traveler && <Text style={s.resultLine}>{res.traveler}</Text>}
            {res.ok && <Text style={s.resultLine}>{res.trip ?? res.activity} · {res.reference} · {t('org.pers', { n: res.participants ?? 0 })}</Text>}
            {res.ok && !!res.balance_due_xof && <Text style={[s.resultLine, { color: k.warn, fontWeight: '800' }]}>{t('org.scanScreen.balance', { amount: formatXOF(res.balance_due_xof) })}</Text>}
            <View style={{ marginTop: spacing.sm }}><Btn label={t('org.scanScreen.again')} onPress={() => { setRes(null); setCode(''); startCam(); }} /></View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette, k: ReturnType<typeof orgTones>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    camBox: { height: 320, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000', justifyContent: 'flex-end' },
    aim: { color: '#fff', textAlign: 'center', padding: spacing.sm, backgroundColor: 'rgba(0,0,0,0.5)', fontSize: typography.fontSize.sm },
    manual: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    input: { flex: 1, backgroundColor: k.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[200], paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.fontSize.base, color: c.dark },
    result: { borderRadius: radius.lg, padding: spacing.md, gap: 4 },
    resultTitle: { fontSize: typography.fontSize.lg, fontWeight: '800' },
    resultLine: { fontSize: typography.fontSize.sm, color: k.resultText },
  });
}
