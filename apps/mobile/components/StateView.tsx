import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

type Kind = 'loading' | 'error' | 'empty' | 'offline';

/** États standard d'un écran : chargement, erreur (avec « Réessayer »), vide, hors connexion. Jamais d'écran blanc. */
export function StateView({ kind, message, onRetry }: { kind: Kind; message?: string; onRetry?: () => void }) {
  const c = useColors();
  const { t } = useI18n();
  const icon = kind === 'offline' ? 'cloud-offline-outline' : kind === 'error' ? 'alert-circle-outline' : 'file-tray-outline';
  const text = message ?? (kind === 'loading' ? t('sys.loading') : kind === 'offline' ? t('sys.offline') : kind === 'error' ? t('sys.errNetwork') : t('sys.empty'));
  return (
    <View style={s.box} accessibilityRole={kind === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
      {kind === 'loading' ? <ActivityIndicator color={c.primary[500]} /> : <Ionicons name={icon as any} size={40} color={c.neutral[500]} />}
      <Text style={[s.text, { color: c.neutral[700] }]}>{text}</Text>
      {onRetry && kind !== 'loading' && kind !== 'empty' && (
        <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [s.btn, { backgroundColor: c.primary[500] }, pressed && { opacity: 0.85 }]}>
          <Text style={s.btnText}>{t('ui.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  text: { fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 320 },
  btn: { minHeight: 44, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#101828', fontWeight: '800', fontSize: 15 },
});
