// ============================================================================
// notifications-settings — écran des préférences de notifications push.
//
// Pattern visuel cohérent avec settings.tsx (Switch + Row). Le helper
// is_notification_enabled côté send-push lit ces préférences avant chaque envoi.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView, View, Text, Switch, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { typography, radius, spacing, type ColorPalette } from '@soutra/shared';
import { useColors } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  getMyNotificationPreferences, updateNotificationPreferences,
  NOTIFICATION_PREF_META,
  type NotificationPreferences, type NotificationPrefKey,
} from '@/lib/notification-prefs';

export default function NotificationsSettings() {
  const c = useColors();
  const s = useMemo(() => makeStyles(c), [c]);

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<NotificationPrefKey | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await getMyNotificationPreferences();
      setPrefs(p);
    } catch (err: any) {
      Alert.alert('Chargement impossible', err?.message ?? 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (key: NotificationPrefKey, value: boolean) => {
    if (!prefs) return;
    setSavingKey(key);
    // Optimistic update
    setPrefs({ ...prefs, [key]: value });
    try {
      const updated = await updateNotificationPreferences({ [key]: value });
      setPrefs(updated);
    } catch (err: any) {
      // Rollback
      setPrefs(prefs);
      Alert.alert('Erreur', err?.message ?? 'Impossible d\'enregistrer.');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <ScreenHeader title="Notifications" />
        <ActivityIndicator size="large" color={c.primary[500]} style={{ flex: 1, marginTop: spacing.xl }} />
      </SafeAreaView>
    );
  }

  const keys: NotificationPrefKey[] = [
    'new_reservation',
    'payment_received',
    'payout_settled',
    'revenue_milestone',
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader
        title="Notifications"
        subtitle="Choisis quels events tu veux recevoir"
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['2xl'] }}>
        <View style={s.infoCard}>
          <Text style={s.infoText}>
            Ces préférences s'appliquent aux notifications business côté gérant.
            Les messages personnels (chats, transferts, matches…) restent toujours actifs.
          </Text>
        </View>

        <Text style={s.sectionTitle}>Espace gérant</Text>
        <View style={s.group}>
          {keys.map((key, idx) => {
            const meta = NOTIFICATION_PREF_META[key];
            return (
              <View key={key} style={[s.row, idx < keys.length - 1 && s.rowBorder]}>
                <Text style={s.rowEmoji}>{meta.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>{meta.label}</Text>
                  <Text style={s.rowDesc}>{meta.description}</Text>
                </View>
                {savingKey === key ? (
                  <ActivityIndicator size="small" color={c.primary[500]} />
                ) : (
                  <Switch
                    value={prefs?.[key] ?? true}
                    onValueChange={(v) => toggle(key, v)}
                    trackColor={{ true: c.primary[500], false: c.neutral[300] }}
                  />
                )}
              </View>
            );
          })}
        </View>

        <Text style={s.footer}>
          Tu peux modifier ces préférences à tout moment. Les changements
          prennent effet immédiatement sur tes appareils enregistrés.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.light },
    infoCard: {
      backgroundColor: c.primary[50],
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
      borderWidth: 1, borderColor: c.primary[200],
    },
    infoText: { fontSize: typography.fontSize.xs, color: c.primary[700], lineHeight: 18 },
    sectionTitle: {
      marginTop: spacing.lg, marginBottom: spacing.sm,
      fontSize: typography.fontSize.sm, fontWeight: '700',
      color: c.neutral[500], textTransform: 'uppercase', letterSpacing: 0.3,
    },
    group: {
      backgroundColor: c.light,
      borderRadius: radius.lg,
      borderWidth: 1, borderColor: c.neutral[200],
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      padding: spacing.md,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: c.neutral[100] },
    rowEmoji: { fontSize: 24, width: 32, textAlign: 'center' },
    rowLabel: { fontSize: typography.fontSize.sm, fontWeight: '700', color: c.dark },
    rowDesc: { fontSize: typography.fontSize.xs, color: c.neutral[600], marginTop: 2, lineHeight: 16 },
    footer: {
      marginTop: spacing.xl, fontSize: typography.fontSize.xs,
      color: c.neutral[500], textAlign: 'center', lineHeight: 17,
    },
  });
}
