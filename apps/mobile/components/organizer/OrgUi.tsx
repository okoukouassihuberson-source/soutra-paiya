import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet, ActivityIndicator, Alert, Platform, type KeyboardTypeOptions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { radius, spacing, typography, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { uploadTourismImage } from '@/lib/organizer';

export function useOrgStyles() {
  const c = useColors();
  return { c, s: useMemo(() => makeStyles(c), [c]) };
}

export function Field({ label, value, onChange, multiline, keyboard, placeholder, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean; keyboard?: KeyboardTypeOptions; placeholder?: string; maxLength?: number;
}) {
  const { c, s } = useOrgStyles();
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} multiline={multiline} keyboardType={keyboard} placeholder={placeholder} maxLength={maxLength}
        placeholderTextColor={c.neutral[400]} textAlignVertical={multiline ? 'top' : 'center'} autoCapitalize={keyboard ? 'none' : 'sentences'}
        style={[s.input, multiline && { minHeight: 84 }]} accessibilityLabel={label} />
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange, disabled }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  const { c, s } = useOrgStyles();
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} disabled={disabled} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: active, disabled }}
            style={[s.chip, active && { backgroundColor: c.primary[500], borderColor: c.primary[500] }, disabled && { opacity: 0.6 }]}>
            <Text style={[s.chipText, active && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date());

/** Sélecteur de date natif ; la valeur est une chaîne AAAA-MM-JJ. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { c, s } = useOrgStyles();
  const { intl } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Pressable onPress={() => setShow(true)} style={[s.input, s.dateBtn]} accessibilityRole="button" accessibilityLabel={label}>
        <Ionicons name="calendar-outline" size={18} color={c.neutral[500]} />
        <Text style={{ color: value ? c.dark : c.neutral[400], fontSize: typography.fontSize.base }}>
          {value ? fromIso(value).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
        </Text>
      </Pressable>
      {show && (
        <DateTimePicker value={fromIso(value)} mode="date" onChange={(_e, d) => { setShow(Platform.OS === 'ios'); if (d) onChange(iso(d)); }} />
      )}
    </View>
  );
}

/** Image unique (couverture) ou galerie : sélection, compression (qualité 0.7) puis envoi vers le bucket tourism-media. */
export function ImageField({ label, userId, urls, onChange, multiple }: { label: string; userId: string; urls: string[]; onChange: (urls: string[]) => void; multiple?: boolean }) {
  const { c, s } = useOrgStyles();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(t('org.img.add'), t('org.img.permBody')); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true, allowsEditing: !multiple, aspect: [16, 9] });
    const b64 = res.canceled ? null : res.assets[0]?.base64;
    if (!b64) return;
    setBusy(true);
    try {
      const url = await uploadTourismImage(userId, b64);
      onChange(multiple ? [...urls, url] : [url]);
    } catch (e: any) {
      Alert.alert(t('org.img.add'), e?.message === 'IMAGE_TOO_BIG' ? t('org.img.tooBig') : t('org.img.fail'));
    } finally { setBusy(false); }
  }
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={s.imgRow}>
        {urls.map((u) => (
          <View key={u}>
            <Image source={{ uri: u }} style={s.thumb} />
            <Pressable onPress={() => onChange(urls.filter((x) => x !== u))} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('org.img.remove')} style={s.thumbX}>
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {(multiple || urls.length === 0) && (
          <Pressable onPress={pick} disabled={busy} accessibilityRole="button" style={[s.thumb, s.addThumb]}>
            {busy ? <ActivityIndicator color={c.primary[500]} /> : <Ionicons name="add" size={26} color={c.primary[500]} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function Kpi({ label, value }: { label: string; value: string | number }) {
  const { s } = useOrgStyles();
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function Pill({ text, tone }: { text: string; tone: 'amber' | 'green' | 'blue' | 'grey' | 'red' | 'orange' }) {
  const { s } = useOrgStyles();
  const t = TONES[tone];
  return <View style={[s.pill, { backgroundColor: t.bg }]}><Text style={[s.pillText, { color: t.fg }]}>{text}</Text></View>;
}
const TONES = {
  amber: { bg: '#FEF3C7', fg: '#92400E' }, green: { bg: '#D1FAE5', fg: '#065F46' }, blue: { bg: '#DBEAFE', fg: '#1E40AF' },
  grey: { bg: '#E5E7EB', fg: '#374151' }, red: { bg: '#FEE2E2', fg: '#B91C1C' }, orange: { bg: '#FFEDD5', fg: '#9A3412' },
} as const;

export function Btn({ label, onPress, kind = 'neutral', disabled, busy }: { label: string; onPress: () => void; kind?: 'primary' | 'green' | 'neutral' | 'danger'; disabled?: boolean; busy?: boolean }) {
  const { c, s } = useOrgStyles();
  const bg = kind === 'primary' ? c.primary[500] : kind === 'green' ? '#059669' : kind === 'danger' ? '#DC2626' : c.neutral[100];
  const fg = kind === 'neutral' ? c.dark : '#fff';
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" style={({ pressed }) => [s.btn, { backgroundColor: bg }, (disabled || busy) && { opacity: 0.6 }, pressed && { opacity: 0.85 }]}>
      {busy ? <ActivityIndicator color={fg} size="small" /> : <Text style={[s.btnText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Banner({ ok, text }: { ok: boolean; text: string }) {
  const { s } = useOrgStyles();
  return <View accessibilityRole="alert" style={[s.banner, { backgroundColor: ok ? '#D1FAE5' : '#FEE2E2' }]}><Text style={{ color: ok ? '#065F46' : '#B91C1C', fontSize: typography.fontSize.sm }}>{text}</Text></View>;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    field: { marginBottom: spacing.md },
    label: { fontSize: typography.fontSize.xs, fontWeight: '700', color: c.neutral[600], marginBottom: 6 },
    input: { backgroundColor: c.neutral[50], borderRadius: radius.md, borderWidth: 1, borderColor: c.neutral[200], paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: typography.fontSize.base, color: c.dark },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    chip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: c.neutral[200], backgroundColor: '#fff' },
    chipText: { fontSize: typography.fontSize.sm, fontWeight: '600', color: c.dark },
    imgRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    thumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: c.neutral[100] },
    addThumb: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: c.neutral[300] },
    thumbX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
    kpi: { flexBasis: '47%', flexGrow: 1, backgroundColor: '#fff', borderRadius: radius.lg, borderWidth: 1, borderColor: c.neutral[100], padding: spacing.md },
    kpiLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: c.neutral[500], letterSpacing: 0.4 },
    kpiValue: { marginTop: 4, fontSize: typography.fontSize.lg, fontWeight: '800', color: c.dark },
    pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
    pillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    btn: { minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    btnText: { fontSize: typography.fontSize.sm, fontWeight: '700' },
    banner: { padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.md },
  });
}
