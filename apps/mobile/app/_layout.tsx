import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function RootNav() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { resolved, colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/login');
    else if (session && inAuth) router.replace('/(tabs)/explore');
  }, [session, loading, segments]);

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
    <ErrorBoundary zone="root">
      <ThemeProvider>
        <AuthProvider>
          <RootNav />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
