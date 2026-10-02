import { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, radius, spacing } from '@soutra/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useI18n, useSetLocale, LOCALES } from '@/lib/i18n';
import {
  hasPaymentPin,
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled as persistBiometric,
} from '@/lib/security';

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { t, locale } = useI18n();
  const setLocale = useSetLocale();

  const [fullName, setFullName] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);

  const phone = user?.phone ? `+${user.phone.replace(/^\+/, '')}` : '';

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [profileRes, pin, bioAvail, bioOn] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      hasPaymentPin(),
      isBiometricAvailable(),
      isBiometricEnabled(),
    ]);
    setFullName((profileRes.data as any)?.full_name || '');
    setHasPin(pin);
    setBioAvailable(bioAvail);
    setBioEnabled(bioOn);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleBiometric = async (value: boolean) => {
    if (value && !hasPin) {
      Alert.alert(t('settingsScreen.pinReqTitle'), t('settingsScreen.pinReqBody'));
      return;
    }
    setBioEnabled(value);
    await persistBiometric(value);
  };

  const confirmSignOut = () => {
    Alert.alert(t('settingsScreen.signOutTitle'), t('settingsScreen.signOutBody'), [
      { text: t('settingsScreen.cancel'), style: 'cancel' },
      { text: t('settingsScreen.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </Pressable>
        <Text style={s.headerTitle}>{t('settingsScreen.title')}</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {(fullName || phone || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{fullName || t('settingsScreen.myAccount')}</Text>
            <Text style={s.profilePhone}>{phone}</Text>
          </View>
        </View>

        <Text style={s.section}>{t('lang.title')}</Text>
        <View style={s.group}>
          {LOCALES.map((l, i) => (
            <Pressable key={l} style={({ pressed }) => [s.row, i < LOCALES.length - 1 && s.rowBorder, pressed && { opacity: 0.6 }]}
                       onPress={() => setLocale(l)} accessibilityRole="radio" accessibilityState={{ selected: locale === l }}>
              <Ionicons name="language-outline" size={22} color={colors.neutral[600]} />
              <Text style={[s.rowLabel, { flex: 1 }]}>{t(l === 'fr' ? 'lang.fr' : 'lang.en')}</Text>
              {locale === l && <Ionicons name="checkmark" size={20} color={colors.primary[500]} />}
            </Pressable>
          ))}
          {locale === 'en' && <Text style={[s.rowHint, { padding: spacing.md }]}>{t('lang.hint')}</Text>}
        </View>

        <Text style={s.section}>{t('settingsScreen.account')}</Text>
        <View style={s.group}>
          <Row
            icon="person-outline"
            label={t('settingsScreen.profile')}
            onPress={() => router.push('/profile-edit')}
          />
          <Row
            icon="shield-checkmark-outline"
            label={t('settingsScreen.kyc')}
            onPress={() => router.push('/kyc')}
            last
          />
        </View>

        <Text style={s.section}>{t('settingsScreen.security')}</Text>
        <View style={s.group}>
          <Row
            icon="keypad-outline"
            label={t('settingsScreen.pin')}
            value={hasPin ? t('settingsScreen.pinOn') : t('settingsScreen.pinOff')}
            onPress={() => router.push('/security-pin')}
          />
          <View style={s.row}>
            <Ionicons name="finger-print-outline" size={22} color={colors.neutral[600]} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>{t('settingsScreen.bio')}</Text>
              {!bioAvailable && (
                <Text style={s.rowHint}>{t('settingsScreen.bioNA')}</Text>
              )}
              {bioAvailable && !hasPin && (
                <Text style={s.rowHint}>{t('settingsScreen.bioNeedPin')}</Text>
              )}
            </View>
            <Switch
              value={bioEnabled}
              onValueChange={toggleBiometric}
              disabled={!bioAvailable || !hasPin}
              trackColor={{ true: colors.primary[500], false: colors.neutral[300] }}
            />
          </View>
          <Row
            icon="lock-closed-outline"
            label={t('settingsScreen.changePw')}
            onPress={() => router.push('/change-password')}
            last
          />
        </View>

        <View style={[s.group, { marginTop: spacing.xl }]}>
          <Pressable
            style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
            onPress={confirmSignOut}
          >
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
            <Text style={[s.rowLabel, { color: colors.danger, flex: 1 }]}>
              {t('settingsScreen.signOut')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, !last && s.rowBorder, pressed && { opacity: 0.6 }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={22} color={colors.neutral[600]} />
      <Text style={[s.rowLabel, { flex: 1 }]}>{label}</Text>
      {!!value && <Text style={s.rowValue}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.neutral[400]} />
    </Pressable>
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    padding: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: typography.fontSize.lg, fontWeight: '700' },
  profileName: { fontSize: typography.fontSize.base, fontWeight: '700', color: colors.dark },
  profilePhone: { fontSize: typography.fontSize.sm, color: colors.neutral[500], marginTop: 2 },
  section: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.neutral[500],
    textTransform: 'uppercase',
  },
  group: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.neutral[100] },
  rowLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', color: colors.dark },
  rowHint: { fontSize: typography.fontSize.xs, color: colors.neutral[500], marginTop: 2 },
  rowValue: { fontSize: typography.fontSize.sm, color: colors.neutral[500] },
});
