import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { AccessibilityProvider, useAccessibilityMode } from '@/lib/accessibility';

function RootNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { resolved, colors } = useTheme();
  const { enabled: accessibility, hydrated: accessibilityHydrated } = useAccessibilityMode();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/login');
    else if (session && inAuth) {
      // Mode accessibilité : on ouvre direct Sia en mode vocal au lieu du home.
      // Sinon : explore par défaut (UX historique).
      if (accessibility && accessibilityHydrated) {
        router.replace('/assistant?voice=1');
      } else {
        router.replace('/(tabs)/explore');
      }
    }
  }, [session, loading, segments, accessibility, accessibilityHydrated]);

  return (
    <>
      {/* Inverse la barre système selon le thème actif. */}
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.light },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AccessibilityProvider>
          <RootNav />
        </AccessibilityProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
