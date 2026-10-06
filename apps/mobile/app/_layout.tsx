import { Stack, router, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { Alert, View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { supabaseConfigured } from '@/lib/supabase';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ErrorBoundary as RootErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';
import { StateView } from '@/components/StateView';
import { LocaleProvider, useI18n, tr } from '@/lib/i18n';

/**
 * Erreur de rendu / de chargement d'un écran : expo-router affiche ce composant à la place. Comme il peut
 * s'afficher en dehors des fournisseurs (thème, langue), il n'utilise AUCUN contexte : styles fixes + tr().
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error('[route] erreur d’écran :', error);
  return (
    <View style={[styles.center, { backgroundColor: '#fff' }]} accessibilityRole="alert">
      <Text style={styles.title}>⚠️</Text>
      <Text style={styles.errTitle}>{tr('sys.routeErrTitle')}</Text>
      <Text style={styles.errText}>{__DEV__ ? `${error.name}: ${error.message}` : tr('sys.errNetwork')}</Text>
      <Pressable onPress={retry} accessibilityRole="button" style={styles.btn}><Text style={styles.btnText}>{tr('ui.retry')}</Text></Pressable>
      <Pressable onPress={() => { try { router.replace('/(tabs)/explore'); } catch { retry(); } }} accessibilityRole="button" style={styles.link}>
        <Text style={[styles.linkText, { color: '#111' }]}>{tr('sys.home')}</Text>
      </Pressable>
    </View>
  );
}

// Dernier filet de sécurité en production : une erreur dans un gestionnaire d'événement ne ferme plus l'app.
// (Les erreurs de rendu sont déjà gérées par les ErrorBoundary ; en développement on garde le LogBox.)
let lastAlertAt = 0;
if (!__DEV__) {
  const g = globalThis as any;
  const prev = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((e: unknown, isFatal?: boolean) => {
    console.error('[global]', isFatal ? 'fatal' : 'non fatal', (e as Error)?.message);
    if (Date.now() - lastAlertAt > 10_000) {
      lastAlertAt = Date.now();
      try { Alert.alert('Soutra-Playce', 'Une erreur est survenue. Vérifie ta connexion puis réessaie.'); } catch { prev?.(e, isFatal); }
    }
  });
}

function Splash() {
  const { t } = useI18n();
  return (
    <View style={[styles.center, { backgroundColor: '#FF6B1A' }]} accessibilityLabel={t('sys.checking')} accessibilityLiveRegion="polite">
      <ActivityIndicator color="#101828" size="large" />
    </View>
  );
}

function RootNav() {
  const { status, session, retry, continueWithoutSession } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { resolved, colors } = useTheme();
  const { t } = useI18n();

  useEffect(() => {
    if (status === 'checking' || status === 'error') return;
    const inAuth = segments[0] === '(auth)';
    if (status === 'unauthenticated' && !inAuth) router.replace('/(auth)/login');
    else if (status === 'authenticated' && inAuth) router.replace('/(tabs)/explore');
  }, [status, segments]);

  if (!supabaseConfigured) {
    return <View style={[styles.center, { backgroundColor: colors.light }]}><StateView kind="error" message={`${t('sys.cfgTitle')}\n${t('sys.cfgBody')}`} /></View>;
  }
  if (status === 'checking') return <Splash />;
  if (status === 'error' && !session) {
    return (
      <View style={[styles.center, { backgroundColor: colors.light }]}>
        <StateView kind="offline" message={t('sys.sessionErr')} onRetry={retry} />
        <Pressable onPress={continueWithoutSession} accessibilityRole="button" style={styles.link}><Text style={[styles.linkText, { color: colors.dark }]}>{t('sys.continue')}</Text></Pressable>
      </View>
    );
  }

  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.light } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <OfflineBanner />
    </>
  );
}

export default function RootLayout() {
  return (
    <RootErrorBoundary zone="root">
      <ThemeProvider>
        <LocaleProvider>
          <AuthProvider>
            <RootNav />
          </AuthProvider>
        </LocaleProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 40 },
  errTitle: { fontSize: 20, fontWeight: '800', color: '#111', marginTop: 8, textAlign: 'center' },
  errText: { fontSize: 14, color: '#444', textAlign: 'center', marginTop: 8, lineHeight: 20, maxWidth: 320 },
  btn: { marginTop: 16, minHeight: 44, paddingHorizontal: 28, borderRadius: 999, backgroundColor: '#FF6B1A', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#101828', fontWeight: '800', fontSize: 15 },
  link: { minHeight: 44, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontWeight: '700', fontSize: 15, textDecorationLine: 'underline' },
});
