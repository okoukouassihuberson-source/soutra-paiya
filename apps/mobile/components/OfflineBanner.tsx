import { useEffect, useRef, useState } from 'react';
import { Animated, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnectivity } from '@/lib/net';
import { useI18n } from '@/lib/i18n';

/** Bandeau discret : « Hors connexion » / « Connexion faible », puis « Connexion rétablie » 2 s. Ne bloque jamais l'écran. */
export function OfflineBanner() {
  const c = useConnectivity();
  const { t } = useI18n();
  const [showBack, setShowBack] = useState(false);
  const prev = useRef(c);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (prev.current === 'offline' && c !== 'offline') { setShowBack(true); timer = setTimeout(() => setShowBack(false), 2000); }
    prev.current = c;
    if (c === 'offline') AccessibilityInfo.announceForAccessibility?.(t('sys.offline'));
    return () => { if (timer) clearTimeout(timer); };
  }, [c, t]);
  const text = c === 'offline' ? `${t('sys.offline')} · ${t('sys.offlineHint')}` : c === 'weak' ? t('sys.weak') : showBack ? t('sys.back') : null;
  if (!text) return null;
  const bg = c === 'offline' ? '#7F1D1D' : c === 'weak' ? '#92400E' : '#065F46';
  return (
    <SafeAreaView edges={['bottom']} pointerEvents="none" style={styles.wrap}>
      <Animated.View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.pill, { backgroundColor: bg }]}>
        <Text style={styles.text} numberOfLines={2}>{text}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 64, alignItems: 'center', paddingHorizontal: 16 },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 420 },
  text: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
